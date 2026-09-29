import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DRAFT_TEMPERATURE } from "@/lib/domain/status";
import { GRANT_WRITER_SYSTEM_PROMPT } from "@/lib/domain/prompt";
import type { Drafter, Embedder } from "@/lib/domain/embeddings";
import { prisma } from "@/lib/prisma";
import { runDraftAgent } from "@/server/draft";
import { embedGrant } from "@/server/index-grant";
import { ingestPdf } from "@/server/ingest";
import { listGrantCards, getGrantWorkspace } from "@/server/queries";
import { approveDraft, exportGrant, rejectDraft } from "@/server/review";
import { absoluteFromRelative, readStorage } from "@/server/storage";
import { AppError, FactCheckRejected } from "@/lib/http";
import { buildTextPdf } from "../../scripts/text-pdf";

const embedder: Embedder = async (texts, _role, options) => ({
  model: options?.model ?? "test-embedder",
  vectors: texts.map((text) => {
    const lower = text.toLowerCase();
    const eligibility = lower.includes("eligibility") || lower.includes("501") ? 1 : 0;
    const budget = lower.includes("match") || lower.includes("budget") ? 1 : 0;
    return [eligibility, budget, 1];
  }),
});

const drafter: Drafter = async (input) => {
  if (input.system !== GRANT_WRITER_SYSTEM_PROMPT) {
    throw new Error("System prompt was not the grant writer prompt.");
  }
  if (input.temperature !== DRAFT_TEMPERATURE) throw new Error("Unexpected temperature.");
  if (input.user.includes("REDWOOD SECRET")) throw new Error("Retrieved another organization's text.");
  if (!input.user.includes("501(c)(3)")) throw new Error("Retrieved text did not include the source passage.");
  return {
    model: "test-drafter",
    text: "Eligible applicants must be 501(c)(3) organizations operating in Texas. [Page 1]",
  };
};

function assertTestDatabase() {
  if (!process.env.DATABASE_URL?.includes("test.db")) {
    throw new Error("Refusing to run database tests outside the test database.");
  }
}

async function resetDatabase() {
  assertTestDatabase();
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  await Promise.all(
    organizations.flatMap((organization) => [
      fs.rm(path.join(process.cwd(), "storage", "uploads", organization.id), {
        recursive: true,
        force: true,
      }),
      fs.rm(path.join(process.cwd(), "storage", "exports", organization.id), {
        recursive: true,
        force: true,
      }),
    ]),
  );
  await prisma.user.deleteMany();
  await prisma.clientRecord.deleteMany();
  await prisma.agentStep.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.exportArtifact.deleteMany();
  await prisma.grantDraft.deleteMany();
  await prisma.statusEvent.deleteMany();
  await prisma.documentChunk.deleteMany();
  await prisma.document.deleteMany();
  await prisma.grantProject.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.organization.create({
    data: { slug: "helios-community", name: "Helios Community Foundation" },
  });
  await prisma.organization.create({
    data: { slug: "redwood-health", name: "Redwood Health Collaborative" },
  });
  delete process.env.GOOGLE_CLIENT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  delete process.env.GOOGLE_SHARE_WITH;
  delete process.env.GROQ_API_KEY;
}

async function seedIndexedGrant() {
  const helios = await prisma.organization.findUniqueOrThrow({ where: { slug: "helios-community" } });
  const redwood = await prisma.organization.findUniqueOrThrow({ where: { slug: "redwood-health" } });
  const hidden = await prisma.grantProject.create({
    data: {
      organizationId: redwood.id,
      title: "Rural Clinic Expansion",
      funder: "Redwood Family Trust",
      status: "PROCESSING",
      documents: {
        create: {
          fileName: "redwood.pdf",
          storagePath: "uploads/redwood/not-a-real-file.pdf",
          sha256: "redwood",
          rawText: "REDWOOD SECRET eligibility rules",
          pageCount: 1,
          chunks: {
            create: {
              content: "REDWOOD SECRET eligibility rules for a different client.",
              pageStart: 1,
              pageEnd: 1,
              chunkIndex: 0,
              wordCount: 8,
              embedding: JSON.stringify([1, 0, 1]),
              embeddingModel: "test-embedder",
              embeddingDim: 3,
            },
          },
        },
      },
    },
  });
  const grant = await prisma.grantProject.create({
    data: {
      organizationId: helios.id,
      title: "Hidalgo Workforce Center",
      funder: "Texas CDBG",
      status: "PROCESSING",
      documents: {
        create: {
          fileName: "hidalgo.pdf",
          storagePath: "uploads/helios/not-a-real-file.pdf",
          sha256: "helios",
          rawText: "source",
          pageCount: 2,
          chunks: {
            create: [
              {
                content: "Eligible applicants must be 501(c)(3) organizations operating in Texas.",
                pageStart: 1,
                pageEnd: 1,
                chunkIndex: 0,
                wordCount: 10,
              },
            ],
          },
        },
      },
    },
  });
  return { hidden, grant };
}

beforeEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("workspace pipeline", () => {
  it("keeps another organization's grant out of the workspace", async () => {
    const redwood = await prisma.organization.findUniqueOrThrow({ where: { slug: "redwood-health" } });
    const hidden = await prisma.grantProject.create({
      data: {
        organizationId: redwood.id,
        title: "Rural Clinic Expansion",
        funder: "Redwood Family Trust",
        status: "CREATED",
      },
    });
    const { createGrant } = await import("@/server/queries");
    const visible = await createGrant({ title: "Hidalgo Workforce Center", funder: "Texas CDBG" });
    const cards = await listGrantCards();
    expect(cards.map((card) => card.id)).toEqual([visible.id]);
    expect(cards.map((card) => card.title)).not.toContain("Rural Clinic Expansion");
    await expect(getGrantWorkspace(hidden.id)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("drafts from this workspace only, blocks a false citation, then exports", async () => {
    const { grant, hidden } = await seedIndexedGrant();
    const header = new TextEncoder().encode("%PDF-1.4\n");
    await expect(
      ingestPdf({ grantId: hidden.id, fileName: "x.pdf", bytes: header }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    const first = await runDraftAgent(
      grant.id,
      "Summarize the eligibility requirements for applicants.",
      { embedder, drafter },
    );
    expect(first.version).toBe(1);
    expect(first.factCheck.passed).toBe(true);
    let workspace = await getGrantWorkspace(grant.id);
    expect(workspace.status).toBe("PENDING_HUMAN_REVIEW");
    expect(workspace.drafts[0].retrieval.chunks.some((chunk) => chunk.content.includes("REDWOOD"))).toBe(
      false,
    );
    expect(workspace.drafts[0].retrieval.chunks.some((chunk) => chunk.pageStart === 1)).toBe(true);

    await rejectDraft(grant.id, first.draftId, "Needs a tighter summary.");
    workspace = await getGrantWorkspace(grant.id);
    expect(workspace.status).toBe("RAG_READY");
    expect(workspace.drafts[0].status).toBe("REJECTED");

    const second = await runDraftAgent(
      grant.id,
      "Summarize the eligibility requirements for applicants.",
      { embedder, drafter },
    );
    expect(second.version).toBe(2);

    const bad =
      "Eligible applicants must be 501(c)(3) organizations operating in Texas. [Page 1]\n\nThe invented deadline is next Friday and this paragraph cites a page the retrieval set does not contain. [Page 99]";
    await expect(approveDraft(grant.id, second.draftId, bad)).rejects.toBeInstanceOf(FactCheckRejected);
    expect((await getGrantWorkspace(grant.id)).status).toBe("PENDING_HUMAN_REVIEW");

    const good = "Eligible applicants must be 501(c)(3) organizations operating in Texas. [Page 1]";
    await approveDraft(grant.id, second.draftId, good);
    expect((await getGrantWorkspace(grant.id)).status).toBe("APPROVED");

    const exported = await exportGrant(grant.id);
    expect(exported.provider).toBe("local");
    expect(exported.externalUrl).toBeNull();
    const file = await readStorage(
      (
        await prisma.exportArtifact.findUniqueOrThrow({ where: { id: exported.id } })
      ).storagePath,
    );
    const markdown = file.toString("utf8");
    expect(markdown).toContain("# Hidalgo Workforce Center");
    expect(markdown).toContain(good);
    expect(markdown).not.toContain("REDWOOD SECRET");
    expect((await getGrantWorkspace(grant.id)).status).toBe("EXPORTED");
    await expect(exportGrant(grant.id)).rejects.toBeInstanceOf(AppError);
  });

  it("extracts page text from a real PDF and stores chunks", async () => {
    const { createGrant } = await import("@/server/queries");
    const created = await createGrant({ title: "PDF intake", funder: "State" });
    const bytes = await buildTextPdf([
      "Page one introduces the Hidalgo workforce center and the applicant rules.",
      "HELIO_PAGE_TWO_TOKEN appears only on the second page of this request.",
    ]);
    const result = await ingestPdf({ grantId: created.id, fileName: "rfp.pdf", bytes });
    expect(result.pageCount).toBe(2);
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.status).toBe("PROCESSING");
    const chunks = await prisma.documentChunk.findMany({
      where: { document: { grantId: created.id } },
    });
    expect(chunks.some((chunk) => chunk.content.includes("HELIO_PAGE_TWO_TOKEN"))).toBe(true);
    expect(chunks.some((chunk) => chunk.pageStart === 2 || chunk.pageEnd === 2)).toBe(true);
    const indexed = await embedGrant(created.id, embedder);
    expect(indexed.model).toBe("test-embedder");
    expect((await getGrantWorkspace(created.id)).status).toBe("RAG_READY");
  });

  it("refuses a storage path that leaves the workspace directory", () => {
    expect(() => absoluteFromRelative("../dev.db")).toThrow(/Invalid storage path/);
  });
});
