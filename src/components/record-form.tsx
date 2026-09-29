"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, fieldClass } from "@/components/ui";
import { postJson } from "@/lib/client-api";

export function RecordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await postJson("/api/records", {
        title: String(form.get("title") ?? ""),
        body: String(form.get("body") ?? ""),
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the record.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-xl space-y-3">
      <Field label="Title">
        <input name="title" required minLength={3} className={fieldClass} />
      </Field>
      <Field label="Record">
        <textarea name="body" required minLength={40} rows={8} className={fieldClass} />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Add record"}
      </Button>
    </form>
  );
}
