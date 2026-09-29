import { excerpt, wordCount } from "@/lib/domain/text";

const CITATION_SOURCE = String.raw`\[Page\s+(\d+)(?:\s*[-–]\s*(\d+))?\]`;

export type PageSpan = {
  pageStart: number;
  pageEnd: number;
};

export type CitationMatch = {
  raw: string;
  pages: number[];
  supported: boolean;
};

export type Contradiction = {
  claim: string;
  recordExcerpt: string;
  reason: string;
};

export type FactCheckResult = {
  passed: boolean;
  blockingReasons: string[];
  citations: CitationMatch[];
  unsupportedPages: number[];
  uncitedParagraphs: { excerpt: string }[];
  contradictions?: Contradiction[];
};

export function applyContradictions(
  fact: FactCheckResult,
  contradictions: Contradiction[],
): FactCheckResult {
  if (contradictions.length === 0) return { ...fact, contradictions: [] };
  const label =
    contradictions.length === 1
      ? "1 statement contradicts the client records."
      : `${contradictions.length} statements contradict the client records.`;
  return {
    ...fact,
    contradictions,
    passed: false,
    blockingReasons: [...fact.blockingReasons, label],
  };
}

function citationPattern(flags: string): RegExp {
  return new RegExp(CITATION_SOURCE, flags);
}

function coveredPages(retrieved: PageSpan[]): Set<number> {
  const pages = new Set<number>();
  for (const span of retrieved) {
    const start = Math.min(span.pageStart, span.pageEnd);
    const end = Math.max(span.pageStart, span.pageEnd);
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  return pages;
}

export function factCheckDraft(text: string, retrieved: PageSpan[]): FactCheckResult {
  const source = text.trim();
  if (!source) {
    return {
      passed: false,
      blockingReasons: ["The draft is empty."],
      citations: [],
      unsupportedPages: [],
      uncitedParagraphs: [],
    };
  }

  const covered = coveredPages(retrieved);
  const citations: CitationMatch[] = [];
  const unsupported = new Set<number>();
  const blockingReasons: string[] = [];

  for (const match of source.matchAll(citationPattern("gi"))) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const pages: number[] = [];
    let supported = true;
    if (high - low > 5) {
      supported = false;
      blockingReasons.push(`Citation ${match[0]} covers too many pages.`);
    } else {
      for (let page = low; page <= high; page += 1) {
        pages.push(page);
        if (!covered.has(page)) {
          supported = false;
          unsupported.add(page);
        }
      }
    }
    citations.push({ raw: match[0], pages, supported });
  }

  const unsupportedPages = [...unsupported].sort((left, right) => left - right);
  if (unsupportedPages.length > 0) {
    blockingReasons.push(
      `Cited page ${unsupportedPages.join(", ")} is not in the retrieved excerpts.`,
    );
  }

  if (citations.length === 0 && wordCount(source) >= 40) {
    blockingReasons.push("The draft has no page citations.");
  }
  for (const sentence of source.split(/(?<=[.!?])\s+/)) {
    const pages = new Set(
      [...sentence.matchAll(citationPattern("gi"))].map((match) => Number(match[1])),
    );
    if (pages.size > 1) {
      blockingReasons.push("A sentence cites more than one page.");
      break;
    }
  }

  const uncitedParagraphs: { excerpt: string }[] = [];
  for (const paragraph of source.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (wordCount(trimmed) < 20) continue;
    if (citationPattern("i").test(trimmed)) continue;
    uncitedParagraphs.push({ excerpt: excerpt(trimmed) });
  }
  if (uncitedParagraphs.length === 1) {
    blockingReasons.push("1 paragraph of 20 or more words has no citation.");
  } else if (uncitedParagraphs.length > 1) {
    blockingReasons.push(
      `${uncitedParagraphs.length} paragraphs of 20 or more words have no citation.`,
    );
  }

  return {
    passed: blockingReasons.length === 0,
    blockingReasons,
    citations,
    unsupportedPages,
    uncitedParagraphs,
  };
}
