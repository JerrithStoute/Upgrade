import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { cache } from "react";
import { db } from "./db";
import { deleteUpload, uploadDir } from "./uploads";

/** The company's branding for this request: name, main color, logo address (or null). */
export const getBrand = cache(async () => {
  const c = await db.company.findFirst({ select: { name: true, brandColor: true, logoPath: true, updatedAt: true } });
  return {
    name: c?.name ?? "Your Company",
    color: c?.brandColor ?? null,
    // Versioned so a new logo shows right away despite caching.
    logoUrl: c?.logoPath ? `/api/company/logo?v=${c.updatedAt.getTime()}` : null,
  };
});

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** What the file really is, from its first bytes (not its name): PNG, JPEG or WebP only. */
export function imageType(b: Buffer): { type: string; ext: string } | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: ".png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: ".jpg" };
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return { type: "image/webp", ext: ".webp" };
  return null;
}

/** Saves a new logo (replacing the old one's file). Returns where it's stored and its type. */
export async function saveLogo(file: File, oldPath: string | null) {
  if (file.size > LOGO_MAX_BYTES) throw new Error("The logo must be 2 MB or smaller");
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = imageType(bytes);
  if (!kind) throw new Error("The logo must be a PNG, JPG or WebP image");
  const rel = path.join("company", `logo-${randomUUID()}${kind.ext}`);
  await fs.mkdir(path.join(uploadDir(), "company"), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), rel), bytes);
  if (oldPath) await deleteUpload(oldPath);
  return { logoPath: rel, logoType: kind.type };
}
