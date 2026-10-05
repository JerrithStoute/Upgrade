import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate, money, num } from "@/lib/utils";
import { Card, SubmitButton, buttonClasses } from "@/components/ui";
import { saveBidPrices } from "../actions";
import { isLadderLine } from "@/lib/bids";

export const metadata = { title: "Bid" };

/** One bid's lines as sent, with the vendor's prices — typed in here when they came another way. */
export default async function BidPage({ params, searchParams }: { params: Promise<{ id: string; bidId: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireStaff();
  const { id, bidId } = await params;
  const { saved } = await searchParams;
  const project = await getProject(id);
  const bid = await db.bid.findFirst({ where: { id: bidId, projectId: project.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!bid) notFound();
  // The price list (other lengths, no quantity) gets its own section at the end.
  const codes: [string, string][] = [
    ...Array.from(new Map(bid.lines.filter((l) => !isLadderLine(l)).map((l) => [l.codeKey, l.codeLabel])).entries()),
    ...(bid.lines.some(isLadderLine) ? ([["__ladder", "Price list — other lengths (a price per board, no quantity)"]] as [string, string][]) : []),
  ];
  const inSection = (l: (typeof bid.lines)[number], key: string) => (key === "__ladder" ? isLadderLine(l) : !isLadderLine(l) && l.codeKey === key);
  const total = bid.lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.quantity, 0);
  const priced = bid.lines.filter((l) => l.unitPrice != null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/projects/${project.id}/bids#bids`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Bids
        </Link>
        <h2 className="text-lg font-semibold text-slate-900">
          Bid #{bid.number} — {bid.vendorName}
        </h2>
        <span className="text-sm text-slate-500">
          sent {fmtDate(bid.sentAt)}
          {bid.afterLock ? " · re-bid" : ""} · {priced} of {bid.lines.length} priced · {money(total)} as sent
        </span>
        <span className="ml-auto flex gap-2">
          <a href={`/projects/${project.id}/bids/${bid.id}/excel`} className={buttonClasses("secondary", "sm")}>
            <Download className="h-3.5 w-3.5" /> Excel file
          </a>
          {bid.returnFileId ? (
            <a href={`/api/files/${bid.returnFileId}?download=1`} className={buttonClasses("secondary", "sm")}>
              <Download className="h-3.5 w-3.5" /> Returned file
            </a>
          ) : null}
        </span>
      </div>
      {saved ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">Prices saved.</p> : null}
      <p className="text-sm text-slate-600">
        Quantities are as sent. Type in prices the vendor gave you by phone or on paper; leave a price blank if they didn&apos;t quote it. Compare and take bids on the Bids page.
      </p>
      <form action={saveBidPrices}>
        <input type="hidden" name="projectId" value={project.id} />
        <input type="hidden" name="bidId" value={bid.id} />
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2 text-right">Unit price</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Substitute / notes</th>
              </tr>
            </thead>
            {codes.map(([key, label]) => (
              <tbody key={key} className="divide-y divide-slate-100">
                <tr className="bg-slate-50/70">
                  <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </td>
                </tr>
                {bid.lines
                  .filter((l) => inSection(l, key))
                  .map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-1.5 text-slate-900">
                        {l.name}
                        {l.sku ? <span className="block text-xs text-slate-500">{l.sku}</span> : null}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{isLadderLine(l) ? "" : num(l.quantity)}</td>
                      <td className="px-4 py-1.5 text-slate-600">{l.unit}</td>
                      <td className="px-4 py-1.5 text-right">
                        <input
                          name={`price_${l.id}`}
                          inputMode="decimal"
                          defaultValue={l.unitPrice ?? ""}
                          className="input !w-28 text-right tabular-nums"
                          aria-label={`Unit price for ${l.name}`}
                          placeholder="—"
                        />
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-slate-700">{l.unitPrice != null && !isLadderLine(l) ? money(l.unitPrice * l.quantity) : ""}</td>
                      <td className="px-4 py-1.5 text-xs text-slate-600">
                        {l.substitute ? <span className="block font-medium text-amber-800">Substitute: {l.substitute}</span> : null}
                        {l.note}
                      </td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </Card>
        <div className="mt-3">
          <SubmitButton>Save prices</SubmitButton>
        </div>
      </form>
    </div>
  );
}
