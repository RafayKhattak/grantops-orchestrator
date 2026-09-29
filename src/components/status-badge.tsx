import { cn } from "@/lib/cn";
import { STATUS_LABELS, type GrantStatus } from "@/lib/domain/status";

const dots: Record<GrantStatus, string> = {
  CREATED: "bg-faint",
  UPLOADED: "bg-ink",
  PROCESSING: "bg-warn",
  RAG_READY: "bg-ink",
  DRAFTING: "bg-warn",
  PENDING_HUMAN_REVIEW: "bg-warn",
  APPROVED: "bg-good",
  EXPORTED: "bg-good",
};

export function StatusBadge({ status }: { status: GrantStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[status])} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
