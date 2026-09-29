export type EmbeddingRole = "document" | "query";

export type EmbeddingBatch = {
  model: string;
  vectors: number[][];
};

export type Embedder = (
  texts: string[],
  role: EmbeddingRole,
  options?: { model?: string },
) => Promise<EmbeddingBatch>;

export type DrafterInput = {
  system: string;
  user: string;
  temperature: number;
};

export type Drafter = (input: DrafterInput) => Promise<{ model: string; text: string }>;

export function prepareEmbeddingInput(text: string, model: string, role: EmbeddingRole): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("Cannot embed empty text.");
  if (model.toLowerCase().includes("nomic")) {
    const prefix = role === "document" ? "search_document: " : "search_query: ";
    return `${prefix}${trimmed}`;
  }
  return trimmed;
}

export function chooseEmbeddingBackend(options: {
  requestedModel?: string;
  provider: string;
  localModel: string;
  groqModel: string;
}): "local" | "groq" {
  const { requestedModel, provider, localModel, groqModel } = options;
  if (requestedModel === localModel) return "local";
  if (requestedModel === groqModel) return "groq";
  if (requestedModel) {
    throw new Error(`Unknown embedding model ${requestedModel}.`);
  }
  if (provider === "local") return "local";
  if (provider === "groq" || provider === "auto") return "groq";
  throw new Error("EMBEDDING_PROVIDER must be auto, groq, or local.");
}

export const LOCAL_EMBEDDING_MODEL = "onnx-community/all-MiniLM-L6-v2-ONNX";
export const DEFAULT_GROQ_EMBEDDING_MODEL = "nomic-embed-text-v1_5";
