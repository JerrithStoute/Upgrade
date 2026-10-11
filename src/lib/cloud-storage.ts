import { AwsClient } from "aws4fetch";

/**
 * Cloud file storage — Cloudflare R2, or anything else that speaks Amazon S3's language.
 * Used when STORAGE=cloud (see uploads.ts and backup.ts). Settings:
 *
 *   S3_ENDPOINT           https://<account id>.r2.cloudflarestorage.com
 *   S3_BUCKET             the bucket's name, e.g. builderstation-files
 *   S3_ACCESS_KEY_ID      an R2 API token's key id     (Object Read & Write, this bucket only)
 *   S3_SECRET_ACCESS_KEY  that token's secret
 *   S3_REGION             "auto" for R2 (the default)
 */

export type StoredObject = { key: string; size: number; modified: Date };

export class NotFound extends Error {
  code = "ENOENT";
  constructor(key: string) {
    super(`No file at ${key}`);
  }
}

export function cloudConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

let client: AwsClient | null = null;
function aws() {
  if (!cloudConfigured()) throw new Error("Cloud storage needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  client ??= new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    service: "s3",
    region: process.env.S3_REGION || "auto",
  });
  return client;
}

const bucketUrl = () => `${process.env.S3_ENDPOINT!.replace(/\/+$/, "")}/${encodeURIComponent(process.env.S3_BUCKET!)}`;
const objectUrl = (key: string) => `${bucketUrl()}/${key.split("/").map(encodeURIComponent).join("/")}`;

/**
 * The plain fetch. While handling a request, Next.js puts its own fetch in place, and that one
 * re-sends a signed upload as a stream of unknown length — which R2 refuses ("411
 * MissingContentLength"). Uploads go out with the original, which states the size.
 */
const plainFetch: typeof fetch = (input, init) => ((globalThis.fetch as typeof fetch & { _nextOriginalFetch?: typeof fetch })._nextOriginalFetch ?? globalThis.fetch)(input, init);

async function call(url: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  for (let attempt = 0; ; attempt++) {
    const signed = await aws().sign(url, init);
    // Sent as the bytes themselves (not the signed Request's stream), so the size goes with it.
    const res = await plainFetch(signed.url, { method: signed.method, headers: signed.headers, body: init.body ?? undefined });
    // Busy or a hiccup at Cloudflare's end: try again shortly (a few times).
    if ((res.status < 500 && res.status !== 429) || attempt >= 3) return res;
    await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
  }
}

async function fail(res: Response, what: string): Promise<never> {
  const body = await res.text().catch(() => "");
  const code = body.match(/<Code>([^<]*)<\/Code>/)?.[1] ?? "";
  throw new Error(`Cloud storage couldn't ${what} (${res.status}${code ? ` ${code}` : ""})`);
}

export const cloud = {
  async put(key: string, data: Buffer, contentType: string) {
    const res = await call(objectUrl(key), { method: "PUT", body: new Uint8Array(data), headers: { "Content-Type": contentType } });
    if (!res.ok) await fail(res, `save ${key}`);
  },

  async get(key: string): Promise<Buffer> {
    const res = await call(objectUrl(key));
    if (res.status === 404) throw new NotFound(key);
    if (!res.ok) await fail(res, `read ${key}`);
    return Buffer.from(await res.arrayBuffer());
  },

  /** The file's size, or null when there's no such file. */
  async size(key: string): Promise<number | null> {
    const res = await call(objectUrl(key), { method: "HEAD" });
    if (res.status === 404) return null;
    if (!res.ok) await fail(res, `check ${key}`);
    return Number(res.headers.get("content-length") ?? 0);
  },

  async remove(key: string) {
    const res = await call(objectUrl(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) await fail(res, `delete ${key}`);
  },

  /** Copies a file inside the bucket, without downloading it. */
  async copy(from: string, to: string) {
    const res = await call(objectUrl(to), { method: "PUT", headers: { "x-amz-copy-source": `/${encodeURIComponent(process.env.S3_BUCKET!)}/${from.split("/").map(encodeURIComponent).join("/")}` } });
    if (res.status === 404) throw new NotFound(from);
    if (!res.ok) await fail(res, `copy ${from}`);
  },

  /** Every file whose key starts with `prefix`. */
  async list(prefix: string): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    let token: string | undefined;
    do {
      const qs = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
      if (token) qs.set("continuation-token", token);
      const res = await call(`${bucketUrl()}?${qs}`);
      if (!res.ok) await fail(res, `list ${prefix}`);
      const xml = await res.text();
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const tag = (t: string) => m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? "";
        out.push({ key: unxml(tag("Key")), size: Number(tag("Size")), modified: new Date(tag("LastModified")) });
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unxml(xml.match(/<NextContinuationToken>([^<]*)</)?.[1] ?? "") : undefined;
    } while (token);
    return out;
  },
};

const unxml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
