import type { FactCheckResult } from "@/lib/domain/citations";
import type { DraftStatus, GrantActions, GrantStatus } from "@/lib/domain/status";

export type RetrievedChunkView = {
  chunkId: string;
  documentId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  score: number;
};

export type RetrievalSnapshot = {
  model: string;
  chunks: RetrievedChunkView[];
};

export type DraftView = {
  id: string;
  version: number;
  prompt: string;
  content: string;
  editedContent: string | null;
  status: DraftStatus;
  model: string;
  factCheck: FactCheckResult | null;
  retrieval: RetrievalSnapshot;
  googleDocId: string | null;
  googleDocUrl: string | null;
  createdAt: string;
};

export type GrantCard = {
  id: string;
  title: string;
  funder: string;
  status: GrantStatus;
  updatedAt: string;
  documentCount: number;
};

export type ApprovalItem = {
  id: string;
  title: string;
  funder: string;
  updatedAt: string;
  version: number | null;
  excerpt: string;
};

export type GrantWorkspace = {
  id: string;
  title: string;
  funder: string;
  status: GrantStatus;
  organizationName: string;
  createdAt: string;
  updatedAt: string;
  actions: GrantActions;
  documents: {
    id: string;
    fileName: string;
    pageCount: number;
    chunkCount: number;
    createdAt: string;
  }[];
  chunkCount: number;
  embeddedCount: number;
  embeddingModel: string | null;
  drafts: DraftView[];
  events: {
    id: string;
    fromStatus: GrantStatus | null;
    toStatus: GrantStatus;
    reason: string;
    createdAt: string;
  }[];
  runs: {
    id: string;
    status: string;
    prompt: string;
    error: string | null;
    model: string | null;
    createdAt: string;
    steps: { name: string; status: string; detail: string }[];
  }[];
  latestExport: {
    id: string;
    provider: string;
    externalUrl: string | null;
    createdAt: string;
  } | null;
};

export type WorkspaceReport = {
  organizationName: string;
  organizationCount: number;
  visibleGrants: number;
  byStatus: { status: GrantStatus; count: number }[];
  exported: number;
  awaitingReview: number;
  averageExportHours: number | null;
  factChecks: { passed: number; failed: number; unchecked: number };
  excludedOrganizations: { name: string; grantCount: number }[];
  grants: {
    id: string;
    title: string;
    funder: string;
    status: GrantStatus;
    createdAt: string;
    updatedAt: string;
    draftCount: number;
    latestFactCheck: "passed" | "failed" | "unchecked";
  }[];
};
