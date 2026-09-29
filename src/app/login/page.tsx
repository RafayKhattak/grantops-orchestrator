"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, fieldClass } from "@/components/ui";
import { postJson } from "@/lib/client-api";

const demos = [
  { email: "helios@grantops.demo", password: "helios-demo", name: "Helios Community Foundation" },
  { email: "redwood@grantops.demo", password: "redwood-demo", name: "Redwood Health Collaborative" },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(email: string, password: string) {
    setPending(true);
    setError(null);
    try {
      await postJson("/api/auth/login", { email, password });
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="display text-4xl text-ink">GrantOps</p>
      <p className="mt-2 text-sm text-muted">Sign in to one client workspace.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-3 rounded-[14px] border border-line bg-paper p-6">
        <Field label="Email">
          <input name="email" type="email" required className={fieldClass} />
        </Field>
        <Field label="Password">
          <input name="password" type="password" required className={fieldClass} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in" : "Sign in"}
        </Button>
      </form>
      <div className="mt-6 grid gap-2">
        {demos.map((demo) => (
          <Button
            key={demo.email}
            type="button"
            variant="quiet"
            disabled={pending}
            onClick={() =>
              signIn(demo.email, demo.password)
            }
          >
            {demo.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
