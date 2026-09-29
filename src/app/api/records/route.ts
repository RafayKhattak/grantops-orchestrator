import { z } from "zod";
import { json, parseJson, toErrorResponse } from "@/lib/http";
import { addClientRecord } from "@/server/client-records";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(3),
  body: z.string().trim().min(40),
});

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, schema);
    const record = await addClientRecord(body);
    return json({ id: record.id }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
