import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError, publicErrorText } from "@/lib/http";
import { factCheckDraft } from "@/lib/domain/citations";
import type { Drafter, Embedder } from "@/lib/domain/embeddings";
import { buildDraftUserMessage, GRANT_WRITER_SYSTEM_PROMPT } from "@/lib/domain/prompt";
import { rankChunks } from "@/lib/domain/retrieval";
import { DRAFT_TEMPERATURE, draftBlockReason, STALE_DRAFT_MS, TOP_K } from "@/lib/domain/status";
import type { RetrievalSnapshot } from "@/lib/domain/workspace";
import { createReviewDocument } from "@/server/google-docs";
import { defaultEmbedder, draftWithGroq } from "@/server/embeddings";
import { embedGrant, loadEmbeddedChunks } from "@/server/index-grant";
import { requireGrant } from "@/server/scope";
import { transitionGrant } from "@/server/transitions";

const defaultDrafter: Drafter = (input) => draftWithGroq(input);

export async function runDraftAgent(
  grantId: string,
  prompt: string,
  deps: { embedder?: Embedder; drafter?: Drafter } = {},
) {
  const embedder = deps.embedder ?? defaultEmbedder;
  const drafter = deps.drafter ?? defaultDrafter;
  const initial = await requireGrant(grantId);
  const organization = initial.organization;
  let grant = initial.grant;

  const blocked = draftBlockReason(grant.status);
  if (blocked) throw new AppError(blocked, 409, "INVALID_TRANSITION");

  if (grant.status === "DRAFTING") {
    const age = Date.now() - grant.updatedAt.getTime();
    if (age < STALE_DRAFT_MS) {
      throw new AppError("A draft is already running.", 409, "DRAFT_IN_PROGRESS");
    }
    await prisma.$transaction((tx) =>
      transitionGrant(tx, grant, "RAG_READY", "Released a stale drafting lock."),
    );
    grant = { ...grant, status: "RAG_READY" };
  }

  let index = { model: "none", embedded: 0, total: 0 };
  if (grant.status === "UPLOADED" || grant.status === "PROCESSING" || grant.status === "RAG_READY") {
    index = await embedGrant(grantId, embedder);
    grant = (await requireGrant(grantId)).grant;
  }

  if (grant.status !== "RAG_READY") {
    throw new AppError(draftBlockReason(grant.status) ?? "The retrieval index is not ready.", 409, "INVALID_TRANSITION");
  }

  await prisma.agentRun.updateMany({
    where: {
      grantId,
      status: "RUNNING",
      updatedAt: { lt: new Date(Date.now() - STALE_DRAFT_MS) },
    },
    data: { status: "FAILED", error: "Marked failed because the run went stale." },
  });

  await prisma.$transaction((tx) =>
    transitionGrant(tx, grant, "DRAFTING", "Drafting agent started."),
  );

  const run = await prisma.agentRun.create({
    data: { grantId, prompt, status: "RUNNING" },
  });

  let ordinal = 0;
  const step = async (name: string, status: string, detail: string) => {
    ordinal += 1;
    await prisma.agentStep.create({
      data: {
        runId: run.id,
        ordinal,
        name,
        status,
        detail: detail.slice(0, 1000),
      },
    });
  };

  try {
    await step("load_grant", "SUCCEEDED", `Loaded ${grant.title}.`);
    await step(
      "embed",
      "SUCCEEDED",
      `Index uses ${index.model}. ${index.embedded} new vectors, ${index.total} passages.`,
    );

    const chunks = await loadEmbeddedChunks(grantId, organization.id);
    if (chunks.length === 0) {
      throw new AppError("The index has no vectors for this grant.", 409, "NO_RETRIEVAL");
    }
    const models = new Set(chunks.map((chunk) => chunk.embeddingModel));
    if (models.size !== 1) {
      throw new AppError("This grant mixes embedding models.", 409, "MODEL_MISMATCH");
    }
    const model = chunks[0].embeddingModel;
    const query = await embedder([prompt], "query", { model });
    const queryVector = query.vectors[0];
    if (!queryVector || query.model !== model || queryVector.length !== chunks[0].embedding.length) {
      throw new AppError(
        `The query was embedded with ${query.model}, but the index uses ${model}.`,
        409,
        "MODEL_MISMATCH",
      );
    }
    const ranked = rankChunks({ model, embedding: queryVector }, chunks, TOP_K);
    if (ranked.length === 0) {
      throw new AppError("No passages were eligible for retrieval.", 409, "NO_RETRIEVAL");
    }
    await step(
      "retrieve",
      "SUCCEEDED",
      `Selected ${ranked.length} passages. Top similarity ${ranked[0].score.toFixed(3)}.`,
    );

    const snapshot: RetrievalSnapshot = {
      model,
      chunks: ranked.map((item) => ({
        chunkId: item.chunk.id,
        documentId: item.chunk.documentId,
        fileName: item.chunk.fileName,
        pageStart: item.chunk.pageStart,
        pageEnd: item.chunk.pageEnd,
        content: item.chunk.content,
        score: item.score,
      })),
    };
    const drafted = await drafter({
      system: GRANT_WRITER_SYSTEM_PROMPT,
      user: buildDraftUserMessage(prompt, snapshot.chunks),
      temperature: DRAFT_TEMPERATURE,
    });
    const text = drafted.text.trim();
    if (!text) throw new AppError("The model returned an empty draft.", 502, "EMPTY_DRAFT");
    await step("generate", "SUCCEEDED", `${drafted.model} returned ${text.length} characters.`);

    const fact = factCheckDraft(text, snapshot.chunks);
    await step(
      "fact_check",
      "SUCCEEDED",
      fact.passed ? "Citations match the retrieved pages." : fact.blockingReasons.join(" "),
    );

    const draft = await prisma.$transaction(async (tx) => {
      const aggregate = await tx.grantDraft.aggregate({
        where: { grantId },
        _max: { version: true },
      });
      const version = (aggregate._max.version ?? 0) + 1;
      const created = await tx.grantDraft.create({
        data: {
          grantId,
          version,
          prompt,
          content: text,
          status: "PENDING_REVIEW",
          model: drafted.model,
          temperature: DRAFT_TEMPERATURE,
          citationsJson: JSON.stringify(snapshot),
          factCheckJson: JSON.stringify(fact),
        },
      });
      const current = await tx.grantProject.findFirst({
        where: { id: grantId, organizationId: organization.id },
      });
      if (!current || current.status !== "DRAFTING") {
        throw new AppError("The drafting lock was lost.", 409, "CONFLICT");
      }
      await transitionGrant(
        tx,
        { id: grantId, status: "DRAFTING" },
        "PENDING_HUMAN_REVIEW",
        `Draft v${version} is waiting for review.`,
      );
      await tx.agentRun.update({
        where: { id: run.id },
        data: { status: "WAITING_FOR_HUMAN", model: drafted.model, draftId: created.id },
      });
      return created;
    });

    let reviewNote = "Review stays in GrantOps until a Google account is connected.";
    try {
      const doc = await createReviewDocument({
        title: `${grant.title} draft v${draft.version}`,
        body: text,
      });
      if (doc) {
        await prisma.grantDraft.update({
          where: { id: draft.id },
          data: { googleDocId: doc.documentId, googleDocUrl: doc.url },
        });
        reviewNote = "A Google Doc is ready for comments.";
      }
    } catch (docError) {
      reviewNote = docError instanceof Error ? docError.message : "The Google Doc was not created.";
    }
    await step("stop_for_review", "SUCCEEDED", `Draft version ${draft.version} is waiting for a person. ${reviewNote}`);
    return { draftId: draft.id, version: draft.version, factCheck: fact };
  } catch (error) {
    const message = error instanceof Error ? publicErrorText(error.message) : "Draft failed.";
    const latest = await prisma.grantProject.findFirst({
      where: { id: grantId, organizationId: organization.id },
    });
    if (latest?.status === "DRAFTING") {
      await prisma.$transaction((tx) =>
        transitionGrant(
          tx,
          { id: grantId, status: "DRAFTING" },
          "RAG_READY",
          "Draft failed and the grant returned to the index.",
        ),
      );
    }
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message },
    });
    throw error instanceof AppError ? error : new AppError(message, 502, "DRAFT");
  }
}
