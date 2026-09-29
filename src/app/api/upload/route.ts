import { AppError, json, toErrorResponse } from "@/lib/http";
import { ingestPdf } from "@/server/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const grantId = form.get("grantId");
    const file = form.get("file");
    if (typeof grantId !== "string" || grantId.trim().length === 0) {
      throw new AppError("Choose a grant project.", 400, "VALIDATION");
    }
    if (!(file instanceof File)) {
      throw new AppError("Choose a PDF.", 400, "VALIDATION");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await ingestPdf({ grantId: grantId.trim(), fileName: file.name, bytes });
    return json(result, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
