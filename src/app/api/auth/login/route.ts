import { cookies } from "next/headers";
import { z } from "zod";
import { json, parseJson, toErrorResponse, AppError } from "@/lib/http";
import { verifyPassword } from "@/lib/passwords";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieName } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, schema);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new AppError("Email or password is wrong.", 401, "AUTH");
    }
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName(), createSessionToken(user.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
