import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { imageType } from "./company-brand";
import { deleteUpload, uploadDir } from "./uploads";

export const COVER_MAX_BYTES = 8 * 1024 * 1024;

/** Where a job's cover picture is served (versioned by its file so a new one shows at once). */
export function coverUrl(project: { id: string; coverPath: string | null }) {
  return project.coverPath ? `/api/projects/${project.id}/cover?v=${path.basename(project.coverPath).slice(6, 14)}` : null;
}

/** Saves a job's cover picture (replacing the old file). PNG, JPG or WebP only, checked by its bytes. */
export async function saveCover(projectId: string, file: File, oldPath: string | null) {
  if (file.size > COVER_MAX_BYTES) throw new Error("The picture must be 8 MB or smaller");
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = imageType(bytes);
  if (!kind) throw new Error("The picture must be a PNG, JPG or WebP image");
  const rel = path.join(projectId, `cover-${randomUUID()}${kind.ext}`);
  await fs.mkdir(path.join(uploadDir(), projectId), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), rel), bytes);
  if (oldPath) await deleteUpload(oldPath);
  return { coverPath: rel, coverType: kind.type };
}
