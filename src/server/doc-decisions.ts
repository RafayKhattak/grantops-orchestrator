import "server-only";
import { FactCheckRejected } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { commentOnDoc, listDocComments, pullGoogleDocText } from "@/server/google-docs";
import { approveDraftInOrg, exportGrantInOrg, rejectDraftInOrg } from "@/server/review";

function decisionFrom(content: string): { kind: "approved" } | { kind: "rejected"; reason: string } | null {
  if (/^\s*approved\.?\s*$/i.test(content)) return { kind: "approved" };
  const rejected = content.match(/^\s*rejected\b[:\-]?\s*(.*)$/i);
  if (!rejected) return null;
  return { kind: "rejected", reason: rejected[1]?.trim() || "Rejected in Google Docs." };
}

let deciding = false;

export async function syncDocDecisions(): Promise<void> {
  if (process.env.GRANTOPS_TEST === "1" || process.env.VITEST === "true" || deciding) return;
  deciding = true;
  try {
    await readDocDecisions();
  } finally {
    deciding = false;
  }
}

async function readDocDecisions(): Promise<void> {
  const drafts = await prisma.grantDraft.findMany({
    where: {
      status: "PENDING_REVIEW",
      googleDocId: { not: null },
      grant: { status: "PENDING_HUMAN_REVIEW" },
    },
    include: { grant: true },
  });
  for (const draft of drafts) {
    if (!draft.googleDocId) continue;
    const comments = await listDocComments(draft.googleDocId);
    const latest = [...comments].sort((left, right) =>
      (right.createdTime ?? "").localeCompare(left.createdTime ?? ""),
    )[0];
    if (!latest || latest.id === draft.reviewSignalId) continue;
    const decision = decisionFrom(latest.content);
    if (!decision) continue;
    await prisma.grantDraft.update({
      where: { id: draft.id },
      data: { reviewSignalId: latest.id },
    });
    if (decision.kind === "rejected") {
      await rejectDraftInOrg(draft.grant.organizationId, draft.grantId, draft.id, decision.reason);
      continue;
    }
    const text = (await pullGoogleDocText(draft.googleDocId)).trim();
    try {
      await approveDraftInOrg(draft.grant.organizationId, draft.grantId, draft.id, text);
      await exportGrantInOrg(draft.grant.organizationId, draft.grantId);
    } catch (error) {
      const message = error instanceof FactCheckRejected ? error.message : "The draft could not be approved.";
      await commentOnDoc(draft.googleDocId, `Not approved. ${message}`).catch(() => undefined);
    }
  }
}
