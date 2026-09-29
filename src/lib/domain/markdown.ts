export type ExportExcerpt = {
  fileName: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  score: number;
};

export function renderExportMarkdown(input: {
  title: string;
  funder: string;
  body: string;
  retrieval: ExportExcerpt[];
}): string {
  const appendix = input.retrieval
    .map((chunk, index) => {
      const pages =
        chunk.pageStart === chunk.pageEnd
          ? `Page ${chunk.pageStart}`
          : `Pages ${chunk.pageStart}-${chunk.pageEnd}`;
      return [
        `### Excerpt ${index + 1}`,
        `${chunk.fileName} · ${pages} · similarity ${chunk.score.toFixed(3)}`,
        "",
        chunk.content,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# ${input.title}`,
    "",
    `Funder: ${input.funder}`,
    "",
    "## Draft",
    "",
    input.body.trim(),
    "",
    "## Retrieval appendix",
    "",
    "These are the passages sent to the model for this draft.",
    "",
    appendix || "_No passages were stored with this draft._",
    "",
  ].join("\n");
}
