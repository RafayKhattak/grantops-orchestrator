import { createHash } from "node:crypto";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function assertPdf(bytes: Uint8Array, maxBytes = MAX_PDF_BYTES): void {
  if (bytes.byteLength > maxBytes) {
    throw new Error("PDF exceeds the 20 MB limit.");
  }
  if (bytes.byteLength < 5) {
    throw new Error("File is not a PDF.");
  }
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  if (header !== "%PDF-") {
    throw new Error("File is not a PDF.");
  }
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "document.pdf";
  const cleaned = base.replace(/[^\x20-\x7E]+/g, "").replace(/[^A-Za-z0-9._ -]+/g, "_").trim();
  const safe = cleaned.replace(/\s+/g, "_").replace(/^\.+/, "").slice(0, 120);
  if (!safe) return "document.pdf";
  if (!safe.toLowerCase().endsWith(".pdf")) return `${safe}.pdf`;
  return safe;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
