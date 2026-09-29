import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/http";
import { chunkPages } from "@/lib/domain/chunking";
import { assertPdf, sanitizeFileName, sha256Hex } from "@/lib/domain/files";
import { planIngestion, type GrantStatus } from "@/lib/domain/status";
import { extractPdfPages } from "@/server/pdf";
import { requireGrant } from "@/server/scope";
import { removeStorage, writeStorage } from "@/server/storage";
import { transitionGrant } from "@/server/transitions";

const MAX_EXTRACTED_CHARS = 5_000_000;
const MAX_WORDS = 200_000;

export async function ingestPdf(input: {
  grantId: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<{ documentId: string; pageCount: number; chunkCount: number; status: GrantStatus }> {
  try {
    assertPdf(input.bytes);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "File is not a PDF.", 422, "PDF");
  }

  const { organization, grant } = await requireGrant(input.grantId);
  const plan = planIngestion(grant.status);
  const fileName = sanitizeFileName(input.fileName);
  const sha256 = sha256Hex(input.bytes);
  const duplicate = await prisma.document.findFirst({
    where: { grantId: grant.id, sha256 },
    select: { id: true },
  });
  if (duplicate) {
    throw new AppError("This PDF is already attached to the grant.", 409, "DUPLICATE");
  }

  const extracted = await extractPdfPages(input.bytes);
  let chunks;
  try {
    chunks = chunkPages(extracted.pages);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Could not split the PDF.", 422, "PDF");
  }
  if (chunks.length === 0) {
    throw new AppError(
      "No extractable text. This reader handles text embedded in the PDF, not scanned pages.",
      422,
      "PDF_EMPTY",
    );
  }
  const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
  if (totalWords > MAX_WORDS) {
    throw new AppError("This PDF is too long to index in the local workspace.", 413, "PDF_TOO_LARGE");
  }
  const rawText = extracted.pages
    .map((page) => `--- page ${page.pageNumber} ---\n${page.text}`)
    .join("\n\n");
  if (rawText.length > MAX_EXTRACTED_CHARS) {
    throw new AppError("Extracted text is too large.", 413, "PDF_TOO_LARGE");
  }

  const relativePath = ["uploads", organization.id, grant.id, `${randomUUID()}.pdf`].join("/");
  await writeStorage(relativePath, input.bytes);

  try {
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          grantId: grant.id,
          fileName,
          storagePath: relativePath,
          sha256,
          rawText,
          pageCount: extracted.pageCount,
          chunks: {
            create: chunks.map((chunk) => ({
              content: chunk.content,
              pageStart: chunk.pageStart,
              pageEnd: chunk.pageEnd,
              chunkIndex: chunk.chunkIndex,
              wordCount: chunk.wordCount,
            })),
          },
        },
      });
      let status = grant.status;
      for (const next of plan) {
        const reason =
          next === "UPLOADED"
            ? `Stored ${fileName} (${extracted.pageCount} pages).`
            : `Split ${fileName} into ${chunks.length} passages.`;
        await transitionGrant(tx, { id: grant.id, status }, next, reason);
        status = next;
      }
      return { id: created.id, status };
    });
    return {
      documentId: document.id,
      pageCount: extracted.pageCount,
      chunkCount: chunks.length,
      status: document.status,
    };
  } catch (error) {
    await removeStorage(relativePath).catch(() => undefined);
    throw error;
  }
}
