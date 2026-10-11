import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { normalizeKey } from "./storage-key";
import { currentCompanyId } from "./tenant";
import { checkUpload, type UploadKind } from "./file-types";
import { cloud } from "./cloud-storage";

/**
 * Where uploaded files live (plans, photos, documents, logos). Every read and write goes
 * through here, so the program doesn't care where that is:
 *
 *   STORAGE=local (default)  a folder — UPLOAD_DIR, or ./uploads
 *   STORAGE=cloud            cloud storage (S3-compatible: Cloudflare R2 / Amazon S3) — online; see cloud-storage.ts
 *
 * A file is known by its key, e.g. "<companyId>/<projectId>/<random>.pdf" — every new
 * file sits under its company. Keys use "/"; older ones (saved before companies were
 * separated, on Windows) have no company part and "\" — they're read the same way.
 */

export function uploadDir() {
  const configured = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

export { normalizeKey };

type Driver = {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
};

const local: Driver = {
  async put(key, data) {
    const file = path.join(uploadDir(), key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  },
  get: (key) => fs.readFile(path.join(uploadDir(), key)),
  async remove(key) {
    try {
      await fs.unlink(path.join(uploadDir(), key));
    } catch {
      /* already gone */
    }
  },
};

function driver(): Driver {
  const kind = (process.env.STORAGE || "local").toLowerCase();
  if (kind === "local") return local;
  if (kind === "cloud") return cloud;
  throw new Error(`File storage "${kind}" isn't set up yet`);
}

const MAX_BYTES = 25 * 1024 * 1024;
/** Plan sets uploaded for takeoff are often large. */
export const PLAN_MAX_BYTES = 100 * 1024 * 1024;

async function newKey(folder: string, name: string) {
  const ext = path.extname(name).toLowerCase().slice(0, 10);
  return normalizeKey(`${await currentCompanyId()}/${folder}/${randomUUID()}${ext}`);
}

/**
 * Store an uploaded File; returns storage metadata for a FileAsset row. The file is
 * checked by what it really is (its first bytes), and must be a kind allowed here —
 * `kind`: "document" (most places), "photo" (daily log photos) or "plan" (takeoff).
 */
export async function saveUpload(file: File, folder: string, maxBytes = MAX_BYTES, kind: UploadKind = "document") {
  if (file.size === 0) throw new Error(`“${file.name}” is empty`);
  if (file.size > maxBytes) throw new Error(`“${file.name}” is over the ${Math.round(maxBytes / (1024 * 1024))} MB limit`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const checked = checkUpload(bytes, file.name, kind);
  if ("error" in checked) throw new Error(checked.error);
  const key = await newKey(folder, file.name);
  // Its real type — not what the browser claimed.
  await driver().put(key, bytes, checked.type);
  return { name: file.name.slice(0, 200), storagePath: key, mimeType: checked.type, size: file.size };
}

/** Store a file the program made (a bid workbook…); returns storage metadata for a FileAsset row. */
export async function saveBuffer(data: Buffer, name: string, mimeType: string, folder: string) {
  const key = await newKey(folder, name);
  await driver().put(key, data, mimeType);
  return { name, storagePath: key, mimeType, size: data.length };
}

/** Store bytes under a name the caller chose (logos, cover pictures), in the company's folder. */
export async function writeUpload(key: string, data: Buffer, contentType: string) {
  const k = normalizeKey(`${await currentCompanyId()}/${key}`);
  await driver().put(k, data, contentType);
  return k;
}

/** A stored file's bytes. */
export function readUpload(storagePath: string) {
  return driver().get(normalizeKey(storagePath));
}

export async function deleteUpload(storagePath: string) {
  let key: string;
  try {
    key = normalizeKey(storagePath);
  } catch {
    return;
  }
  await driver().remove(key);
}
