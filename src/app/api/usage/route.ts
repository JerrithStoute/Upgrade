import { getCurrentUser } from "@/lib/auth";
import { recordUsage } from "@/lib/usage";

/**
 * A page someone opened (<UsageBeacon> in the root layout): counted for the Station's Builders pages
 * (src/lib/usage.ts). Signed-in people only; takes just the page's address.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response(null, { status: 204 });
  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "";
  if (path.startsWith("/")) await recordUsage(me, path).catch((e) => console.error("[usage]", e));
  return new Response(null, { status: 204 });
}
