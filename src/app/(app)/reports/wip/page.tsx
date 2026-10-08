import Link from "next/link";
import { Gauge } from "lucide-react";
import { ACTIVE, jobRows, sumRows } from "@/lib/reports";
import { dateInput, fmtDate, money, parseDateInput } from "@/lib/utils";
import { Button, EmptyState, Stat } from "@/components/ui";
import { PrintButton } from "../../projects/[id]/_components/print-button";
import { Explain, Signed, pctText } from "../_parts";

/**
 * Work in progress: how far along each active job is (cost-to-cost), what that's earned,
 * and whether you've billed ahead of the work (over-billed) or behind it (under-billed).
 */
export default async function WipReport({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  const { asOf: raw } = await searchParams;
  const picked = parseDateInput(raw ?? null);
  const asOf = picked ? new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 23, 59, 59) : new Date();
  const rows = await jobRows(ACTIVE, asOf);
  const t = sumRows(rows);
  const noBudget = rows.filter((r) => !r.hasBudget);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="no-print flex items-center gap-2 text-sm">
          <label htmlFor="asOf" className="text-slate-600">
            As of
          </label>
          <input id="asOf" name="asOf" type="date" className="input !w-auto" defaultValue={dateInput(asOf)} />
          <Button type="submit" size="sm" variant="secondary">
            Show
          </Button>
        </form>
        <p className="hidden text-sm font-medium print:block">Work in progress as of {fmtDate(asOf)}</p>
        <PrintButton label="Print / PDF" />
      </div>
      <Explain>
        <strong>% complete</strong> = cost so far ÷ expected total cost (the budget, or what&apos;s been spent once that&apos;s more). <strong>Earned</strong> = contract × %
        complete. <strong>Over-billed</strong>: you&apos;ve billed more than you&apos;ve earned — the client&apos;s money you&apos;re holding ahead of the work.{" "}
        <strong>Under-billed</strong>: work done you haven&apos;t invoiced yet.
      </Explain>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Over-billed" value={money(t.overBilled, true)} hint="Billed ahead of the work" tone={t.overBilled > 0.5 ? "warn" : "default"} />
        <Stat label="Under-billed" value={money(Math.abs(t.underBilled), true)} hint="Work done, not invoiced" tone={t.underBilled < -0.5 ? "bad" : "default"} />
        <Stat label="Cost to finish" value={money(t.costToFinish, true)} hint={`${rows.length} active job${rows.length === 1 ? "" : "s"}`} />
        <Stat label="Profit still to come" value={money(t.profitToCome, true)} hint={`${money(t.profitToDate, true)} earned so far`} tone="good" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Gauge} title="No active jobs" description="Contracted, in-progress and on-hold jobs show here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print:overflow-visible print:border-0 print:shadow-none">
          <table className="w-full min-w-[1150px] text-left text-sm print:min-w-0 print:text-[10px]">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Job</th>
                <th className="px-3 py-2.5 text-right font-medium">Contract</th>
                <th className="px-3 py-2.5 text-right font-medium">Expected cost</th>
                <th className="px-3 py-2.5 text-right font-medium">Cost so far</th>
                <th className="px-3 py-2.5 text-right font-medium">% done</th>
                <th className="px-3 py-2.5 text-right font-medium">Earned</th>
                <th className="px-3 py-2.5 text-right font-medium">Billed</th>
                <th className="px-3 py-2.5 text-right font-medium">Over-billed</th>
                <th className="px-3 py-2.5 text-right font-medium">Under-billed</th>
                <th className="px-3 py-2.5 text-right font-medium">Cost to finish</th>
                <th className="px-3 py-2.5 text-right font-medium">Profit to come</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <Link href={`/projects/${r.id}/budget`} className="font-medium text-slate-900 hover:text-blue-700">
                      {r.number ? <span className="text-slate-400">#{r.number} </span> : null}
                      {r.name}
                    </Link>
                    {!r.hasBudget ? <span className="block text-xs text-amber-700">No approved estimate — can&apos;t tell % done</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.contract, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.projectedCost, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.actualCost, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pctText(r.pctComplete, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.earned, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.billed, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.overUnder > 0.5 ? <span className="text-amber-700">{money(r.overUnder, true)}</span> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.overUnder < -0.5 ? (
                      <>
                        <span className="font-semibold text-rose-700">{money(-r.overUnder, true)}</span>
                        <Link href={`/projects/${r.id}/invoices/new`} className="no-print block text-xs font-medium text-blue-700 hover:underline">
                          Bill it
                        </Link>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.costToFinish, true)}</td>
                  <td className="px-3 py-2 text-right">
                    <Signed value={r.profitToCome} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.contract, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.projectedCost, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.actualCost, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pctText(t.projectedCost ? t.actualCost / t.projectedCost : null, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.earned, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.billed, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.overBilled, true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(Math.abs(t.underBilled), true)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(t.costToFinish, true)}</td>
                <td className="px-3 py-2.5 text-right">
                  <Signed value={t.profitToCome} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {noBudget.length ? <Explain>Jobs without an approved estimate count what&apos;s billed as earned, so they&apos;re never shown over or under.</Explain> : null}
    </div>
  );
}
