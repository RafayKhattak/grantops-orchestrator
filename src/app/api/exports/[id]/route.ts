import { toErrorResponse } from "@/lib/http";
import { readExportDownload } from "@/server/queries";

function downloadName(title: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return `${cleaned || "grant"}.md`;
}

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const file = await readExportDownload(id);
    const filename = downloadName(file.title);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
