import { createGrantSchema } from "@/lib/domain/schemas";
import { json, parseJson, toErrorResponse } from "@/lib/http";
import { createGrant } from "@/server/queries";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, createGrantSchema);
    const grant = await createGrant(body);
    return json(grant, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
