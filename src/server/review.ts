import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError, FactCheckRejected, publicErrorText } from "@/lib/http";
import { factCheckDraft } from "@/lib/domain/citations";
import { renderExportMarkdown } from "@/lib/domain/markdown";
import { withRecordCheck } from "@/server/client-records";
import { publishGoogleDoc } from "@/server/google-docs";
import { requireGrant } from "@/server/scope";
import { readRetrieval } from "@/server/snapshot";
import { removeStorage, writeStorage } from "@/server/storage";
import { transitionGrant } from "@/server/transitions";

async function openDraft(grantId: string, draftId: string) {
  const scoped = await requireGrant(grantId);
  if (scoped.grant.status !== "PENDING_HUMAN_REVIEW") {
    throw new AppError("This grant is not waiting for review.", 409, "INVALID_TRANSITION");
  }
  const draft = await prisma.grantDraft.findFirst({ where: { id: draftId, grantId } });
  if (!draft || draft.status !== "PENDING_REVIEW") {
    throw new AppError("That draft is not open for review.", 409, "NO_DRAFT");
  }
  return { ...scoped, draft };
}

export async function saveDraft(grantId: string, draftId: string, content: string) {
  const { organization } = await openDraft(grantId, draftId);
  return saveDraftInOrg(organization.id, grantId, draftId, content);
}

async function saveDraftInOrg(organizationId: string, grantId: string, draftId: string, content: string) {
  const grant = await prisma.grantProject.findFirst({ where: { id: grantId, organizationId } });
  if (!grant || grant.status !== "PENDING_HUMAN_REVIEW") {
    throw new AppError("This grant is not waiting for review.", 409, "INVALID_TRANSITION");
  }
  const draft = await prisma.grantDraft.findFirst({ where: { id: draftId, grantId } });
  if (!draft || draft.status !== "PENDING_REVIEW") {
    throw new AppError("That draft is not open for review.", 409, "NO_DRAFT");
  }
  const retrieval = readRetrieval(draft.citationsJson);
  const fact = factCheckDraft(content, retrieval.chunks);
  const saved = await prisma.grantDraft.updateMany({
    where: { id: draftId, grantId, status: "PENDING_REVIEW" },
    data: { editedContent: content, factCheckJson: JSON.stringify(fact) },
  });
  if (saved.count !== 1) {
    throw new AppError("The draft changed. Refresh and try again.", 409, "CONFLICT");
  }
  return fact;
}

export async function approveDraft(grantId: string, draftId: string, content: string) {
  const { organization } = await requireGrant(grantId);
  return approveDraftInOrg(organization.id, grantId, draftId, content);
}

export async function approveDraftInOrg(
  organizationId: string,
  grantId: string,
  draftId: string,
  content: string,
) {
  const owned = await prisma.grantProject.findFirst({ where: { id: grantId, organizationId } });
  if (!owned) throw new AppError("Grant not found.", 404, "NOT_FOUND");
  const base = await saveDraftInOrg(organizationId, grantId, draftId, content);
  const fact = await withRecordCheck(organizationId, content, base);
  await prisma.grantDraft.updateMany({
    where: { id: draftId, grantId, status: "PENDING_REVIEW" },
    data: { factCheckJson: JSON.stringify(fact) },
  });
  if (!fact.passed) throw new FactCheckRejected(fact);

  await prisma.$transaction(async (tx) => {
    const current = await tx.grantProject.findFirst({
      where: { id: grantId, organizationId },
    });
    if (!current || current.status !== "PENDING_HUMAN_REVIEW") {
      throw new AppError("This grant is not waiting for review.", 409, "CONFLICT");
    }
    const updated = await tx.grantDraft.updateMany({
      where: { id: draftId, grantId, status: "PENDING_REVIEW", editedContent: content },
      data: { status: "APPROVED" },
    });
    if (updated.count !== 1) {
      throw new AppError("The draft changed. Refresh and try again.", 409, "CONFLICT");
    }
    await transitionGrant(
      tx,
      { id: grantId, status: "PENDING_HUMAN_REVIEW" },
      "APPROVED",
      "Reviewer approved the draft.",
    );
  });
  return fact;
}

