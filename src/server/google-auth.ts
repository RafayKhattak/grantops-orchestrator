import "server-only";
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { readGoogleWorkspaceConfig, type GoogleWorkspaceConfig } from "@/lib/domain/google-config";
import { AppError } from "@/lib/http";

const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
];

function serviceAccountFile(): { email: string; key: string } | null {
  const filePath = path.join(process.cwd(), "google-service-account.json");
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    client_email?: string;
    private_key?: string;
  };
  if (!parsed.client_email || !parsed.private_key) return null;
  return { email: parsed.client_email, key: parsed.private_key };
}

export function loadGoogleWorkspace(): GoogleWorkspaceConfig {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ?? "";
  const file = folderId ? serviceAccountFile() : null;
  const env = {
    ...process.env,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL?.trim() || file?.email || "",
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY?.trim() || file?.key || "",
  };
  try {
    return readGoogleWorkspaceConfig(env);
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Google Workspace is misconfigured.",
      500,
      "GOOGLE_CONFIG",
    );
  }
}

export function googleAuth(config: Extract<GoogleWorkspaceConfig, { configured: true }>) {
  return new google.auth.JWT({
    email: config.email,
    key: config.key,
    scopes: SCOPES,
  });
}
