import { cookies } from "next/headers";
import { saveGoogleAuthCode } from "@/server/google-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expected = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");
  if (!code || !state || !expected || state !== expected) {
    return new Response("Google sign-in could not be verified. Start again from Ingestion.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  try {
    await saveGoogleAuthCode(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sign-in failed.";
    return new Response(message, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return Response.redirect(new URL("/ingest?google=connected", request.url));
}
