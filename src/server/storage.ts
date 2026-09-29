import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

export function storageRoot(): string {
  return path.join(process.cwd(), "storage");
}

export function absoluteFromRelative(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((part) => part === "." || part === ".." || part.includes("\\") || part.includes("\0"))
  ) {
    throw new Error("Invalid storage path.");
  }
  const root = path.resolve(storageRoot());
  const target = path.resolve(root, ...parts);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Storage path escaped the storage root.");
  }
  return target;
}

export async function writeStorage(relativePath: string, contents: Uint8Array | string): Promise<void> {
  const absolute = absoluteFromRelative(relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, contents);
}

export async function readStorage(relativePath: string): Promise<Buffer> {
  return fs.readFile(absoluteFromRelative(relativePath));
}

export async function removeStorage(relativePath: string): Promise<void> {
  await fs.rm(absoluteFromRelative(relativePath), { force: true });
}
