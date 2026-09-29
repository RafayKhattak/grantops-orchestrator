export type GoogleWorkspaceConfig =
  | { configured: false }
  | {
      configured: true;
      email: string;
      key: string;
      folderId?: string;
      shareWith?: string;
    };

export function readGoogleWorkspaceConfig(
  env: Record<string, string | undefined>,
): GoogleWorkspaceConfig {
  const email = env.GOOGLE_CLIENT_EMAIL?.trim() ?? "";
  const rawKey = env.GOOGLE_PRIVATE_KEY?.trim() ?? "";
  if (!email && !rawKey && !env.GOOGLE_DRIVE_FOLDER_ID && !env.GOOGLE_SHARE_WITH) {
    return { configured: false };
  }
  if (!email || !rawKey) {
    throw new Error(
      "Google Workspace is only partly configured. Set both GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY, or leave both empty.",
    );
  }
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID?.trim() || undefined;
  const shareWith = env.GOOGLE_SHARE_WITH?.trim() || undefined;
  if (!folderId && !shareWith) {
    throw new Error(
      "Set GOOGLE_DRIVE_FOLDER_ID or GOOGLE_SHARE_WITH so the exported Google Doc is reachable.",
    );
  }
  return {
    configured: true,
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    folderId,
    shareWith,
  };
}
