import "server-only";
import path from "path";
import { promises as fs, createReadStream } from "fs";
import { Readable } from "stream";
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

export const MAX_BYTES = 25 * 1024 * 1024;
/** Plan sets uploaded for takeoff are often large. */
export const PLAN_MAX_BYTES = 100 * 1024 * 1024;

export async function newKey(folder: string, name: string) {
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

/** A stored file's bytes — whole, in memory: only for small files (a logo, a picture). Others: fileResponse / readUploadStream. */
export function readUpload(storagePath: string) {
  return driver().get(normalizeKey(storagePath));
}

/**
 * Files go straight between the browser and cloud storage — not through the server — when it's on
 * (FILES_DIRECT=on, online). Its bucket needs the CORS rule in GOING-ONLINE.md first, so the plan viewer
 * may read from it; until then files come through the server as before.
 */
export const filesDirect = () => (process.env.STORAGE || "local").toLowerCase() === "cloud" && process.env.FILES_DIRECT === "on";

/** A stored file as a stream — read a piece at a time, never whole in memory. Throws (code ENOENT) when it's not there. */
export async function readUploadStream(storagePath: string): Promise<{ body: ReadableStream<Uint8Array>; size: number | null }> {
  const key = normalizeKey(storagePath);
  if (driver() === cloud) return { body: await cloud.stream(key), size: null };
  const file = path.join(uploadDir(), key);
  const { size } = await fs.stat(file);
  return { body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, size };
}

/** Types safe to open in the browser; anything else is always saved instead (it could run script). */
export const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf"]);

function disposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * A stored file, as the answer to the browser asking for it — after the route has checked who may see
 * it. With files direct (filesDirect), a short redirect to a private link straight to the file in cloud
 * storage: the server never holds it. Otherwise the file itself, streamed. `inline`: opened in the
 * browser (only types that are safe to) rather than saved.
 */
export async function fileResponse(storagePath: string, o: { name: string; mimeType: string; inline: boolean }): Promise<Response> {
  const inline = o.inline && INLINE_TYPES.has(o.mimeType);
  if (filesDirect()) {
    const url = await cloud.signedUrl(normalizeKey(storagePath), {
      method: "GET",
      filename: o.name,
      contentType: inline ? o.mimeType : "application/octet-stream",
      inline,
    });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  }
  const { body, size } = await readUploadStream(storagePath);
  return new Response(body, {
    headers: {
      "Content-Type": inline ? o.mimeType : "application/octet-stream",
      "Content-Disposition": disposition(inline ? "inline" : "attachment", o.name),
      ...(size != null ? { "Content-Length": String(size) } : {}),
      "X-Content-Type-Options": "nosniff",
      // Belt and braces for anything that is rendered. Skipped for PDFs: Chrome's viewer refuses sandboxed ones.
      ...(o.mimeType === "application/pdf" && inline ? {} : { "Content-Security-Policy": "sandbox" }),
      "Cache-Control": "private, max-age=3600",
    },
  });
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
