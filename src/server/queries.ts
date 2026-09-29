import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/http";
import { excerpt } from "@/lib/domain/text";
import {
  actionsFor,
  GRANT_STATUSES,
  isDraftStatus,
  isGrantStatus,
  type GrantStatus,
} from "@/lib/domain/status";
import type {
  ApprovalItem,
  DraftView,
  GrantCard,
  GrantWorkspace,
  WorkspaceReport,
} from "@/lib/domain/workspace";
import { getActorOrganization, requireGrant } from "@/server/scope";
import { readFactCheck, readRetrieval } from "@/server/snapshot";
import { readStorage } from "@/server/storage";

function requireStatus(value: string): GrantStatus {
  if (!isGrantStatus(value)) throw new AppError("Grant status is corrupt.", 500, "DATA");
  return value;
}

export async function createGrant(input: { title: string; funder: string }) {
  const organization = await getActorOrganization();
  const grant = await prisma.grantProject.create({
    data: {
      organizationId: organization.id,
      title: input.title,
      funder: input.funder,
      status: "CREATED",
      events: {
        create: { toStatus: "CREATED", reason: "Project created." },
      },
    },
  });
  return { id: grant.id };
}

export async function listGrantCards(): Promise<GrantCard[]> {
  const organization = await getActorOrganization();
  const grants = await prisma.grantProject.findMany({
    where: { organizationId: organization.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { documents: true } } },
  });
  return grants.map((grant) => ({
    id: grant.id,
    title: grant.title,
    funder: grant.funder,
    status: requireStatus(grant.status),
    updatedAt: grant.updatedAt.toISOString(),
    documentCount: grant._count.documents,
  }));
}

export async function listApprovals(): Promise<ApprovalItem[]> {
  const organization = await getActorOrganization();
  const grants = await prisma.grantProject.findMany({
    where: { organizationId: organization.id, status: "PENDING_HUMAN_REVIEW" },
    orderBy: { updatedAt: "asc" },
    include: {
      drafts: {
        where: { status: "PENDING_REVIEW" },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  return grants.map((grant) => {
    const draft = grant.drafts[0];
    const text = draft?.editedContent ?? draft?.content ?? "";
    return {
      id: grant.id,
      title: grant.title,
      funder: grant.funder,
      updatedAt: grant.updatedAt.toISOString(),
      version: draft?.version ?? null,
      excerpt: excerpt(text, 220),
    };
  });
}

export async function getGrantWorkspace(id: string): Promise<GrantWorkspace> {
  const { organization } = await requireGrant(id);
  const grant = await prisma.grantProject.findFirst({
    where: { id, organizationId: organization.id },
    include: {
      documents: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { chunks: true } } },
      },
      drafts: { orderBy: { version: "desc" } },
      events: { orderBy: { createdAt: "asc" } },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { steps: { orderBy: { ordinal: "asc" } } },
      },
      exports: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!grant) throw new AppError("Grant not found.", 404, "NOT_FOUND");
  const status = requireStatus(grant.status);
  const [chunkCount, embeddedCount, modelRow] = await Promise.all([
    prisma.documentChunk.count({ where: { document: { grantId: grant.id } } }),
    prisma.documentChunk.count({
      where: { document: { grantId: grant.id }, embedding: { not: null } },
    }),
    prisma.documentChunk.findFirst({
      where: { document: { grantId: grant.id }, embeddingModel: { not: null } },
      select: { embeddingModel: true },
    }),
  ]);

  const drafts: DraftView[] = grant.drafts.map((draft) => {
    if (!isDraftStatus(draft.status)) {
      throw new AppError("Draft status is corrupt.", 500, "DATA");
    }
    return {
      id: draft.id,
      version: draft.version,
      prompt: draft.prompt,
      content: draft.content,
      editedContent: draft.editedContent,
      status: draft.status,
      model: draft.model,
      factCheck: readFactCheck(draft.factCheckJson),
      retrieval: readRetrieval(draft.citationsJson),
      googleDocId: draft.googleDocId,
      googleDocUrl: draft.googleDocUrl,
      createdAt: draft.createdAt.toISOString(),
    };
  });

  const latestExport = grant.exports[0]
    ? {
        id: grant.exports[0].id,
        provider: grant.exports[0].provider,
        externalUrl: grant.exports[0].externalUrl,
        createdAt: grant.exports[0].createdAt.toISOString(),
      }
    : null;

  return {
    id: grant.id,
    title: grant.title,
    funder: grant.funder,
    status,
    organizationName: organization.name,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
    actions: actionsFor(status),
    documents: grant.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      pageCount: document.pageCount,
      chunkCount: document._count.chunks,
      createdAt: document.createdAt.toISOString(),
    })),
    chunkCount,
    embeddedCount,
    embeddingModel: modelRow?.embeddingModel ?? null,
    drafts,
    events: grant.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus ? requireStatus(event.fromStatus) : null,
      toStatus: requireStatus(event.toStatus),
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
    runs: grant.runs.map((run) => ({
      id: run.id,
      status: run.status,
      prompt: run.prompt,
      error: run.error,
      model: run.model,
      createdAt: run.createdAt.toISOString(),
      steps: run.steps.map((item) => ({
        name: item.name,
        status: item.status,
        detail: item.detail,
      })),
    })),
    latestExport,
  };
}

