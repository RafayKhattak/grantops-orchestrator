import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "grantops_session";

function secret(): string {
  return process.env.SESSION_SECRET?.trim() || "grantops-local-session";
}

export function sessionCookieName(): string {
  return COOKIE;
}

export function createSessionToken(userId: string): string {
  const body = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      userId?: string;
      exp?: number;
    };
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}
