import { z } from "zod";
import { AppError, json, parseJson, toErrorResponse } from "@/lib/http";
import { downloadDrivePdf } from "@/server/google-drive";
import { ingestPdf } from "@/server/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  grantId: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, schema);
    const file = await downloadDrivePdf(body.fileId);
    if (file.bytes.byteLength === 0) {
      throw new AppError("That Drive file is empty.", 422, "PDF");
    }
    const result = await ingestPdf({
      grantId: body.grantId,
      fileName: file.name,
      bytes: file.bytes,
    });
    return json(result, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
