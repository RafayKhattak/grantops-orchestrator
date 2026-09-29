import "server-only";
import { extractText } from "unpdf";
import { AppError } from "@/lib/http";
import { cleanExtractedText } from "@/lib/domain/text";

export async function extractPdfPages(
  data: Uint8Array,
): Promise<{ pageCount: number; pages: { pageNumber: number; text: string }[] }> {
  const copy = new Uint8Array(data);
  try {
    const result = await extractText(copy, { mergePages: false });
    const texts = Array.isArray(result.text) ? result.text : [result.text];
    return {
      pageCount: result.totalPages,
      pages: texts.map((text, index) => ({
        pageNumber: index + 1,
        text: cleanExtractedText(text ?? ""),
      })),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "PDF parse failed.";
    throw new AppError(`Could not read this PDF. ${message}`, 422, "PDF");
  }
}
