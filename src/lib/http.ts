import { ZodError } from "zod";
import { FactCheckResult } from "@/lib/domain/citations";
import { TransitionError } from "@/lib/domain/status";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class FactCheckRejected extends AppError {
  readonly factCheck: FactCheckResult;

  constructor(factCheck: FactCheckResult) {
    super(factCheck.blockingReasons.join(" "), 422, "FACT_CHECK");
    this.name = "FactCheckRejected";
    this.factCheck = factCheck;
  }
}

export function publicErrorText(message: string): string {
  return message
    .replace(/gsk_[A-Za-z0-9]+/g, "[key]")
    .replace(/Bearer\s+\S+/gi, "Bearer [key]")
    .slice(0, 400);
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new AppError("Expected application/json.", 415, "CONTENT_TYPE");
  }
  try {
    return await request.json();
  } catch {
    throw new AppError("Request body is not valid JSON.", 400, "BAD_JSON");
  }
}

export function validationMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

export async function parseJson<T>(
  request: Request,
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false; error: ZodError };
  },
): Promise<T> {
  const body = await readJson(request);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(validationMessage(result.error), 400, "VALIDATION");
  }
  return result.data;
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof FactCheckRejected) {
    return json({ error: error.message, code: error.code, factCheck: error.factCheck }, 422);
  }
  if (error instanceof AppError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error instanceof TransitionError) {
    return json({ error: error.message, code: "INVALID_TRANSITION" }, 409);
  }
  if (error instanceof ZodError) {
    return json({ error: validationMessage(error), code: "VALIDATION" }, 400);
  }
  console.error(error);
  return json({ error: "Unexpected server error.", code: "INTERNAL" }, 500);
}
