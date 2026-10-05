import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { bidWorkbook } from "@/lib/bids";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * A bid's Excel file to send the vendor — made fresh each time, prices blank. It isn't
 * kept in the job's Files: only what vendors send back goes there. Its hidden bid and line
 * ids are the bid's own, so whichever copy comes back imports onto this bid.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; bidId: string }> }) {
  await requireStaff();
  const { id, bidId } = await params;
  const project = await getProject(id);
  const [bid, company] = await Promise.all([
    db.bid.findFirst({ where: { id: bidId, projectId: project.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } }),
    db.company.findFirst(),
  ]);
  if (!bid) return new Response("Bid not found", { status: 404 });
  const blank = { ...bid, lines: bid.lines.map((l) => ({ ...l, unitPrice: null })) };
  const data = await bidWorkbook(blank, project, company);
  const name = `Bid ${bid.number} - ${bid.vendorName} - Job ${project.number}`.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
      "Cache-Control": "no-store",
    },
  });
}
