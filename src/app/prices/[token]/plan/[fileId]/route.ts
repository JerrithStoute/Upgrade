import { fileResponse } from "@/lib/uploads";
import { bidForLink } from "../../../data";

/**
 * A plan sent with a sub's bid, for them to open or download from their bid page — the link is the key to
 * that one bid, and only the files picked for it open (like the page itself, no sign-in). Straight from
 * cloud storage when files go direct, else streamed (uploads.ts fileResponse).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const found = await bidForLink(token);
  const file = found?.plans.find((f) => f.id === fileId);
  if (!file) return new Response("This link doesn't work any more", { status: 404 });
  try {
    return await fileResponse(file.storagePath, { name: file.name, mimeType: file.mimeType, inline: !/[?&]download=1\b/.test(req.url) });
  } catch {
    return new Response("That file isn't there any more — ask the builder to send it again", { status: 404 });
  }
}
