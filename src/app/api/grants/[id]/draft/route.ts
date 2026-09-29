import { draftSchema } from "@/lib/domain/schemas";
import { json, parseJson, toErrorResponse } from "@/lib/http";
import { runDraftAgent } from "@/server/draft";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await parseJson(request, draftSchema);
    const result = await runDraftAgent(id, body.prompt);
    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
