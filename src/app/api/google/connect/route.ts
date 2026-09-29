import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { googleConnectUrl, oauthClientConfigured } from "@/server/google-oauth";

export const runtime = "nodejs";

export async function GET() {
  if (!oauthClientConfigured()) {
    return new Response(
      "Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env, then restart the server.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return Response.redirect(googleConnectUrl(state));
}
