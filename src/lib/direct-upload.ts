import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "./session-secret";
import { cloud } from "./cloud-storage";
import { checkUpload, type UploadKind } from "./file-types";
import { currentCompanyId } from "./tenant";
import { deleteUpload, filesDirect, newKey } from "./uploads";

/**
 * Uploads straight from the browser to cloud storage — the file never passes through the server (online,
 * when files go direct: uploads.ts filesDirect). In three steps:
 *
 *   1. start: the page says what it's about to send (name, size). After the caller has checked who may,
 *      this gives a one-time upload link to cloud storage, and a ticket naming where the file goes.
 *   2. The browser sends the file to that link itself (with a real progress bar).
 *   3. finish: the page hands the ticket back. The file is checked the way every upload is — its size, and
 *      what it really is (its first bytes) — and only then recorded by the caller. A file that fails is deleted.
 *
 * When files don't go direct (on a PC, or not switched on yet), start says so and the page sends the file
 * the old way, through the server.
 */

const TICKET_MINUTES = 60;
const key = () => new TextEncoder().encode(`${getSessionSecret()}\u0000upload`);

export type StartedUpload = { direct: false } | { direct: true; url: string; ticket: string } | { error: string };
export type Uploaded = { name: string; storagePath: string; mimeType: string; size: number };

/** Step 1: an upload link for a file of `size` bytes going in `folder` (the job's id), if it's under `maxBytes`. */
export async function startUpload(o: { folder: string; name: string; size: number; maxBytes: number; kind: UploadKind }): Promise<StartedUpload> {
  if (!filesDirect()) return { direct: false };
  const name = String(o.name ?? "").slice(0, 200) || "file";
  const size = Number(o.size);
  if (!(size > 0)) return { error: `“${name}” is empty` };
  if (size > o.maxBytes) return { error: `“${name}” is over the ${Math.round(o.maxBytes / (1024 * 1024))} MB limit` };
  const storagePath = await newKey(o.folder, name);
  const url = await cloud.signedUrl(storagePath, { method: "PUT", seconds: TICKET_MINUTES * 60 });
  const ticket = await new SignJWT({ kind: "upload", c: await currentCompanyId(), k: storagePath, n: name, s: size, m: o.maxBytes, u: o.kind, f: o.folder })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TICKET_MINUTES}m`)
    .sign(key());
  return { direct: true, url, ticket };
}

/**
 * Step 3: the file the ticket names, checked — there, the size it said, what it really is (allowed here) —
 * for the caller to record. `folder`: where the caller is recording it (the ticket must be for there).
 * Throws (and deletes the file) when it isn't right.
 */
export async function finishUpload(ticket: string, folder: string): Promise<Uploaded> {
  let t: { c: string; k: string; n: string; s: number; m: number; u: UploadKind; f: string };
  try {
    const { payload } = await jwtVerify(ticket, key());
    if (payload.kind !== "upload") throw new Error();
    t = payload as unknown as typeof t;
  } catch {
    throw new Error("That upload took too long — send the file again");
  }
  if (t.c !== (await currentCompanyId()) || t.f !== folder) throw new Error("That upload was for somewhere else");
  const size = await cloud.size(t.k);
  if (size == null) throw new Error(`“${t.n}” didn't arrive — send it again`);
  const fail = async (message: string): Promise<never> => {
    await deleteUpload(t.k).catch(() => {});
    throw new Error(message);
  };
  if (size === 0) return fail(`“${t.n}” is empty`);
  if (size > t.m) return fail(`“${t.n}” is over the ${Math.round(t.m / (1024 * 1024))} MB limit`);
  // What it really is — read from its first bytes (all the check needs), not the whole file.
  const checked = checkUpload(await cloud.head(t.k, 8192), t.n, t.u);
  if ("error" in checked) return fail(checked.error);
  return { name: t.n, storagePath: t.k, mimeType: checked.type, size };
}
