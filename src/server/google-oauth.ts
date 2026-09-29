import "server-only";
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { AppError } from "@/lib/http";

const TOKEN_PATH = path.join(process.cwd(), "google-oauth-token.json");
export const GOOGLE_REDIRECT_URI = "http://localhost:3000/api/google/callback";
const SCOPES = ["https://www.googleapis.com/auth/drive"];

function oauthCredentials(): { clientId: string; clientSecret: string } | null {
  const fromEnvId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
  const fromEnvSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (fromEnvId && fromEnvSecret) return { clientId: fromEnvId, clientSecret: fromEnvSecret };
  const filePath = path.join(process.cwd(), "google-oauth-client.json");
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    web?: { client_id?: string; client_secret?: string };
    installed?: { client_id?: string; client_secret?: string };
  };
  const block = parsed.web ?? parsed.installed;
  if (!block?.client_id || !block.client_secret) return null;
  return { clientId: block.client_id, clientSecret: block.client_secret };
}

export function oauthClientConfigured(): boolean {
  return oauthCredentials() !== null;
}

export function oauthConnected(): boolean {
  if (process.env.GRANTOPS_TEST === "1") return false;
  return fs.existsSync(TOKEN_PATH);
}

export function oauthClient() {
  const credentials = oauthCredentials();
  if (!credentials) {
    throw new AppError(
      "Save the OAuth download as google-oauth-client.json in the project folder.",
      500,
      "GOOGLE_CONFIG",
    );
  }
  const client = new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    GOOGLE_REDIRECT_URI,
  );
  if (oauthConnected()) {
    client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")) as object);
  }
  return client;
}

export function googleConnectUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function saveGoogleAuthCode(code: string): Promise<void> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new AppError("Google did not return a refresh token. Try connecting again.", 502, "GOOGLE");
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), { encoding: "utf8" });
}