function factFlag(raw: string | null): "passed" | "failed" | "unchecked" {
  if (!raw) return "unchecked";
  try {
    const value = JSON.parse(raw) as { passed?: unknown };
    if (value.passed === true) return "passed";
    if (value.passed === false) return "failed";
  } catch {
    return "unchecked";
  }
  return "unchecked";
}

export async function getReport(): Promise<WorkspaceReport> {
  const organization = await getActorOrganization();
  const [grants, excluded, organizationCount] = await Promise.all([
    prisma.grantProject.findMany({
      where: { organizationId: organization.id },
      orderBy: { updatedAt: "desc" },
      include: {
        events: true,
        drafts: { orderBy: { version: "desc" } },
      },
    }),
    prisma.organization.findMany({
      where: { id: { not: organization.id } },
      select: { name: true, _count: { select: { grants: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.organization.count(),
  ]);

  const durations: number[] = [];
  const factChecks = { passed: 0, failed: 0, unchecked: 0 };
  for (const grant of grants) {
    const exported = grant.events.find((event) => event.toStatus === "EXPORTED");
    if (exported) {
      durations.push((exported.createdAt.getTime() - grant.createdAt.getTime()) / 3_600_000);
    }
    for (const draft of grant.drafts) {
      factChecks[factFlag(draft.factCheckJson)] += 1;
    }
  }

  return {
    organizationName: organization.name,
    organizationCount,
    visibleGrants: grants.length,
    byStatus: GRANT_STATUSES.map((status) => ({
      status,
      count: grants.filter((grant) => grant.status === status).length,
    })),
    exported: grants.filter((grant) => grant.status === "EXPORTED").length,
    awaitingReview: grants.filter((grant) => grant.status === "PENDING_HUMAN_REVIEW").length,
    averageExportHours:
      durations.length === 0 ? null : durations.reduce((sum, hours) => sum + hours, 0) / durations.length,
    factChecks,
    excludedOrganizations: excluded.map((item) => ({
      name: item.name,
      grantCount: item._count.grants,
    })),
    grants: grants.map((grant) => ({
      id: grant.id,
      title: grant.title,
      funder: grant.funder,
      status: requireStatus(grant.status),
      createdAt: grant.createdAt.toISOString(),
      updatedAt: grant.updatedAt.toISOString(),
      draftCount: grant.drafts.length,
      latestFactCheck: factFlag(grant.drafts[0]?.factCheckJson ?? null),
    })),
  };
}

export async function readExportDownload(exportId: string) {
  const organization = await getActorOrganization();
  const artifact = await prisma.exportArtifact.findFirst({
    where: { id: exportId, grant: { organizationId: organization.id } },
    include: { grant: { select: { title: true } } },
  });
  if (!artifact) throw new AppError("Export not found.", 404, "NOT_FOUND");
  const bytes = await readStorage(artifact.storagePath);
  return { bytes, title: artifact.grant.title };
}
