"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field, fieldClass } from "@/components/ui";
import { postForm } from "@/lib/client-api";
import type { GrantCard } from "@/lib/domain/workspace";

export function IngestForm({
  grants,
  selectedGrantId,
}: {
  grants: GrantCard[];
  selectedGrantId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const uploadable = grants.filter((grant) =>
    ["CREATED", "UPLOADED", "PROCESSING", "RAG_READY"].includes(grant.status),
  );
  const initial = uploadable.some((grant) => grant.id === selectedGrantId) ? selectedGrantId : "";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a PDF.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await postForm<{
        documentId: string;
        pageCount: number;
        chunkCount: number;
      }>("/api/upload", data);
      const grantId = String(data.get("grantId") ?? "");
      setResult(`Read ${response.pageCount} pages and stored ${response.chunkCount} passages.`);
      form.reset();
      router.refresh();
      if (grantId) router.push(`/grants/${grantId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5">
      <Field label="Grant project">
        <select name="grantId" required defaultValue={initial} className={fieldClass}>
          <option value="" disabled>
            Select a project
          </option>
          {uploadable.map((grant) => (
            <option key={grant.id} value={grant.id}>
              {grant.title} — {grant.funder}
            </option>
          ))}
        </select>
      </Field>
      {uploadable.length === 0 ? (
        <p className="text-sm text-muted">
          No project can accept a file right now.{" "}
          <Link href="/" className="text-ink underline decoration-line-strong underline-offset-4">
            Create one from the pipeline
          </Link>
          .
        </p>
      ) : null}
      <label
        className={`block cursor-pointer rounded-[14px] border bg-paper px-6 py-12 text-center transition ${
          dragOver ? "border-ink" : "border-line-strong"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files[0];
          const input = event.currentTarget.querySelector("input");
          if (file && input) {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
          }
        }}
      >
        <span className="display block text-[1.7rem] leading-none text-ink">Drop a PDF</span>
        <span className="mt-2 block text-sm text-muted">Text-based files only. Scanned pages are rejected.</span>
        <input
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="mt-5 block w-full text-sm text-muted file:mr-3 file:rounded-[6px] file:border file:border-line-strong file:bg-canvas file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
        />
      </label>
      <p className="text-[13px] text-faint">
        A sample request is at fixtures/sample-rfp.pdf after npm run sample:rfp.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {result ? <p className="text-sm text-good">{result}</p> : null}
      <Button type="submit" disabled={pending || uploadable.length === 0}>
        {pending ? "Reading PDF" : "Extract and chunk"}
      </Button>
    </form>
  );
}
