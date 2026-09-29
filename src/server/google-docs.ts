import "server-only";
import { Readable } from "node:stream";
import { google } from "googleapis";
import { AppError, publicErrorText } from "@/lib/http";
import { googleAuth, loadGoogleWorkspace } from "@/server/google-auth";
import { oauthClient, oauthConnected } from "@/server/google-oauth";

export async function createReviewDocument(input: {
  title: string;
  body: string;
}): Promise<{ documentId: string; url: string } | null> {
  if (!oauthConnected()) return null;
  return publishGoogleDoc(input);
}

export type DocComment = {
  id: string;
  author: string;
  content: string;
  createdTime: string | null;
};

export async function pullGoogleDocText(fileId: string): Promise<string> {
  if (!oauthConnected()) throw new AppError("Connect Google before reading the Doc.", 409, "GOOGLE_CONFIG");
  const drive = google.drive({ version: "v3", auth: oauthClient() });
  const exported = await drive.files.export(
    { fileId, mimeType: "text/plain" },
    { responseType: "text" },
  );
  return String(exported.data ?? "")
    .replace(/\n*Comment Approved, or Rejected: reason\.?\s*$/i, "")
    .trim();
}

export async function commentOnDoc(fileId: string, content: string): Promise<void> {
  if (!oauthConnected()) return;
  const drive = google.drive({ version: "v3", auth: oauthClient() });
  await drive.comments.create({
    fileId,
    fields: "id",
    requestBody: { content: content.slice(0, 500) },
  });
}

export async function listDocComments(fileId: string): Promise<DocComment[]> {
  if (!oauthConnected()) return [];
  const drive = google.drive({ version: "v3", auth: oauthClient() });
  const listed = await drive.comments.list({
    fileId,
    fields: "comments(id,content,createdTime,author/displayName)",
    pageSize: 40,
  });
  return (listed.data.comments ?? []).flatMap((comment) => {
    if (!comment.id || !comment.content) return [];
    return [
      {
        id: comment.id,
        author: comment.author?.displayName ?? "Reviewer",
        content: comment.content,
        createdTime: comment.createdTime ?? null,
      },
    ];
  });
}

export async function publishGoogleDoc(input: {
  title: string;
  body: string;
}): Promise<{ documentId: string; url: string } | null> {
  const config = loadGoogleWorkspace();
  if (!config.configured) return null;

  if (oauthConnected()) {
    try {
      const drive = google.drive({ version: "v3", auth: oauthClient() });
      const created = await drive.files.create({
        requestBody: {
          name: input.title,
          mimeType: "application/vnd.google-apps.document",
          parents: config.folderId ? [config.folderId] : undefined,
        },
        media: {
          mimeType: "text/plain",
          body: Readable.from([input.body]),
        },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      });
      if (!created.data.id) {
        throw new AppError("Google Drive did not return a document id.", 502, "GOOGLE");
      }
      return {
        documentId: created.data.id,
        url: created.data.webViewLink ?? `https://docs.google.com/document/d/${created.data.id}/edit`,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? publicErrorText(error.message) : "Google export failed.";
      throw new AppError(message || "Google export failed.", 502, "GOOGLE");
    }
  }

  try {
    const auth = googleAuth(config);
    const docs = google.docs({ version: "v1", auth });
    const created = await docs.documents.create({ requestBody: { title: input.title } });
    const documentId = created.data.documentId;
    if (!documentId) {
      throw new AppError("Google Docs did not return a document id.", 502, "GOOGLE");
    }
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: input.body } }],
      },
    });
    const drive = google.drive({ version: "v3", auth });
    if (config.folderId) {
      await drive.files.update({
        fileId: documentId,
        addParents: config.folderId,
        supportsAllDrives: true,
        fields: "id, parents",
      });
    }
    if (config.shareWith) {
      await drive.permissions.create({
        fileId: documentId,
        supportsAllDrives: true,
        sendNotificationEmail: false,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: config.shareWith,
        },
      });
    }
    return {
      documentId,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? publicErrorText(error.message) : "Google export failed.";
    throw new AppError(message || "Google export failed.", 502, "GOOGLE");
  }
}
