import "server-only";
import { google } from "googleapis";
import { AppError, publicErrorText } from "@/lib/http";
import { googleAuth, loadGoogleWorkspace } from "@/server/google-auth";

export type DrivePdf = {
  id: string;
  name: string;
  modifiedTime: string | null;
};

function driveClient() {
  const config = loadGoogleWorkspace();
  if (!config.configured || !config.folderId) {
    throw new AppError("Google Drive is not connected.", 500, "GOOGLE_CONFIG");
  }
  return {
    folderId: config.folderId,
    drive: google.drive({ version: "v3", auth: googleAuth(config) }),
  };
}

export async function listDrivePdfs(): Promise<DrivePdf[]> {
  const { folderId, drive } = driveClient();
  try {
    const listed = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`,
      fields: "files(id,name,modifiedTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      orderBy: "modifiedTime desc",
      pageSize: 50,
    });
    return (listed.data.files ?? []).flatMap((file) => {
      if (!file.id || !file.name) return [];
      return [{ id: file.id, name: file.name, modifiedTime: file.modifiedTime ?? null }];
    });
  } catch (error) {
    const message = error instanceof Error ? publicErrorText(error.message) : "Could not list Drive.";
    throw new AppError(message, 502, "GOOGLE");
  }
}

export async function downloadDrivePdf(fileId: string): Promise<{ name: string; bytes: Uint8Array }> {
  const { folderId, drive } = driveClient();
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,parents",
      supportsAllDrives: true,
    });
    const parents = meta.data.parents ?? [];
    if (!parents.includes(folderId) || meta.data.mimeType !== "application/pdf" || !meta.data.name) {
      throw new AppError("That PDF is not in the connected Drive folder.", 404, "NOT_FOUND");
    }
    const media = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const data = media.data;
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(Buffer.from(data as Buffer));
    return { name: meta.data.name, bytes };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? publicErrorText(error.message) : "Could not download the PDF.";
    throw new AppError(message, 502, "GOOGLE");
  }
}
