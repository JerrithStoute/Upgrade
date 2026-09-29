import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";

export function uploadDir() {
  const configured = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

const MAX_BYTES = 25 * 1024 * 1024;

/** Persist an uploaded File to disk; returns storage metadata for a FileAsset row. */
export async function saveUpload(file: File, projectId: string) {
  if (file.size === 0) throw new Error("Empty file");
  if (file.size > MAX_BYTES) throw new Error("File exceeds 25 MB limit");
  const ext = path.extname(file.name).toLowerCase().slice(0, 10);
  const relDir = projectId;
  const relPath = path.join(relDir, `${randomUUID()}${ext}`);
  await fs.mkdir(path.join(uploadDir(), relDir), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), relPath), Buffer.from(await file.arrayBuffer()));
  return {
    name: file.name,
    storagePath: relPath,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function deleteUpload(storagePath: string) {
  try {
    await fs.unlink(path.join(uploadDir(), storagePath));
  } catch {
    /* already gone */
  }
}
