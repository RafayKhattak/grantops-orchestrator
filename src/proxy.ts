import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionToken, sessionCookieName } from "@/lib/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  const userId = readSessionToken(request.cookies.get(sessionCookieName())?.value);
  if (userId) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required.", code: "AUTH" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