export async function rejectDraft(grantId: string, draftId: string, reason: string) {
  const { organization } = await openDraft(grantId, draftId);
  return rejectDraftInOrg(organization.id, grantId, draftId, reason);
}

export async function rejectDraftInOrg(
  organizationId: string,
  grantId: string,
  draftId: string,
  reason: string,
) {
  const grant = await prisma.grantProject.findFirst({ where: { id: grantId, organizationId } });
  if (!grant || grant.status !== "PENDING_HUMAN_REVIEW") {
    throw new AppError("This grant is not waiting for review.", 409, "INVALID_TRANSITION");
  }
  await prisma.$transaction(async (tx) => {
    const current = await tx.grantProject.findFirst({
      where: { id: grantId, organizationId },
    });
    if (!current || current.status !== "PENDING_HUMAN_REVIEW") {
      throw new AppError("This grant is not waiting for review.", 409, "CONFLICT");
    }
    const updated = await tx.grantDraft.updateMany({
      where: { id: draftId, grantId, status: "PENDING_REVIEW" },
      data: { status: "REJECTED" },
    });
    if (updated.count !== 1) {
      throw new AppError("The draft changed. Refresh and try again.", 409, "CONFLICT");
    }
    await transitionGrant(
      tx,
      { id: grantId, status: "PENDING_HUMAN_REVIEW" },
      "RAG_READY",
      reason,
    );
  });
}

export async function exportGrant(grantId: string) {
  const { organization } = await requireGrant(grantId);
  return exportGrantInOrg(organization.id, grantId);
}

export async function exportGrantInOrg(organizationId: string, grantId: string) {
  const grant = await prisma.grantProject.findFirst({ where: { id: grantId, organizationId } });
  if (!grant) throw new AppError("Grant not found.", 404, "NOT_FOUND");
  if (grant.status !== "APPROVED") {
    throw new AppError("Approve the draft before export.", 409, "INVALID_TRANSITION");
  }
  const draft = await prisma.grantDraft.findFirst({
    where: { grantId, status: "APPROVED" },
    orderBy: { version: "desc" },
  });
  if (!draft) throw new AppError("No approved draft is on file.", 409, "NO_DRAFT");

  const body = (draft.editedContent ?? draft.content).trim();
  const retrieval = readRetrieval(draft.citationsJson);
  const markdown = renderExportMarkdown({
    title: grant.title,
    funder: grant.funder,
    body,
    retrieval: retrieval.chunks,
  });
  const relativePath = ["exports", organizationId, grant.id, `${randomUUID()}.md`].join("/");
  await writeStorage(relativePath, markdown);

  let externalUrl: string | null = draft.googleDocUrl;
  let provider = draft.googleDocUrl ? "google" : "local";
  try {
    if (!externalUrl) {
      const googleDoc = await publishGoogleDoc({ title: grant.title, body: markdown });
      if (googleDoc) {
        provider = "google";
        externalUrl = googleDoc.url;
      }
    }
    const artifact = await prisma.$transaction(async (tx) => {
      const current = await tx.grantProject.findFirst({
        where: { id: grantId, organizationId, status: "APPROVED" },
      });
      if (!current) throw new AppError("This grant is not approved.", 409, "CONFLICT");
      const created = await tx.exportArtifact.create({
        data: {
          grantId,
          draftId: draft.id,
          format: "markdown",
          storagePath: relativePath,
          provider,
          externalUrl,
        },
      });
      await transitionGrant(
        tx,
        { id: grantId, status: "APPROVED" },
        "EXPORTED",
        provider === "google"
          ? "Exported to Google Docs and the local workspace."
          : "Exported a Markdown file to the local workspace.",
      );
      return created;
    });
    return { id: artifact.id, provider, externalUrl };
  } catch (error) {
    await removeStorage(relativePath).catch(() => undefined);
    if (externalUrl) {
      console.error("Google document was created but the grant was not marked exported.", externalUrl);
    }
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? publicErrorText(error.message) : "Export failed.";
    throw new AppError(message, 500, "EXPORT");
  }
}
