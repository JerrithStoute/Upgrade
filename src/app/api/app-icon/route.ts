import { appIcon, appIdentity, appIdentityFor } from "@/lib/app-identity";

/** The home-screen app's icon (s = size in pixels; mask = with room to be cut round; badge = the status-bar mark). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const size = Math.min(1024, Math.max(48, Number(q.get("s")) || 192));
  // (A client's or sub's app names its builder in the address: an iPhone asks without the sign-in.)
  const app = (await appIdentityFor(q.get("c"), q.get("w"))) ?? (await appIdentity());
  const png = await appIcon(app, size, { maskable: q.get("mask") === "1", badge: q.get("badge") === "1" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
