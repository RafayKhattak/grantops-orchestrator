import "server-only";
import { z } from "zod";
import type { FactCheckResult } from "@/lib/domain/citations";
import type { RetrievalSnapshot } from "@/lib/domain/workspace";
import { AppError } from "@/lib/http";

const retrievalSchema = z.object({
  model: z.string().min(1),
  chunks: z.array(
    z.object({
      chunkId: z.string(),
      documentId: z.string(),
      fileName: z.string(),
      pageStart: z.number().int(),
      pageEnd: z.number().int(),
      content: z.string(),
      score: z.number().finite(),
    }),
  ),
});

const factCheckSchema = z.object({
  passed: z.boolean(),
  blockingReasons: z.array(z.string()),
  citations: z.array(
    z.object({
      raw: z.string(),
      pages: z.array(z.number().int()),
      supported: z.boolean(),
    }),
  ),
  unsupportedPages: z.array(z.number().int()),
  uncitedParagraphs: z.array(z.object({ excerpt: z.string() })),
  contradictions: z
    .array(
      z.object({
        claim: z.string(),
        recordExcerpt: z.string(),
        reason: z.string(),
      }),
    )
    .optional(),
});

function readJsonValue(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(`The stored ${label} is unreadable.`, 500, "DATA");
  }
}

export function readRetrieval(raw: string): RetrievalSnapshot {
  const parsed = retrievalSchema.safeParse(readJsonValue(raw, "retrieval record"));
  if (!parsed.success) throw new AppError("The stored retrieval record is corrupt.", 500, "DATA");
  return parsed.data;
}

export function readFactCheck(raw: string | null): FactCheckResult | null {
  if (!raw) return null;
  const parsed = factCheckSchema.safeParse(readJsonValue(raw, "fact check"));
  if (!parsed.success) throw new AppError("The stored fact check is corrupt.", 500, "DATA");
  return parsed.data;
}
