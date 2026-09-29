"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, fieldClass } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { patchJson, postJson } from "@/lib/client-api";
import { factCheckDraft } from "@/lib/domain/citations";
import { GRANT_STATUSES, STATUS_LABELS } from "@/lib/domain/status";
import type { GrantWorkspace } from "@/lib/domain/workspace";
import { formatWhen } from "@/lib/format";

const stepLabels: Record<string, string> = {
  load_grant: "Load grant",
  embed: "Embed passages",
  retrieve: "Cosine retrieval",
  generate: "Draft with Groq",
  fact_check: "Fact-check citations",
  stop_for_review: "Stop for review",
};

export function GrantWorkspaceView({
  workspace,
  comments,
}: {
  workspace: GrantWorkspace;
  comments: { id: string; author: string; content: string; createdTime: string | null }[];
}) {
  const router = useRouter();
  const latest = workspace.drafts[0] ?? null;
  const reviewDraft =
    latest && latest.status === "PENDING_REVIEW" && workspace.actions.canReview ? latest : null;
  const [prompt, setPrompt] = useState("Draft the project summary from the RFP excerpts.");
  const [content, setContent] = useState(reviewDraft?.editedContent ?? reviewDraft?.content ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const liveCheck = useMemo(() => {
    if (!reviewDraft) return null;
    return factCheckDraft(content, reviewDraft.retrieval.chunks);
  }, [content, reviewDraft]);

  async function run(label: string, action: () => Promise<void>) {
    setPending(label);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action failed.");
    } finally {
      setPending(null);
    }
  }

  const currentIndex = GRANT_STATUSES.indexOf(workspace.status);

  return (
    <div>
      <p className="text-[13px] text-faint">
        <Link href="/" className="text-muted hover:text-ink">
          Pipeline
        </Link>
        <span className="px-2">/</span>
        {workspace.organizationName}
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[2.6rem] leading-none text-ink">{workspace.title}</h1>
          <p className="mt-2 text-sm text-muted">{workspace.funder}</p>
        </div>
        <StatusBadge status={workspace.status} />
      </div>

      <ol className="mt-6 flex flex-wrap items-center gap-x-1 gap-y-2 border-y border-line py-3">
        {GRANT_STATUSES.map((status, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "now" : "later";
          return (
            <li key={status} className="flex items-center">
              <span
                className={
                  state === "now"
                    ? "text-[13px] font-medium text-ink"
                    : state === "done"
                      ? "text-[13px] text-muted"
                      : "text-[13px] text-faint"
                }
              >
                {STATUS_LABELS[status]}
              </span>
              {index < GRANT_STATUSES.length - 1 ? (
                <span className="px-2 text-line-strong" aria-hidden>
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Documents</dt>
          <dd className="mt-1 text-ink">{workspace.documents.length}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Passages</dt>
          <dd className="mt-1 text-ink">
            {workspace.embeddedCount}/{workspace.chunkCount} embedded
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Embedding model</dt>
          <dd className="mt-1 truncate font-mono text-[12px] text-ink">
            {workspace.embeddingModel ?? "Not built"}
          </dd>
        </div>
      </dl>

      {workspace.documents.length > 0 ? (
        <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
          {workspace.documents.map((document) => (
            <li key={document.id} className="py-2.5 text-muted">
              <span className="text-ink">{document.fileName}</span>
              <span className="px-2 text-faint">·</span>
              {document.pageCount} pages
              <span className="px-2 text-faint">·</span>
              {document.chunkCount} {document.chunkCount === 1 ? "passage" : "passages"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          No PDF yet.{" "}
          <Link href={`/ingest?grant=${workspace.id}`} className="text-ink underline underline-offset-4">
            Upload the RFP
          </Link>
          .
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {workspace.actions.canEmbed ? (
          <Button
            type="button"
            variant="quiet"
            disabled={pending !== null}
            onClick={() =>
              run("Indexing", async () => {
                await postJson(`/api/grants/${workspace.id}/embed`);
              })
            }
          >
            {pending === "Indexing" ? "Building index" : "Build retrieval index"}
          </Button>
        ) : null}
      </div>

      {workspace.actions.canDraft ? (
        <section className="mt-8 rounded-[14px] border border-line bg-paper p-5">
          <h2 className="text-[13px] font-medium text-ink">Drafting agent</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Embeds missing passages, retrieves the closest four, and stops for a person. It cannot
            approve or export.
          </p>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            className={`${fieldClass} mt-4`}
          />
          <Button
            type="button"
            className="mt-3"
            disabled={pending !== null || prompt.trim().length < 12}
            onClick={() =>
              run("Drafting", async () => {
                await postJson(`/api/grants/${workspace.id}/draft`, { prompt });
              })
            }
          >
            {pending === "Drafting" ? "Running agent" : "Draft with retrieval"}
          </Button>
        </section>
      ) : null}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Source</h2>
          {reviewDraft ? (
            <p className="mt-2 text-[13px] leading-5 text-muted">
              Sent to {reviewDraft.model}. Score is cosine similarity against the prompt.
            </p>
          ) : (
            <p className="mt-2 text-[13px] leading-5 text-muted">
              Retrieved passages appear here after a draft is saved.
            </p>
          )}
          <div className="mt-4 max-h-[40rem] space-y-4 overflow-auto pr-1">
            {reviewDraft?.retrieval.chunks.map((chunk, index) => (
              <article key={chunk.chunkId} className="border-t border-line pt-4">
                <p className="text-[12px] text-faint">
                  {String(index + 1).padStart(2, "0")}
                  <span className="px-2">·</span>
                  {chunk.fileName}
                  <span className="px-2">·</span>
                  {chunk.pageStart === chunk.pageEnd
                    ? `Page ${chunk.pageStart}`
                    : `Pages ${chunk.pageStart}-${chunk.pageEnd}`}
                  <span className="px-2">·</span>
                  {chunk.score.toFixed(3)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{chunk.content}</p>
              </article>
            ))}
          </div>
          {comments.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
                Google Doc comments
              </h3>
              <ul className="mt-2 space-y-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="text-sm">
                    <span className="font-medium text-ink">{comment.author}.</span>{" "}
                    <span className="text-muted">{comment.content}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="rounded-[14px] border border-line bg-paper p-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Draft</h2>
          {reviewDraft ? (
            <>
              <p className="mt-2 text-[13px] text-muted">
                Version {reviewDraft.version}
                <span className="px-2 text-faint">·</span>
                {reviewDraft.prompt}
              </p>
              {reviewDraft.googleDocUrl ? (
                <p className="mt-3 text-sm">
                  <a
                    className="text-ink underline underline-offset-4"
                    href={reviewDraft.googleDocUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Review in Google Docs
                  </a>
                  <span className="mt-1 block text-[13px] text-muted">
                    Comment Approved, or Rejected: reason. The grant moves when that comment is read.
                  </span>
                </p>
              ) : null}
              {reviewDraft.googleDocId ? (
                <Button
                  type="button"
                  variant="quiet"
                  className="mt-3"
                  disabled={pending !== null}
                  onClick={() =>
                    run("Syncing", async () => {
                      await postJson(
                        `/api/grants/${workspace.id}/drafts/${reviewDraft.id}/sync-doc`,
                      );
                    })
                  }
                >
                  {pending === "Syncing" ? "Updating" : "Update from Google Doc"}
                </Button>
              ) : null}
              {reviewDraft.factCheck?.contradictions && reviewDraft.factCheck.contradictions.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-warn">
                  {reviewDraft.factCheck.contradictions.map((item) => (
                    <li key={item.claim}>
                      {item.claim} {item.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={18}
                spellCheck
                className={`${fieldClass} mt-4 min-h-[22rem] font-serif text-[15px] leading-7`}
              />
              {liveCheck ? (
                <p className={`mt-3 text-sm ${liveCheck.passed ? "text-good" : "text-warn"}`}>
                  {liveCheck.passed
                    ? "Citations match the retrieved pages."
                    : liveCheck.blockingReasons.join(" ")}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="quiet"
                  disabled={pending !== null}
                  onClick={() =>
                    run("Saving", async () => {
                      await patchJson(`/api/grants/${workspace.id}/drafts/${reviewDraft.id}`, {
                        draftId: reviewDraft.id,
                        content,
                      });
                    })
                  }
                >
                  {pending === "Saving" ? "Saving" : "Save"}
                </Button>
                <Button
                  type="button"
                  disabled={pending !== null || !liveCheck?.passed}
                  onClick={() =>
                    run("Approving", async () => {
                      await postJson(`/api/grants/${workspace.id}/approve`, {
                        draftId: reviewDraft.id,
                        content,
                      });
                    })
                  }
                >
                  {pending === "Approving" ? "Approving" : "Approve"}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending !== null || reason.trim().length < 3}
                  onClick={() =>
                    run("Rejecting", async () => {
                      await postJson(`/api/grants/${workspace.id}/reject`, {
                        draftId: reviewDraft.id,
                        reason,
                      });
                    })
                  }
                >
                  Reject
                </Button>
              </div>
              <label className="mt-4 block text-[13px] text-muted">
                Rejection reason
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={`${fieldClass} mt-1.5`}
                  placeholder="What has to change"
                />
              </label>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">No draft is waiting for review.</p>
          )}
        </section>
      </div>

      {workspace.actions.canExport ? (
        <section className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
          <div>
            <h2 className="text-[13px] font-medium text-ink">Export</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
              Writes a Markdown file in this workspace. A Google Doc is created only when Workspace
              credentials are configured.
            </p>
          </div>
          <Button
            type="button"
            disabled={pending !== null}
            onClick={() =>
              run("Exporting", async () => {
                await postJson(`/api/grants/${workspace.id}/export`);
              })
            }
          >
            {pending === "Exporting" ? "Exporting" : "Export approved draft"}
          </Button>
        </section>
      ) : null}

      {workspace.latestExport ? (
        <p className="mt-4 text-sm text-muted">
          Exported {formatWhen(workspace.latestExport.createdAt)} via {workspace.latestExport.provider}.{" "}
          <a className="text-ink underline underline-offset-4" href={`/api/exports/${workspace.latestExport.id}`}>
            Download Markdown
          </a>
          {workspace.latestExport.externalUrl ? (
            <>
              {" "}
              <a
                className="text-ink underline underline-offset-4"
                href={workspace.latestExport.externalUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Google Doc
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {workspace.drafts.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Draft history</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {workspace.drafts.map((draft) => (
              <li key={draft.id} className="flex flex-wrap items-baseline gap-x-3 py-2.5 text-sm">
                <span className="font-medium text-ink">
                  v{draft.version}
                </span>
                <span className="text-muted">{draft.status}</span>
                <span className="text-faint">{formatWhen(draft.createdAt)}</span>
                {draft.factCheck ? (
                  <span className={draft.factCheck.passed ? "text-good" : "text-warn"}>
                    {draft.factCheck.passed ? "Citations passed" : "Citations failed"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="mt-8 border-t border-line pt-4">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">
          Agent runs and status log
        </summary>
        <div className="mt-4 space-y-5">
          {workspace.runs.map((run) => (
            <article key={run.id}>
              <p className="text-sm text-ink">
                {run.status}
                <span className="px-2 text-faint">·</span>
                <span className="text-muted">{formatWhen(run.createdAt)}</span>
                {run.model ? <span className="text-faint"> · {run.model}</span> : null}
              </p>
              {run.error ? <p className="mt-1 text-sm text-danger">{run.error}</p> : null}
              <ol className="mt-2 space-y-1 text-[13px] leading-5 text-muted">
                {run.steps.map((step, index) => (
                  <li key={`${run.id}-${index}`}>
                    <span className="text-ink">{stepLabels[step.name] ?? step.name}.</span> {step.detail}
                  </li>
                ))}
              </ol>
            </article>
          ))}
          <ol className="space-y-2 text-[13px] text-muted">
            {workspace.events.map((event) => (
              <li key={event.id}>
                <span className="text-faint">{formatWhen(event.createdAt)}</span>
                <span className="px-2">·</span>
                {event.fromStatus ?? "start"} → {event.toStatus}
                <span className="px-2">·</span>
                {event.reason}
              </li>
            ))}
          </ol>
        </div>
      </details>
    </div>
  );
}
