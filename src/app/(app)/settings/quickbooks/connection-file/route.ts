import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectionFile } from "@/lib/qb/connection";

/** The .qwc file for the Web Connector ("Add an application"). It has no password in it. */
export async function GET() {
  await requireAdmin();
  const [c, company] = await Promise.all([db.qbConnection.findFirst(), db.company.findFirst({ select: { name: true } })]);
  if (!c) return new Response("Set up the QuickBooks connection first.", { status: 404 });
  return new Response(connectionFile(c, company?.name ?? "Builder"), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="TheBuilderStation.qwc"',
      "Cache-Control": "no-store",
    },
  });
}
