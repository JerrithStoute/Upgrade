import Link from "@/components/link";
import { ACTIVE, jobRows, sumRows } from "@/lib/reports";
import { dateInput, fmtDate, money, parseDateInput } from "@/lib/utils";
import { Button } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { ListFind } from "@/components/list-find";
import { PrintButton } from "../../projects/[id]/_components/print-button";
import { Explain, Signed, pctText, reportCard, reportHead, reportNote } from "../_parts";
import { requireView } from "@/lib/auth";

/**
 * Work in progress: how far along each active job is (cost-to-cost), what that's earned,
 * and whether you've billed ahead of the work (over-billed) or behind it (under-billed).
 */
export default async function WipReport({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  await requireView("reports");
  const { asOf: raw } = await searchParams;
  const picked = parseDateInput(raw ?? null);
  const asOf = picked ? new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 23, 59, 59) : new Date();
  const rows = await jobRows(ACTIVE, asOf);
  const t = sumRows(rows);
  const noBudget = rows.filter((r) => !r.hasBudget);
  const num = "px-3 py-2 text-right tabular-nums";

  return (
    <div className="space-y-4">
      <p className="hidden text-sm font-medium print:block">Work in progress as of {fmtDate(asOf)}</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Over-billed" value={money(t.overBilled, true)} hint="Billed ahead of the work" tone={t.overBilled > 0.5 ? "warn" : undefined} />
        <Tile label="Under-billed" value={money(Math.abs(t.underBilled), true)} hint="Work done, not invoiced" tone={t.underBilled < -0.5 ? "bad" : undefined} />
        <Tile label="Cost to finish" value={money(t.costToFinish, true)} hint={`${rows.length} active job${rows.length === 1 ? "" : "s"}`} />
        <Tile label="Profit still to come" value={money(t.profitToCome, true)} hint={`${money(t.profitToDate, true)} earned so far`} tone="good" />
      </div>

      <section className={reportCard}>
        <header className={reportHead}>
          <ListFind listId="wip-list" placeholder="Find a job…" />
          <span className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-1.5 text-xs">
              <label htmlFor="asOf" className="text-slate-600">
                As of
              </label>
              <input id="asOf" name="asOf" type="date" className="input !h-7 !w-auto !py-0 text-xs" defaultValue={dateInput(asOf)} />
              <Button type="submit" size="sm" variant="secondary" className="!h-7 !px-2.5 !text-xs">
                Show
              </Button>
            </form>
            <PrintButton label="Print / PDF" small />
          </span>
        </header>
        <div className={reportNote}>
          <Explain>
            <strong>% complete</strong> = cost so far ÷ expected total cost (the budget, or what&apos;s been spent once that&apos;s more). <strong>Earned</strong> = contract × %
            complete. <strong>Over-billed</strong>: you&apos;ve billed more than you&apos;ve earned — the client&apos;s money you&apos;re holding ahead of the work.{" "}
            <strong>Under-billed</strong>: work done you haven&apos;t invoiced yet.
          </Explain>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No active jobs. Contracted, in-progress and on-hold jobs show here.</p>
        ) : (
          <div id="wip-list">
            <div className="overflow-x-auto print:overflow-visible" data-find-group>
              <table className="w-full min-w-[1150px] text-left text-sm print:min-w-0 print:text-[10px]">
                <thead className="border-b border-slate-100 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-normal">Job</th>
                    <th className="px-3 py-2 text-right font-normal">Contract</th>
                    <th className="px-3 py-2 text-right font-normal">Expected cost</th>
                    <th className="px-3 py-2 text-right font-normal">Cost so far</th>
                    <th className="px-3 py-2 text-right font-normal">% done</th>
                    <th className="px-3 py-2 text-right font-normal">Earned</th>
                    <th className="px-3 py-2 text-right font-normal">Billed</th>
                    <th className="px-3 py-2 text-right font-normal">Over-billed</th>
                    <th className="px-3 py-2 text-right font-normal">Under-billed</th>
                    <th className="px-3 py-2 text-right font-normal">Cost to finish</th>
                    <th className="px-4 py-2 text-right font-normal">Profit to come</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-find={[`#${r.number}`, r.name, r.client].filter(Boolean).join(" ").toLowerCase()} className="border-b border-slate-100 align-top last:border-b-0">
                      <td className="px-4 py-2">
                        <Link href={`/projects/${r.id}/budget`} className="font-medium text-blue-700 hover:underline">
                          {r.number ? `#${r.number} ` : ""}
                          {r.name}
                        </Link>
                        {!r.hasBudget ? <span className="block text-xs text-amber-700">No approved estimate — can&apos;t tell % done</span> : null}
                      </td>
                      <td className={num}>{money(r.contract, true)}</td>
                      <td className={num}>{money(r.projectedCost, true)}</td>
                      <td className={num}>{money(r.actualCost, true)}</td>
                      <td className={num}>{pctText(r.pctComplete, 0)}</td>
                      <td className={num}>{money(r.earned, true)}</td>
                      <td className={num}>{money(r.billed, true)}</td>
                      <td className={num}>{r.overUnder > 0.5 ? <span className="text-amber-700">{money(r.overUnder, true)}</span> : <span className="text-slate-400">—</span>}</td>
                      <td className={num}>
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
                      <td className={num}>{money(r.costToFinish, true)}</td>
                      <td className="px-4 py-2 text-right">
                        <Signed value={r.profitToCome} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 font-medium text-slate-900">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    <td className={num}>{money(t.contract, true)}</td>
                    <td className={num}>{money(t.projectedCost, true)}</td>
                    <td className={num}>{money(t.actualCost, true)}</td>
                    <td className={num}>{pctText(t.projectedCost ? t.actualCost / t.projectedCost : null, 0)}</td>
                    <td className={num}>{money(t.earned, true)}</td>
                    <td className={num}>{money(t.billed, true)}</td>
                    <td className={num}>{money(t.overBilled, true)}</td>
                    <td className={num}>{money(Math.abs(t.underBilled), true)}</td>
                    <td className={num}>{money(t.costToFinish, true)}</td>
                    <td className="px-4 py-2 text-right">
                      <Signed value={t.profitToCome} />
                    </td>
                  </tr>
                </tfoot>
              </table>
              <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
                None match.
              </p>
            </div>
          </div>
        )}
        {noBudget.length ? (
          <div className="border-t border-slate-100 px-4 py-2">
            <Explain>Jobs without an approved estimate count what&apos;s billed as earned, so they&apos;re never shown over or under.</Explain>
          </div>
        ) : null}
      </section>
    </div>
  );
}
