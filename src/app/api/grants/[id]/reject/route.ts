import { rejectSchema } from "@/lib/domain/schemas";
import { json, parseJson, toErrorResponse } from "@/lib/http";
import { rejectDraft } from "@/server/review";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await parseJson(request, rejectSchema);
    await rejectDraft(id, body.draftId, body.reason);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
