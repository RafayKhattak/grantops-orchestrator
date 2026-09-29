import "server-only";
import { prisma } from "@/lib/prisma";
import { downloadDrivePdf, listDrivePdfs } from "@/server/google-drive";
import { ingestPdf } from "@/server/ingest";

let running = false;

export async function syncDriveFolder(): Promise<{ imported: number }> {
  if (process.env.GRANTOPS_TEST === "1" || process.env.VITEST === "true") return { imported: 0 };
  if (running) return { imported: 0 };
  running = true;
  try {
    const organization = await prisma.organization.findUnique({ where: { slug: "helios-community" } });
    if (!organization) return { imported: 0 };
    const files = await listDrivePdfs();
    let imported = 0;
    for (const file of files) {
      const existing = await prisma.document.findFirst({ where: { driveFileId: file.id } });
      if (existing) continue;
      const downloaded = await downloadDrivePdf(file.id);
      const title = file.name.replace(/\.pdf$/i, "").trim() || "Drive import";
      const grant = await prisma.grantProject.create({
        data: {
          organizationId: organization.id,
          title,
          funder: "Imported from Drive",
          status: "CREATED",
          events: { create: { toStatus: "CREATED", reason: "Created from a PDF added to Google Drive." } },
        },
      });
      const result = await ingestPdf({
        grantId: grant.id,
        fileName: downloaded.name,
        bytes: downloaded.bytes,
      });
      await prisma.document.update({
        where: { id: result.documentId },
        data: { driveFileId: file.id },
      });
      imported += 1;
    }
    return { imported };
  } finally {
    running = false;
  }
}
