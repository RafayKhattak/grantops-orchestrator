import "server-only";
import path from "node:path";
import Groq, { APIError, AuthenticationError, RateLimitError } from "groq-sdk";
import { AppError, publicErrorText } from "@/lib/http";
import {
  chooseEmbeddingBackend,
  DEFAULT_GROQ_EMBEDDING_MODEL,
  LOCAL_EMBEDDING_MODEL,
  prepareEmbeddingInput,
  type EmbeddingBatch,
  type EmbeddingRole,
  type Embedder,
} from "@/lib/domain/embeddings";

type Extractor = (
  texts: string | string[],
  options?: { pooling?: "mean"; normalize?: boolean },
) => Promise<{ tolist: () => unknown }>;

let localExtractor: Promise<Extractor> | null = null;

function groqModel(): string {
  return process.env.GROQ_EMBED_MODEL?.trim() || DEFAULT_GROQ_EMBEDDING_MODEL;
}

function provider(): string {
  return process.env.EMBEDDING_PROVIDER?.trim() || "auto";
}

export function requireGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(
      "GROQ_API_KEY is not set. Add it to .env and restart the server.",
      500,
      "CONFIG",
    );
  }
  return new Groq({ apiKey });
}

function isMissingModel(error: unknown): boolean {
  if (error instanceof APIError && error.status === 404) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /model_not_found|does not exist|unknown model|not found/i.test(message);
}

function asGroqError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof AuthenticationError) {
    return new AppError("Groq rejected the API key.", 502, "GROQ_AUTH");
  }
  if (error instanceof RateLimitError) {
    return new AppError(
      "Groq rate limit reached. Wait a moment and run the step again.",
      429,
      "GROQ_RATE_LIMIT",
    );
  }
  const message = error instanceof Error ? publicErrorText(error.message) : "Groq request failed.";
  return new AppError(message || "Groq request failed.", 502, "GROQ");
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      const retry =
        error instanceof RateLimitError || (error instanceof APIError && error.status === 503);
      if (!retry || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw last;
}

async function embedWithGroq(
  texts: string[],
  role: EmbeddingRole,
  model: string,
): Promise<EmbeddingBatch> {
  const client = requireGroq();
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += 32) {
    const batch = texts
      .slice(offset, offset + 32)
      .map((text) => prepareEmbeddingInput(text, model, role));
    const response = await withRetry(() =>
      client.embeddings.create({
        model,
        input: batch,
        encoding_format: "float",
      }),
    );
    const ordered = [...response.data].sort((left, right) => left.index - right.index);
    if (ordered.length !== batch.length) {
      throw new AppError("Groq returned a different number of embeddings than requested.", 502, "GROQ");
    }
    for (const item of ordered) {
      if (!Array.isArray(item.embedding) || item.embedding.length === 0) {
        throw new AppError("Groq returned a non-float embedding.", 502, "GROQ");
      }
      vectors.push(item.embedding);
    }
  }
  return { model, vectors };
}

async function getLocalExtractor(): Promise<Extractor> {
  if (!localExtractor) {
    localExtractor = (async () => {
      const transformers = await import("@huggingface/transformers");
      transformers.env.cacheDir = path.join(process.cwd(), ".cache", "transformers");
      const pipeline = (await transformers.pipeline(
        "feature-extraction",
        LOCAL_EMBEDDING_MODEL,
      )) as Extractor;
      return pipeline;
    })().catch((error: unknown) => {
      localExtractor = null;
      throw error;
    });
  }
  return localExtractor;
}

function rowsFromTensor(listed: unknown, count: number): number[][] {
  if (
    count === 1 &&
    Array.isArray(listed) &&
    listed.length > 0 &&
    typeof listed[0] === "number"
  ) {
    return [listed as number[]];
  }
  if (!Array.isArray(listed) || listed.length !== count) {
    throw new AppError("The local embedding model returned an unexpected shape.", 500, "EMBEDDINGS");
  }
  return listed.map((row) => {
    if (!Array.isArray(row) || row.length === 0 || row.some((value) => typeof value !== "number")) {
      throw new AppError("The local embedding model returned a corrupt vector.", 500, "EMBEDDINGS");
    }
    return row as number[];
  });
}

async function embedWithLocal(texts: string[], role: EmbeddingRole): Promise<EmbeddingBatch> {
  let extractor: Extractor;
  try {
    extractor = await getLocalExtractor();
  } catch (error) {
    const detail = error instanceof Error ? publicErrorText(error.message) : "unknown error";
    throw new AppError(`The local embedding model could not be loaded. ${detail}`, 500, "EMBEDDINGS");
  }
  const prepared = texts.map((text) => prepareEmbeddingInput(text, LOCAL_EMBEDDING_MODEL, role));
  const vectors: number[][] = [];
  for (let offset = 0; offset < prepared.length; offset += 8) {
    const batch = prepared.slice(offset, offset + 8);
    const output = await extractor(batch.length === 1 ? batch[0] : batch, {
      pooling: "mean",
      normalize: true,
    });
    vectors.push(...rowsFromTensor(output.tolist(), batch.length));
  }
  return { model: LOCAL_EMBEDDING_MODEL, vectors };
}

export async function embedTexts(
  texts: string[],
  role: EmbeddingRole,
  options?: { model?: string },
): Promise<EmbeddingBatch> {
  if (texts.length === 0) throw new AppError("Nothing to embed.", 400, "EMBEDDINGS");
  const selectedProvider = provider();
  const selectedGroqModel = groqModel();
  let backend: "local" | "groq";
  try {
    backend = chooseEmbeddingBackend({
      requestedModel: options?.model,
      provider: selectedProvider,
      localModel: LOCAL_EMBEDDING_MODEL,
      groqModel: selectedGroqModel,
    });
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Embedding model is not configured.",
      500,
      "EMBEDDINGS",
    );
  }

  const canUseLocalFallback =
    backend === "groq" && selectedProvider === "auto" && !options?.model;

  if (canUseLocalFallback && !process.env.GROQ_API_KEY?.trim()) {
    return embedWithLocal(texts, role);
  }

  try {
    if (backend === "local") return await embedWithLocal(texts, role);
    return await embedWithGroq(texts, role, options?.model ?? selectedGroqModel);
  } catch (error) {
    if (canUseLocalFallback && isMissingModel(error)) {
      try {
        return await embedWithLocal(texts, role);
      } catch (localError) {
        const detail = localError instanceof Error ? publicErrorText(localError.message) : "unknown error";
        throw new AppError(
          `Groq embeddings are unavailable for ${selectedGroqModel}, and the local model failed to load. ${detail}`,
          502,
          "EMBEDDINGS",
        );
      }
    }
    if (isMissingModel(error)) {
      throw new AppError(
        `Groq does not serve the embedding model ${options?.model ?? selectedGroqModel} on this account.`,
        502,
        "EMBEDDINGS",
      );
    }
    throw error instanceof AppError ? error : asGroqError(error);
  }
}

export const defaultEmbedder: Embedder = (texts, role, options) => embedTexts(texts, role, options);

export async function draftWithGroq(input: {
  system: string;
  user: string;
  temperature: number;
}): Promise<{ model: string; text: string }> {
  const model = process.env.GROQ_CHAT_MODEL?.trim() || "openai/gpt-oss-120b";
  const client = requireGroq();
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: input.temperature,
      max_tokens: 2500,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    });
    return {
      model: completion.model || model,
      text: completion.choices[0]?.message?.content ?? "",
    };
  } catch (error) {
    throw asGroqError(error);
  }
}
