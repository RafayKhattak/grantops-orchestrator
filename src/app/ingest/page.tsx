import { DriveImport } from "@/components/drive-import";
import { IngestForm } from "@/components/ingest-form";
import { PageHeader } from "@/components/page-header";
import { AppError } from "@/lib/http";
import { listDrivePdfs } from "@/server/google-drive";
import { oauthClientConfigured, oauthConnected } from "@/server/google-oauth";
import { listGrantCards } from "@/server/queries";

export default async function IngestPage({
  searchParams,
}: {
  searchParams: Promise<{ grant?: string; google?: string }>;
}) {
  const { grant, google } = await searchParams;
  const grants = await listGrantCards();
  let driveFiles: { id: string; name: string; modifiedTime: string | null }[] | null = null;
  let driveError: string | null = null;
  try {
    driveFiles = await listDrivePdfs();
  } catch (error) {
    driveError = error instanceof AppError ? error.message : "Google Drive is not connected.";
  }
  return (
    <div>
      <PageHeader
        kicker="Documents"
        title="Ingestion"
        description="The PDF stays in this workspace. Text is read per page, then split into passages of about 500 words with a 50-word overlap."
      />
      {google === "connected" ? (
        <p className="mb-6 text-sm text-good">Your Google account is connected. Approved drafts can become Google Docs.</p>
      ) : null}
      {oauthConnected() ? null : (
        <p className="mb-6 max-w-xl text-sm leading-6 text-muted">
          {oauthClientConfigured() ? (
            <a className="text-ink underline underline-offset-4" href="/api/google/connect">
              Connect your Google account
            </a>
          ) : (
            "Doc export still needs a one-time Google sign-in. The robot account can see the folder, and Google gives it no storage."
          )}
        </p>
      )}
      <IngestForm grants={grants} selectedGrantId={grant} />
      {driveFiles ? (
        <DriveImport
          grants={grants}
          files={driveFiles}
          folderUrl={`https://drive.google.com/drive/folders/${process.env.GOOGLE_DRIVE_FOLDER_ID}`}
        />
      ) : (
        <p className="mt-8 max-w-xl text-sm text-danger">{driveError}</p>
      )}
    </div>
  );
}
