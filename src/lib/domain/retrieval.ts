import { cosineSimilarity } from "@/lib/domain/cosine";

export type VectorRecord = {
  id: string;
  embeddingModel: string;
  embedding: number[];
};

export type Ranked<T> = {
  chunk: T;
  score: number;
};

export function rankChunks<T extends VectorRecord>(
  query: { model: string; embedding: number[] },
  chunks: T[],
  limit: number,
): Ranked<T>[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Retrieval limit must be a positive integer.");
  }
  const compatible = chunks.filter(
    (chunk) =>
      chunk.embeddingModel === query.model && chunk.embedding.length === query.embedding.length,
  );
  const ranked = compatible.map((chunk) => ({
    chunk,
    score: cosineSimilarity(query.embedding, chunk.embedding),
  }));
  ranked.sort(
    (left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id),
  );
  return ranked.slice(0, limit);
}
