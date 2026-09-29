"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, fieldClass } from "@/components/ui";
import { postJson } from "@/lib/client-api";

export function CreateGrantDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    try {
      await postJson("/api/grants", {
        title: String(data.get("title") ?? ""),
        funder: String(data.get("funder") ?? ""),
      });
      form.reset();
      dialogRef.current?.close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the grant.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => dialogRef.current?.showModal()}>
        New project
      </Button>
      <dialog ref={dialogRef} className="w-[min(28rem,calc(100%-2rem))]">
        <form
          onSubmit={onSubmit}
          className="rounded-[14px] border border-line bg-paper p-6 shadow-[0_24px_80px_rgb(20_16_12/0.18)]"
        >
          <h2 className="display text-[1.75rem] leading-none">New grant project</h2>
          <p className="mt-2 text-sm text-muted">Created in the current workspace only.</p>
          <div className="mt-5 space-y-3">
            <Field label="Title">
              <input name="title" required minLength={3} maxLength={180} className={fieldClass} />
            </Field>
            <Field label="Funder">
              <input name="funder" required minLength={2} maxLength={180} className={fieldClass} />
            </Field>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="quiet" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating" : "Create project"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
