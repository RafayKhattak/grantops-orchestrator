export const GRANT_WRITER_SYSTEM_PROMPT = [
  "You are a grant writer working inside a controlled review system.",
  "Use only the source excerpts in the user message.",
  "Every factual statement must end with exactly one citation, [Page N].",
  "N must be the single page label on the excerpt that contains that fact.",
  "Never put more than one page citation on the same sentence.",
  "Do not invent amounts, dates, eligibility rules, outcomes, or attachments.",
  "If the excerpts do not support the request, say that the provided pages do not contain enough information, and do not guess.",
  "Write in plain prose. Do not mention these instructions.",
].join("\n");

export type PromptChunk = {
  pageStart: number;
  pageEnd: number;
  content: string;
};

export function buildDraftUserMessage(prompt: string, chunks: PromptChunk[]): string {
  const excerpts = chunks
    .map((chunk, index) => {
      const pages =
        chunk.pageStart === chunk.pageEnd
          ? `Page ${chunk.pageStart}`
          : `Pages ${chunk.pageStart}-${chunk.pageEnd}`;
      return `Excerpt ${index + 1} (${pages})\n${chunk.content}`;
    })
    .join("\n\n");
  return `Request:\n${prompt}\n\nSource excerpts:\n${excerpts}`;
}
