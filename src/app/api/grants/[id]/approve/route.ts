import { draftContentSchema } from "@/lib/domain/schemas";
import { json, parseJson, toErrorResponse } from "@/lib/http";
import { approveDraft } from "@/server/review";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await parseJson(request, draftContentSchema);
    const factCheck = await approveDraft(id, body.draftId, body.content);
    return json({ ok: true, factCheck });
  } catch (error) {
    return toErrorResponse(error);
  }
}
