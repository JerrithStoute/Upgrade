import { readUpload } from "@/lib/uploads";
import { bidForLink } from "../../../data";

/** Types safe to open in the browser; anything else is downloaded (as on the files route). */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

/**
 * A plan sent with a sub's bid, for them to open or download from their bid page — the link is the key to
 * that one bid, and only the files picked for it open (like the page itself, no sign-in).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const found = await bidForLink(token);
  const file = found?.plans.find((f) => f.id === fileId);
  if (!file) return new Response("This link doesn't work any more", { status: 404 });
  let data: Buffer;
  try {
    data = await readUpload(file.storagePath);
  } catch {
    return new Response("That file isn't there any more — ask the builder to send it again", { status: 404 });
  }
  const inline = INLINE_TYPES.has(file.mimeType) && !/[?&]download=1\b/.test(req.url);
  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": inline ? file.mimeType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      ...(file.mimeType === "application/pdf" && inline ? {} : { "Content-Security-Policy": "sandbox" }),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
