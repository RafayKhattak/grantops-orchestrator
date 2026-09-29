import { json, toErrorResponse, AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { pullGoogleDocText } from "@/server/google-docs";
import { requireGrant } from "@/server/scope";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; draftId: string }> },
) {
  try {
    const { id, draftId } = await context.params;
    await requireGrant(id);
    const draft = await prisma.grantDraft.findFirst({ where: { id: draftId, grantId: id } });
    if (!draft?.googleDocId) throw new AppError("This draft has no Google Doc yet.", 404, "NOT_FOUND");
    const content = (await pullGoogleDocText(draft.googleDocId)).trim();
    if (!content) throw new AppError("The Google Doc is empty.", 422, "GOOGLE");
    await prisma.grantDraft.update({
      where: { id: draft.id },
      data: { editedContent: content, content },
    });
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
