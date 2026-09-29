import { describe, expect, it } from "vitest";
import { factCheckDraft } from "@/lib/domain/citations";
import { chunkPages } from "@/lib/domain/chunking";
import { cosineSimilarity, parseVector } from "@/lib/domain/cosine";
import {
  chooseEmbeddingBackend,
  DEFAULT_GROQ_EMBEDDING_MODEL,
  LOCAL_EMBEDDING_MODEL,
  prepareEmbeddingInput,
} from "@/lib/domain/embeddings";
import { assertPdf, sanitizeFileName } from "@/lib/domain/files";
import { readGoogleWorkspaceConfig } from "@/lib/domain/google-config";
import { renderExportMarkdown } from "@/lib/domain/markdown";
import { buildDraftUserMessage, GRANT_WRITER_SYSTEM_PROMPT } from "@/lib/domain/prompt";
import { rankChunks } from "@/lib/domain/retrieval";
import {
  actionsFor,
  assertTransition,
  canTransition,
  draftBlockReason,
  GRANT_STATUSES,
  KANBAN_COLUMNS,
  planIngestion,
  TransitionError,
} from "@/lib/domain/status";
import { cleanExtractedText } from "@/lib/domain/text";

describe("grant state machine", () => {
  it("partitions every status into exactly one kanban column", () => {
    const covered = KANBAN_COLUMNS.flatMap((column) => column.statuses);
    expect([...covered].sort()).toEqual([...GRANT_STATUSES].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("allows the lifecycle and rejects skips", () => {
    expect(canTransition("CREATED", "UPLOADED")).toBe(true);
    expect(canTransition("RAG_READY", "DRAFTING")).toBe(true);
    expect(canTransition("DRAFTING", "PENDING_HUMAN_REVIEW")).toBe(true);
    expect(canTransition("PENDING_HUMAN_REVIEW", "APPROVED")).toBe(true);
    expect(canTransition("PENDING_HUMAN_REVIEW", "RAG_READY")).toBe(true);
    expect(canTransition("APPROVED", "EXPORTED")).toBe(true);
    expect(canTransition("PENDING_HUMAN_REVIEW", "EXPORTED")).toBe(false);
    expect(canTransition("EXPORTED", "APPROVED")).toBe(false);
    expect(() => assertTransition("CREATED", "EXPORTED")).toThrow(TransitionError);
  });

  it("plans ingestion as explicit steps", () => {
    expect(planIngestion("CREATED")).toEqual(["UPLOADED", "PROCESSING"]);
    expect(planIngestion("UPLOADED")).toEqual(["PROCESSING"]);
    expect(planIngestion("RAG_READY")).toEqual(["PROCESSING"]);
    expect(planIngestion("PROCESSING")).toEqual([]);
    expect(() => planIngestion("APPROVED")).toThrow(TransitionError);
  });

  it("keeps export behind approval", () => {
    expect(actionsFor("PENDING_HUMAN_REVIEW").canExport).toBe(false);
    expect(actionsFor("APPROVED").canExport).toBe(true);
    expect(actionsFor("EXPORTED").canDraft).toBe(false);
    expect(draftBlockReason("CREATED")).toMatch(/Upload/);
    expect(draftBlockReason("RAG_READY")).toBeNull();
  });
});

describe("chunking", () => {
  it("returns nothing for blank pages", () => {
    expect(chunkPages([{ pageNumber: 1, text: "   " }])).toEqual([]);
  });

  it("keeps page numbers when a window crosses a page break", () => {
    const pageOne = Array.from({ length: 30 }, (_, index) => `p1w${index}`).join(" ");
    const pageTwo = Array.from({ length: 30 }, (_, index) => `p2w${index}`).join(" ");
    const chunks = chunkPages(
      [
        { pageNumber: 1, text: pageOne },
        { pageNumber: 2, text: "" },
        { pageNumber: 3, text: pageTwo },
      ],
      { targetWords: 40, overlapWords: 5 },
    );
    expect(chunks[0]).toMatchObject({ pageStart: 1, pageEnd: 1, wordCount: 30 });
    expect(chunks[0].content).toContain("p1w29");
    expect(chunks[0].content).not.toContain("p2w");
    expect(chunks[1]).toMatchObject({ pageStart: 3, pageEnd: 3 });
    expect(chunks[1].content.startsWith("p2w0 ")).toBe(true);
  });

  it("advances the window by target minus overlap", () => {
    const text = Array.from({ length: 120 }, (_, index) => `w${index}`).join(" ");
    const chunks = chunkPages([{ pageNumber: 1, text }], { targetWords: 50, overlapWords: 10 });
    expect(chunks).toHaveLength(3);
    expect(chunks[0].content.startsWith("w0 ")).toBe(true);
    expect(chunks[0].content.endsWith(" w49")).toBe(true);
    expect(chunks[1].content.startsWith("w40 ")).toBe(true);
    expect(chunks[2].wordCount).toBe(40);
  });

  it("splits a single enormous token into pieces of at most 200 characters", () => {
    const chunks = chunkPages([{ pageNumber: 2, text: "a".repeat(450) }], {
      targetWords: 20,
      overlapWords: 0,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.split(" ").every((word) => word.length <= 200)).toBe(true);
    expect(chunks[0].content.replace(/ /g, "")).toBe("a".repeat(450));
    expect(chunks[0].pageStart).toBe(2);
  });
});

describe("cosine retrieval", () => {
  it("scores identical, orthogonal, and zero vectors", () => {
    expect(cosineSimilarity([3, 0], [3, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 1], [1, 0])).toBeCloseTo(Math.SQRT1_2);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 0])).toThrow(/length/);
  });

  it("drops a different model and breaks ties by id", () => {
    const ranked = rankChunks(
      { model: "m", embedding: [1, 0] },
      [
        { id: "d", embeddingModel: "m", embedding: [1, 0] },
        { id: "a", embeddingModel: "m", embedding: [1, 0] },
        { id: "b", embeddingModel: "m", embedding: [0, 1] },
        { id: "c", embeddingModel: "other", embedding: [1, 0] },
      ],
      3,
    );
    expect(ranked.map((item) => item.chunk.id)).toEqual(["a", "d", "b"]);
    expect(ranked[0].score).toBeCloseTo(1);
  });

  it("rejects a corrupt stored vector", () => {
    expect(parseVector("[1,2]")).toEqual([1, 2]);
    expect(() => parseVector("[1,null]")).toThrow(/corrupt/);
  });
});

describe("fact check", () => {
  const retrieved = [{ pageStart: 1, pageEnd: 2 }];

  it("accepts a cited statement on a retrieved page", () => {
    const result = factCheckDraft(
      "Eligible applicants must be 501(c)(3) organizations. [Page 1]",
      retrieved,
    );
    expect(result.passed).toBe(true);
    expect(result.citations[0].supported).toBe(true);
  });

  it("blocks a page the retrieval set does not contain", () => {
    const result = factCheckDraft("The deadline is March 15. [Page 9]", retrieved);
    expect(result.passed).toBe(false);
    expect(result.unsupportedPages).toEqual([9]);
  });

  it("blocks a long draft with no citations and an uncited paragraph", () => {
    const paragraph =
      "This narrative invents a program design and a budget without pointing at the request for proposals or the eligible activities in the source.";
    const result = factCheckDraft(`${paragraph}\n\n${paragraph}`, retrieved);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes("no page citations"))).toBe(true);
    expect(result.uncitedParagraphs).toHaveLength(2);
  });

  it("ignores headings and accepts a page range inside the excerpts", () => {
    const result = factCheckDraft("# Summary\n\nThe match is ten percent. [Page 1-2]", retrieved);
    expect(result.passed).toBe(true);
  });

  it("rejects an overly wide citation range", () => {
    const result = factCheckDraft("See the attached rules. [Page 1-9]", retrieved);
    expect(result.passed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes("too many pages"))).toBe(true);
  });
});

