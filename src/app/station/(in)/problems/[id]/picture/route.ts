import { systemDb } from "@/lib/db";
import { getStationUser } from "@/lib/station-auth";

/** The picture someone added to a problem report — for the Station's people only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getStationUser())) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const row = await systemDb.stationProblem.findUnique({ where: { id }, select: { screenshot: true } });
  if (!row?.screenshot) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.screenshot), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
