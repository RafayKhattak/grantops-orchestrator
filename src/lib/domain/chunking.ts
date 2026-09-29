import { wordCount } from "@/lib/domain/text";

export const DEFAULT_CHUNK_WORDS = 500;
export const DEFAULT_CHUNK_OVERLAP = 50;

export type PageInput = {
  pageNumber: number;
  text: string;
};

export type TextChunk = {
  content: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  wordCount: number;
};

type TaggedWord = {
  word: string;
  page: number;
};

export type ChunkOptions = {
  targetWords?: number;
  overlapWords?: number;
};

function taggedWords(pages: PageInput[]): TaggedWord[] {
  const words: TaggedWord[] = [];
  for (const page of pages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      throw new Error("Page numbers must be positive integers.");
    }
    const normalized = page.text.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    for (const word of normalized.split(" ")) {
      if (word.length <= 200) {
        words.push({ word, page: page.pageNumber });
        continue;
      }
      for (let index = 0; index < word.length; index += 200) {
        words.push({ word: word.slice(index, index + 200), page: page.pageNumber });
      }
    }
  }
  return words;
}

export function chunkPages(pages: PageInput[], options: ChunkOptions = {}): TextChunk[] {
  const targetWords = options.targetWords ?? DEFAULT_CHUNK_WORDS;
  const overlapWords = options.overlapWords ?? DEFAULT_CHUNK_OVERLAP;
  if (!Number.isInteger(targetWords) || targetWords < 20) {
    throw new Error("Chunk size must be at least 20 words.");
  }
  if (!Number.isInteger(overlapWords) || overlapWords < 0 || overlapWords >= targetWords) {
    throw new Error("Overlap must be smaller than the chunk size.");
  }

  const chunks: TextChunk[] = [];
  for (const page of pages) {
    const words = taggedWords([page]);
    if (words.length === 0) continue;
    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + targetWords, words.length);
      const slice = words.slice(start, end);
      const content = slice.map((item) => item.word).join(" ");
      chunks.push({
        content,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        chunkIndex: chunks.length,
        wordCount: wordCount(content),
      });
      if (end >= words.length) break;
      const next = end - overlapWords;
      if (next <= start) {
        throw new Error("Chunk window did not advance.");
      }
      start = next;
    }
  }
  return chunks;
}
