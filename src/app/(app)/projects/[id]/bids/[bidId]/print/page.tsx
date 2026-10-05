import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { companyLines } from "@/lib/company";
import { getBrand } from "@/lib/company-brand";
import { fmtDate, num } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";
import { isLadderLine } from "@/lib/bids";
import { PrintButton } from "../../../_components/print-button";

export const metadata = { title: "Request for prices" };

const UNIT_WORDS: Record<string, string> = {
  ea: "each",
  lf: "per lf",
  sf: "per sf",
  sy: "per sy",
  cy: "per cy",
  bf: "per bf",
  hr: "per hour",
  day: "per day",
  sq: "per square",
  ls: "lump sum",
  gal: "per gal",
  lb: "per lb",
  ton: "per ton",
};

/**
 * A bid as a sheet to print or save as PDF, for vendors who'd rather write prices in:
 * the items with quantities and a blank price per unit (the program works out the totals).
 * Their prices are typed in afterwards with "Prices" on the bid.
 */
export default async function BidPrintPage({ params }: { params: Promise<{ id: string; bidId: string }> }) {
  await requireStaff();
  const { id, bidId } = await params;
  const project = await getProject(id);
  const [bid, company, brand] = await Promise.all([
    db.bid.findFirst({ where: { id: bidId, projectId: project.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } }),
    db.company.findFirst(),
    getBrand(),
  ]);
  if (!bid) notFound();
  const from = companyLines(company);
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const items = bid.lines.filter((l) => !isLadderLine(l));
  const ladder = bid.lines.filter(isLadderLine);
  const codes = Array.from(new Map(items.map((l) => [l.codeKey, l.codeLabel])).entries());

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/projects/${project.id}/bids#bids`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Send to vendors
        </Link>
        <span className="text-sm text-slate-500">In the print window, choose &ldquo;Save as PDF&rdquo; to attach it to an email.</span>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>

      <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">Request for prices</p>
            <p className="text-sm text-slate-500">
              Bid #{bid.number} · {fmtDate(bid.sentAt)}
            </p>
            <p className="mt-1 text-sm text-slate-800">
              To: <strong>{bid.vendorName}</strong>
            </p>
          </div>
          <div className="text-right text-sm text-slate-700">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="Company logo" className="mb-1 ml-auto max-h-14 max-w-[14rem] object-contain" />
            ) : null}
            {from.map((l, i) => (
              <p key={i} className={i === 0 ? "font-semibold text-slate-900" : ""}>
                {l}
              </p>
            ))}
          </div>
        </div>
        <div className="border-b border-slate-200 py-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">
            Job #{project.number} — {project.name}
          </p>
          {address ? <p>Deliver to: {address}</p> : null}
        </div>
        {bid.notes ? <p className="whitespace-pre-wrap border-b border-slate-200 py-2 text-sm text-slate-800">{bid.notes}</p> : null}
        <p className="py-2 text-sm text-slate-700">
          Fill in your <strong>price per unit</strong>. If you&apos;d quote a different product, note it next to the item.
        </p>

        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-300">
              <th className="py-1.5 pr-2 font-medium">Item</th>
              <th className="py-1.5 pr-2 font-medium">SKU</th>
              <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
              <th className="py-1.5 pr-2 font-medium">Unit</th>
              <th className="w-36 py-1.5 pr-2 font-medium">Unit price</th>
              <th className="w-40 py-1.5 font-medium">Substitute / note</th>
            </tr>
          </thead>
          {codes.map(([key, label]) => (
            <tbody key={key}>
              <tr className="break-after-avoid">
                <td colSpan={6} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {label}
                </td>
              </tr>
              {items
                .filter((l) => l.codeKey === key)
                .map((l) => (
                  <tr key={l.id} className="break-inside-avoid border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-900">{l.name}</td>
                    <td className="py-2 pr-2 text-xs text-slate-500">{l.sku ?? ""}</td>
                    <td className="py-2 pr-2 text-right font-medium tabular-nums text-slate-900">{num(l.quantity)}</td>
                    <td className="py-2 pr-2 text-slate-600">{l.unit}</td>
                    <td className="py-2 pr-2 align-bottom">
                      <span className="flex items-end gap-1 border-b border-slate-400 text-[10px] text-slate-400">
                        $<span className="flex-1" />
                        {UNIT_WORDS[l.unit] ?? `per ${l.unit}`}
                      </span>
                    </td>
                    <td className="py-2 align-bottom">
                      <span className="block border-b border-slate-200">&nbsp;</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
        <p className="mt-3 text-xs text-slate-500">
          {items.length} item{items.length === 1 ? "" : "s"} · quantities include waste
        </p>
        {ladder.length ? (
          <div className="mt-6 break-inside-avoid">
            <p className="text-sm font-semibold text-slate-900">Price list — other lengths</p>
            <p className="text-xs text-slate-600">No quantity — just your price per board, so we can order the lengths that cost least.</p>
            <div className="mt-2 grid grid-cols-2 gap-x-8 sm:grid-cols-3">
              {ladder.map((l) => (
                <div key={l.id} className="flex items-end gap-2 py-1.5 text-sm">
                  <span className="w-24 shrink-0 text-slate-900">{l.name}</span>
                  <span className="flex flex-1 items-end border-b border-slate-400 text-[10px] text-slate-400">
                    $<span className="flex-1" />
                    each
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
