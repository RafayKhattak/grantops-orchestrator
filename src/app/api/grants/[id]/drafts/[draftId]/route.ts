import { draftContentSchema } from "@/lib/domain/schemas";
import { json, parseJson, toErrorResponse } from "@/lib/http";
import { saveDraft } from "@/server/review";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; draftId: string }> }) {
  try {
    const { id, draftId } = await context.params;
    const body = await parseJson(request, draftContentSchema);
    if (body.draftId !== draftId) {
      return json({ error: "Draft id does not match the URL.", code: "VALIDATION" }, 400);
    }
    const factCheck = await saveDraft(id, draftId, body.content);
    return json({ ok: true, factCheck });
  } catch (error) {
    return toErrorResponse(error);
  }
}
