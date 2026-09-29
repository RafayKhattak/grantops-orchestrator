import { notFound } from "next/navigation";
import { GrantWorkspaceView } from "@/components/grant-workspace";
import { AppError } from "@/lib/http";
import type { GrantWorkspace } from "@/lib/domain/workspace";
import { listDocComments } from "@/server/google-docs";
import { getGrantWorkspace } from "@/server/queries";

async function loadWorkspace(id: string): Promise<GrantWorkspace | null> {
  try {
    return await getGrantWorkspace(id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return null;
    throw error;
  }
}

export default async function GrantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await loadWorkspace(id);
  if (!workspace) notFound();
  const docId = workspace.drafts.find((draft) => draft.googleDocId)?.googleDocId;
  const comments = docId ? await listDocComments(docId).catch(() => []) : [];
  return (
    <GrantWorkspaceView
      key={`${workspace.status}:${workspace.drafts[0]?.id ?? "none"}`}
      workspace={workspace}
      comments={comments}
    />
  );
}
