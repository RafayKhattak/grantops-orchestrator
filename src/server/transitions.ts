import "server-only";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { assertTransition, type GrantStatus } from "@/lib/domain/status";

export async function transitionGrant(
  tx: Prisma.TransactionClient,
  grant: { id: string; status: GrantStatus },
  to: GrantStatus,
  reason: string,
): Promise<void> {
  assertTransition(grant.status, to);
  const updated = await tx.grantProject.updateMany({
    where: { id: grant.id, status: grant.status },
    data: { status: to },
  });
  if (updated.count !== 1) {
    throw new AppError(
      "The grant changed while this action was running. Refresh and try again.",
      409,
      "CONFLICT",
    );
  }
  await tx.statusEvent.create({
    data: {
      grantId: grant.id,
      fromStatus: grant.status,
      toStatus: to,
      reason,
    },
  });
}
