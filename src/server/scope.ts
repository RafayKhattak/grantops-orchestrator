import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/http";
import { isGrantStatus } from "@/lib/domain/status";
import { readSessionToken, sessionCookieName } from "@/lib/session";

async function organizationFromSlug() {
  const slug = process.env.DEMO_ORGANIZATION_SLUG?.trim();
  if (!slug) throw new AppError("DEMO_ORGANIZATION_SLUG is not set.", 500, "CONFIG");
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) {
    throw new AppError("The workspace organization is not seeded. Run npm run db:setup.", 500, "CONFIG");
  }
  return organization;
}

export async function getActorOrganization() {
  if (process.env.GRANTOPS_TEST === "1" || process.env.VITEST === "true") {
    return organizationFromSlug();
  }
  const cookieStore = await cookies();
  const userId = readSessionToken(cookieStore.get(sessionCookieName())?.value);
  if (!userId) throw new AppError("Sign in required.", 401, "AUTH");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!user) throw new AppError("Sign in required.", 401, "AUTH");
  return user.organization;
}

export async function requireGrant(id: string) {
  const organization = await getActorOrganization();
  const grant = await prisma.grantProject.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!grant) throw new AppError("Grant not found.", 404, "NOT_FOUND");
  if (!isGrantStatus(grant.status)) {
    throw new AppError("Grant status is corrupt.", 500, "DATA");
  }
  return { organization, grant: { ...grant, status: grant.status } };
}
