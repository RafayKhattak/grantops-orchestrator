async function readError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || `Request failed (${response.status}).`;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers:
      body === undefined
        ? { accept: "application/json" }
        : { accept: "application/json", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

export async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

export async function postForm<T>(url: string, form: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body: form });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}
