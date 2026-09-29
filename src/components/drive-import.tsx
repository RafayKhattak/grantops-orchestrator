"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, fieldClass } from "@/components/ui";
import { postJson } from "@/lib/client-api";
import type { GrantCard } from "@/lib/domain/workspace";

export function DriveImport({
  grants,
  files,
  folderUrl,
}: {
  grants: GrantCard[];
  files: { id: string; name: string; modifiedTime: string | null }[];
  folderUrl: string;
}) {
  const router = useRouter();
  const uploadable = grants.filter((grant) =>
    ["CREATED", "UPLOADED", "PROCESSING", "RAG_READY"].includes(grant.status),
  );
  const [grantId, setGrantId] = useState(uploadable[0]?.id ?? "");
  const [fileId, setFileId] = useState(files[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onImport() {
    setPending(true);
    setError(null);
    try {
      await postJson("/api/drive/import", { grantId, fileId });
      router.push(`/grants/${grantId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-12 max-w-xl border-t border-line pt-8">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Google Drive</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        New PDFs are imported into Helios on their own. You can also import one by hand from the{" "}
        <a className="text-ink underline underline-offset-4" href={folderUrl} target="_blank" rel="noreferrer">
          GrantOps folder
        </a>
        . Refresh this page after you add one.
      </p>
      {files.length === 0 ? (
        <p className="mt-4 text-sm text-ink">The folder is connected. It has no PDFs yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <Field label="PDF in Drive">
            <select className={fieldClass} value={fileId} onChange={(event) => setFileId(event.target.value)}>
              {files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grant project">
            <select className={fieldClass} value={grantId} onChange={(event) => setGrantId(event.target.value)}>
              {uploadable.map((grant) => (
                <option key={grant.id} value={grant.id}>
                  {grant.title}
                </option>
              ))}
            </select>
          </Field>
          {uploadable.length === 0 ? (
            <p className="text-sm text-muted">Create a project on the pipeline before importing.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="button" disabled={pending || !grantId || !fileId} onClick={onImport}>
            {pending ? "Importing" : "Import from Drive"}
          </Button>
        </div>
      )}
    </section>
  );
}
