export const GRANT_STATUSES = [
  "CREATED",
  "UPLOADED",
  "PROCESSING",
  "RAG_READY",
  "DRAFTING",
  "PENDING_HUMAN_REVIEW",
  "APPROVED",
  "EXPORTED",
] as const;

export type GrantStatus = (typeof GRANT_STATUSES)[number];

export const DRAFT_STATUSES = ["PENDING_REVIEW", "REJECTED", "APPROVED"] as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const STATUS_LABELS: Record<GrantStatus, string> = {
  CREATED: "Created",
  UPLOADED: "Uploaded",
  PROCESSING: "Processing",
  RAG_READY: "Index ready",
  DRAFTING: "Drafting",
  PENDING_HUMAN_REVIEW: "Awaiting review",
  APPROVED: "Approved",
  EXPORTED: "Exported",
};

export function isGrantStatus(value: string): value is GrantStatus {
  return (GRANT_STATUSES as readonly string[]).includes(value);
}

export function isDraftStatus(value: string): value is DraftStatus {
  return (DRAFT_STATUSES as readonly string[]).includes(value);
}

export const KANBAN_COLUMNS: readonly {
  id: string;
  title: string;
  description: string;
  statuses: readonly GrantStatus[];
}[] = [
  {
    id: "ingestion",
    title: "Ingestion",
    description: "Project opened or file stored",
    statuses: ["CREATED", "UPLOADED"],
  },
  {
    id: "retrieval",
    title: "Retrieval",
    description: "Chunking, embeddings, drafting",
    statuses: ["PROCESSING", "RAG_READY", "DRAFTING"],
  },
  {
    id: "review",
    title: "Awaiting review",
    description: "A person must approve the draft",
    statuses: ["PENDING_HUMAN_REVIEW"],
  },
  {
    id: "final",
    title: "Finalized",
    description: "Approved or exported",
    statuses: ["APPROVED", "EXPORTED"],
  },
];

const EDGES: Record<GrantStatus, readonly GrantStatus[]> = {
  CREATED: ["UPLOADED"],
  UPLOADED: ["PROCESSING"],
  PROCESSING: ["RAG_READY"],
  RAG_READY: ["DRAFTING", "PROCESSING"],
  DRAFTING: ["PENDING_HUMAN_REVIEW", "RAG_READY"],
  PENDING_HUMAN_REVIEW: ["APPROVED", "RAG_READY"],
  APPROVED: ["EXPORTED"],
  EXPORTED: [],
};

export class TransitionError extends Error {
  readonly from: GrantStatus;
  readonly to: GrantStatus;

  constructor(from: GrantStatus, to: GrantStatus) {
    super(`Cannot move a grant from ${from} to ${to}.`);
    this.name = "TransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: GrantStatus, to: GrantStatus): boolean {
  return EDGES[from].includes(to);
}

export function assertTransition(from: GrantStatus, to: GrantStatus): void {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

export function planIngestion(from: GrantStatus): GrantStatus[] {
  switch (from) {
    case "CREATED":
      return ["UPLOADED", "PROCESSING"];
    case "UPLOADED":
    case "RAG_READY":
      return ["PROCESSING"];
    case "PROCESSING":
      return [];
    default:
      throw new TransitionError(from, "PROCESSING");
  }
}

export type GrantActions = {
  canUpload: boolean;
  canEmbed: boolean;
  canDraft: boolean;
  canReview: boolean;
  canExport: boolean;
};

export function actionsFor(status: GrantStatus): GrantActions {
  return {
    canUpload:
      status === "CREATED" ||
      status === "UPLOADED" ||
      status === "PROCESSING" ||
      status === "RAG_READY",
    canEmbed: status === "UPLOADED" || status === "PROCESSING" || status === "RAG_READY",
    canDraft:
      status === "UPLOADED" ||
      status === "PROCESSING" ||
      status === "RAG_READY" ||
      status === "DRAFTING",
    canReview: status === "PENDING_HUMAN_REVIEW",
    canExport: status === "APPROVED",
  };
}

export function draftBlockReason(status: GrantStatus): string | null {
  switch (status) {
    case "UPLOADED":
    case "PROCESSING":
    case "RAG_READY":
    case "DRAFTING":
      return null;
    case "CREATED":
      return "Upload a text-based PDF before drafting.";
    case "PENDING_HUMAN_REVIEW":
      return "This grant is in review. Reject the draft before starting another one.";
    case "APPROVED":
      return "This grant is approved. Export it, or start a new project for another draft.";
    case "EXPORTED":
      return "This grant is already exported.";
    default:
      return "Drafting is not available in the current state.";
  }
}

export const STALE_DRAFT_MS = 120_000;
export const TOP_K = 4;
export const DRAFT_TEMPERATURE = 0.2;
