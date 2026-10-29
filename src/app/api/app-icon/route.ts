import { appIcon, appIdentity } from "@/lib/app-identity";

/** The home-screen app's icon (s = size in pixels; mask = with room to be cut round; badge = the status-bar mark). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const size = Math.min(1024, Math.max(48, Number(q.get("s")) || 192));
  const png = await appIcon(await appIdentity(), size, { maskable: q.get("mask") === "1", badge: q.get("badge") === "1" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
