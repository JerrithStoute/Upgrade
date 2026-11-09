import { requireUser, requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { bidPdf } from "@/lib/bid-pdf";
import { bidPdfInput } from "@/lib/bid-pdf-input";
import { bidFileName } from "@/lib/bid-email";

/** A bid as a PDF to print and fill in by hand — the same one its email carries. Made fresh, prices blank. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; bidId: string }> }) {
  await requireView("estimates", { costs: "/dashboard" });
  const me = await requireUser();
  const { id, bidId } = await params;
  const project = await getProject(id);
  const [bid, company] = await Promise.all([db.bid.findFirst({ where: { id: bidId, projectId: project.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } }), db.company.findFirst()]);
  if (!bid) return new Response("Bid not found", { status: 404 });
  const pdf = await bidPdf(await bidPdfInput(bid, project, company, me.email));
  const name = bidFileName(bid, project, "pdf");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
