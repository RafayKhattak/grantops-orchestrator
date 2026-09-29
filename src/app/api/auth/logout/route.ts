import { cookies } from "next/headers";
import { sessionCookieName } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName());
  return Response.redirect(new URL("/login", request.url), 303);
}