describe("documents, prompts, and workspace config", () => {
  it("accepts a PDF header and rejects other files", () => {
    expect(() => assertPdf(Uint8Array.from([0, 1, 2, 3, 4]), 20)).toThrow(/not a PDF/);
    const pdf = new TextEncoder().encode("%PDF-1.7\n");
    expect(() => assertPdf(pdf, 4)).toThrow(/20 MB/);
    expect(() => assertPdf(pdf, 100)).not.toThrow();
  });

  it("strips paths from file names", () => {
    expect(sanitizeFileName("..\\..\\secret.pdf")).toBe("secret.pdf");
    expect(sanitizeFileName("my rfp.pdf")).toBe("my_rfp.pdf");
    expect(sanitizeFileName("")).toBe("document.pdf");
  });

  it("removes NUL bytes from extracted text", () => {
    expect(cleanExtractedText("a\u0000  b\r\nc")).toBe("a b\nc");
  });

  it("prefixes nomic inputs and leaves other models unchanged", () => {
    expect(prepareEmbeddingInput("rules", "nomic-embed-text-v1_5", "document")).toBe(
      "search_document: rules",
    );
    expect(prepareEmbeddingInput("rules", "nomic-embed-text-v1_5", "query")).toBe(
      "search_query: rules",
    );
    expect(prepareEmbeddingInput("rules", LOCAL_EMBEDDING_MODEL, "query")).toBe("rules");
    expect(() => prepareEmbeddingInput("   ", LOCAL_EMBEDDING_MODEL, "query")).toThrow(/empty/);
  });

  it("chooses an embedding backend without mixing models", () => {
    expect(
      chooseEmbeddingBackend({
        provider: "auto",
        localModel: LOCAL_EMBEDDING_MODEL,
        groqModel: DEFAULT_GROQ_EMBEDDING_MODEL,
      }),
    ).toBe("groq");
    expect(
      chooseEmbeddingBackend({
        requestedModel: LOCAL_EMBEDDING_MODEL,
        provider: "auto",
        localModel: LOCAL_EMBEDDING_MODEL,
        groqModel: DEFAULT_GROQ_EMBEDDING_MODEL,
      }),
    ).toBe("local");
    expect(() =>
      chooseEmbeddingBackend({
        provider: "sometimes",
        localModel: LOCAL_EMBEDDING_MODEL,
        groqModel: DEFAULT_GROQ_EMBEDDING_MODEL,
      }),
    ).toThrow(/EMBEDDING_PROVIDER/);
  });

  it("puts the request and the page labels in the model input", () => {
    expect(GRANT_WRITER_SYSTEM_PROMPT).toContain("[Page N]");
    expect(GRANT_WRITER_SYSTEM_PROMPT.toLowerCase()).toContain("do not invent");
    const message = buildDraftUserMessage("Draft the summary", [
      { pageStart: 2, pageEnd: 3, content: "Match is 10 percent." },
    ]);
    expect(message).toContain("Draft the summary");
    expect(message).toContain("Pages 2-3");
    expect(message).toContain("Match is 10 percent.");
  });

  it("renders an export with the retrieval appendix", () => {
    const markdown = renderExportMarkdown({
      title: "Hidalgo Workforce",
      funder: "Texas CDBG",
      body: "The request is $250,000. [Page 1]",
      retrieval: [
        {
          fileName: "rfp.pdf",
          pageStart: 1,
          pageEnd: 1,
          content: "The request is $250,000.",
          score: 0.8124,
        },
      ],
    });
    expect(markdown).toContain("# Hidalgo Workforce");
    expect(markdown).toContain("Page 1");
    expect(markdown).toContain("0.812");
    expect(markdown).toContain("The request is $250,000. [Page 1]");
  });

  it("treats missing Google credentials as unconfigured and rejects a partial setup", () => {
    expect(readGoogleWorkspaceConfig({})).toEqual({ configured: false });
    expect(() =>
      readGoogleWorkspaceConfig({
        GOOGLE_CLIENT_EMAIL: "svc@example.iam.gserviceaccount.com",
        GOOGLE_PRIVATE_KEY: "line\\nline",
      }),
    ).toThrow(/reachable/);
    const config = readGoogleWorkspaceConfig({
      GOOGLE_CLIENT_EMAIL: "svc@example.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: "line\\nline",
      GOOGLE_SHARE_WITH: "james@example.com",
    });
    expect(config).toMatchObject({ configured: true, key: "line\nline", shareWith: "james@example.com" });
  });
});
