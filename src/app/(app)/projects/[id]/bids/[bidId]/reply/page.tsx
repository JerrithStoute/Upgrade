import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { isLadderLine } from "@/lib/bids";
import { asSent } from "@/lib/bid-beams";
import { fmtDateTime, money, num } from "@/lib/utils";
import { Card, buttonClasses } from "@/components/ui";
import { FilePreview } from "@/components/file-preview";
import { PrintButton } from "../../../_components/print-button";

export const metadata = { title: "What they sent" };

/**
 * A vendor's reply to a bid, the way they sent it: their file (a PDF or photo shown right here, their
 * Excel file to open) or the prices they typed online with their note — and their prices, laid out
 * like a quote to read over or print.
 */
export default async function BidReplyPage({ params }: { params: Promise<{ id: string; bidId: string }> }) {
  await requireView("estimates", { costs: "/dashboard" });
  const { id, bidId } = await params;
  const project = await getProject(id);
  const bid = await db.bid.findFirst({
    where: { id: bidId, projectId: project.id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, returnFile: { select: { id: true, name: true, mimeType: true, createdAt: true } } },
  });
  if (!bid) notFound();
  // How it came back, latest first: typed online, their Excel file, or a PDF / photo added.
  const replies = await db.activity.findMany({
    where: { projectId: project.id, type: { in: ["bid.answered", "bid.imported", "bid.file"] }, description: { startsWith: `Bid #${bid.number} (` } },
    orderBy: { createdAt: "desc" },
    select: { type: true, description: true, createdAt: true },
  });
  const latest = replies[0];
  const online = latest?.type === "bid.answered";
  const note = online ? (/ · "(.*)"$/.exec(latest.description)?.[1] ?? null) : null;
  const items = bid.lines.filter((l) => !isLadderLine(l));
  const ladder = bid.lines.filter((l) => isLadderLine(l));
  const total = items.reduce((s, l) => s + (l.unitPrice ?? 0) * l.quantity, 0);
  const priced = items.filter((l) => l.unitPrice != null).length;
  const how = online
    ? bid.returnFile
      ? "Sent online, with their quote"
      : "Typed online"
    : latest?.type === "bid.imported"
      ? "Their Excel file"
      : bid.returnFile
        ? "A file they sent"
        : "Typed in here";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/projects/${project.id}/bids#bids`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Bids
        </Link>
        <span className="ml-auto flex gap-2">
          <Link href={`/projects/${project.id}/bids/${bid.id}`} className={buttonClasses("secondary", "sm")}>
            <Pencil className="h-3.5 w-3.5" /> Prices
          </Link>
          <PrintButton />
        </span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          What {bid.vendorName} sent — Bid #{bid.number}
        </h2>
        <p className="text-sm text-slate-600">
          Job #{project.number} {project.name} · {how}
          {latest ? ` · ${fmtDateTime(latest.createdAt)}` : bid.receivedAt ? ` · ${fmtDateTime(bid.receivedAt)}` : ""} · {priced} of {items.length} priced
        </p>
        {note ? <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Their note: &ldquo;{note}&rdquo;</p> : null}
      </div>
      <div className={bid.returnFile ? "grid gap-4 lg:grid-cols-2" : ""}>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(asSent(l).quantity)}</td>
                  <td className="px-3 py-1.5 text-slate-600">{asSent(l).unit}</td>
                  <td className="px-3 py-1.5 text-slate-900">
                    {l.name}
                    {l.substitute ? <span className="block text-xs font-medium text-amber-800">Sub: {l.substitute}</span> : null}
                    {l.note ? <span className="block text-xs text-slate-500">{l.note}</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {l.unitPrice != null ? money(asSent(l).unitPrice ?? l.unitPrice) : <span className="text-slate-400">—</span>}
                    {asSent(l).len && l.unitPrice != null ? <span className="block text-xs text-slate-500">{money(l.unitPrice)}/lf</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.unitPrice != null ? money(l.unitPrice * l.quantity) : ""}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={4} className="px-3 py-2 text-right">
                  Total{priced < items.length ? ` (${priced} of ${items.length} priced)` : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(total)}</td>
              </tr>
            </tbody>
          </table>
          {ladder.length ? (
            <table className="w-full border-t border-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Other lengths</th>
                  <th className="px-3 py-2 text-right">Price per board</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ladder.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-1.5">{l.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {l.unitPrice != null ? money(l.unitPrice) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
        {bid.returnFile ? (
          <div className="no-print">
            <FilePreview fileId={bid.returnFile.id} mimeType={bid.returnFile.mimeType} name={bid.returnFile.name} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
