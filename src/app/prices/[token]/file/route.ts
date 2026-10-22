import { runAsCompany } from "@/lib/tenant";
import { db } from "@/lib/db";
import { bidWorkbook } from "@/lib/bids";
import { bidPdf } from "@/lib/bid-pdf";
import { bidFileName } from "@/lib/bid-email";
import { companyLines } from "@/lib/company";
import { fmtDate } from "@/lib/utils";
import { bidForLink } from "../../data";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * The bid's Excel file (?kind=xlsx) or PDF (?kind=pdf), for the vendor to download from their price
 * page — the link is the key to that one bid, like the page itself (no sign-in). Made fresh, prices blank.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await bidForLink(token);
  if (!found) return new Response("This link doesn't work any more", { status: 404 });
  const kind = /[?&]kind=pdf\b/.test(req.url) ? "pdf" : "xlsx";
  const { bid } = found;
  const data = await runAsCompany(found.companyId, async () => {
    const company = await db.company.findFirst();
    const project = await db.project.findUniqueOrThrow({ where: { id: bid.projectId } });
    const blank = { ...bid, lines: bid.lines.map((l) => ({ ...l, unitPrice: null })) };
    if (kind === "xlsx") return bidWorkbook(blank, project, company);
    const address = [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
    return bidPdf({ bid: blank, project, address, from: companyLines(company), date: fmtDate(new Date()), replyTo: company?.email ?? null });
  });
  const name = bidFileName(bid, bid.project, kind);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": kind === "pdf" ? "application/pdf" : XLSX,
      "Content-Disposition": `${kind === "pdf" ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
