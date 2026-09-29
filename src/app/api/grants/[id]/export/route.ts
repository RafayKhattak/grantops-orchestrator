import { json, toErrorResponse } from "@/lib/http";
import { exportGrant } from "@/server/review";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await exportGrant(id);
    return json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
