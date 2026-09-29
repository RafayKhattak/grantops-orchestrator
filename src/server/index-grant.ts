import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/http";
import { chunkPages } from "@/lib/domain/chunking";
import { parseVector } from "@/lib/domain/cosine";
import type { Embedder } from "@/lib/domain/embeddings";
import { defaultEmbedder } from "@/server/embeddings";
import { requireGrant } from "@/server/scope";
import { transitionGrant } from "@/server/transitions";

export async function loadEmbeddedChunks(grantId: string, organizationId: string) {
  const rows = await prisma.documentChunk.findMany({
    where: {
      embedding: { not: null },
      embeddingModel: { not: null },
      document: { grant: { id: grantId, organizationId } },
    },
    include: { document: { select: { id: true, fileName: true } } },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
  });

  return rows.flatMap((row) => {
    if (!row.embedding || !row.embeddingModel) return [];
    return [
      {
        id: row.id,
        documentId: row.document.id,
        fileName: row.document.fileName,
        pageStart: row.pageStart,
        pageEnd: row.pageEnd,
        content: row.content,
        embeddingModel: row.embeddingModel,
        embedding: parseVector(row.embedding),
      },
    ];
  });
}

function pagesFromStoredText(raw: string): { pageNumber: number; text: string }[] {
  return [...raw.matchAll(/--- page (\d+) ---\n([\s\S]*?)(?=\n--- page \d+ ---|$)/g)].map((match) => ({
    pageNumber: Number(match[1]),
    text: match[2].trim(),
  }));
}

async function splitChunksOntoSinglePages(grantId: string): Promise<void> {
  const documents = await prisma.document.findMany({
    where: { grantId },
    include: { chunks: true },
  });
  for (const document of documents) {
    if (document.chunks.length > 0 && document.chunks.every((chunk) => chunk.pageStart === chunk.pageEnd)) {
      continue;
    }
    const chunks = chunkPages(pagesFromStoredText(document.rawText));
    if (chunks.length === 0) continue;
    await prisma.$transaction([
      prisma.documentChunk.deleteMany({ where: { documentId: document.id } }),
      prisma.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId: document.id,
          content: chunk.content,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          chunkIndex: chunk.chunkIndex,
          wordCount: chunk.wordCount,
        })),
      }),
    ]);
  }
}

export async function embedGrant(grantId: string, embedder: Embedder = defaultEmbedder) {
  await splitChunksOntoSinglePages(grantId);
  const scoped = await requireGrant(grantId);
  let grant = scoped.grant;
  if (grant.status !== "UPLOADED" && grant.status !== "PROCESSING" && grant.status !== "RAG_READY") {
    throw new AppError("The retrieval index can only be built before review.", 409, "INVALID_TRANSITION");
  }

  if (grant.status === "UPLOADED") {
    const count = await prisma.documentChunk.count({ where: { document: { grantId: grant.id } } });
    if (count === 0) throw new AppError("This grant has no extracted passages.", 409, "NO_CHUNKS");
    await prisma.$transaction((tx) =>
      transitionGrant(tx, grant, "PROCESSING", "Indexing started."),
    );
    grant = { ...grant, status: "PROCESSING" };
  }

  const rows = await prisma.documentChunk.findMany({
    where: { document: { grantId: grant.id, grant: { organizationId: scoped.organization.id } } },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
  });
  if (rows.length === 0) throw new AppError("This grant has no extracted passages.", 409, "NO_CHUNKS");

  const missing = rows.filter((row) => !row.embedding);
  const existing = rows.find((row) => row.embedding && row.embeddingModel);
  const models = new Set(rows.flatMap((row) => (row.embeddingModel ? [row.embeddingModel] : [])));
  if (models.size > 1) {
    throw new AppError(
      "This grant mixes embedding models. Start a new project and upload the PDF again.",
      409,
      "MODEL_MISMATCH",
    );
  }

  if (missing.length === 0) {
    const model = existing?.embeddingModel ?? "unknown";
    if (grant.status === "PROCESSING") {
      await prisma.$transaction((tx) =>
        transitionGrant(tx, grant, "RAG_READY", `Retrieval index is ready (${model}).`),
      );
    }
    return { model, embedded: 0, total: rows.length };
  }

  const batch = await embedder(
    missing.map((row) => row.content),
    "document",
    existing?.embeddingModel ? { model: existing.embeddingModel } : undefined,
  );
  if (batch.vectors.length !== missing.length) {
    throw new AppError("The embedder returned the wrong number of vectors.", 502, "EMBEDDINGS");
  }
  const dimension = batch.vectors[0]?.length ?? 0;
  if (dimension === 0 || batch.vectors.some((vector) => vector.length !== dimension)) {
    throw new AppError("Embedding dimensions are inconsistent.", 502, "EMBEDDINGS");
  }
  if (existing?.embeddingDim && existing.embeddingDim !== dimension) {
    throw new AppError("New vectors do not match the stored embedding size.", 409, "MODEL_MISMATCH");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const [index, row] of missing.entries()) {
        await tx.documentChunk.update({
          where: { id: row.id },
          data: {
            embedding: JSON.stringify(batch.vectors[index]),
            embeddingModel: batch.model,
            embeddingDim: dimension,
          },
        });
      }
      const remaining = await tx.documentChunk.count({
        where: { document: { grantId: grant.id }, embedding: null },
      });
      if (remaining === 0 && grant.status === "PROCESSING") {
        await transitionGrant(
          tx,
          grant,
          "RAG_READY",
          `Embedded ${missing.length} passages with ${batch.model}.`,
        );
      }
    },
    { timeout: 20_000 },
  );

  return { model: batch.model, embedded: missing.length, total: rows.length };
}
