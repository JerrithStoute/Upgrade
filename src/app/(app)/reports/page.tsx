import Link from "@/components/link";
import { ACTIVE, SOLD, jobRows, sumRows } from "@/lib/reports";
import { cn, money, titleCase } from "@/lib/utils";
import { Tile } from "@/components/ui/tile";
import { PrintButton } from "../projects/[id]/_components/print-button";
import { Chips, Explain, Signed, pctText, reportCard, reportHead, reportNote } from "./_parts";
import { ListFind } from "@/components/list-find";
import { requireView } from "@/lib/auth";

const SHOW = [
  { value: "", label: "All sold jobs" },
  { value: "active", label: "Active" },
  { value: "done", label: "Finished" },
];

/** Profit by job: what you bid to make, and where each job is heading now. */
export default async function JobProfitReport({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireView("reports");
  const { show = "" } = await searchParams;
  const statuses = show === "active" ? ACTIVE : show === "done" ? ["COMPLETED"] : SOLD;
  const rows = await jobRows(statuses);
  const t = sumRows(rows);
  const fading = rows.filter((r) => r.fade < -0.5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Contracts" value={money(t.contract, true)} hint={`${rows.length} job${rows.length === 1 ? "" : "s"}`} />
        <Tile label="Bid profit" value={money(t.budgetProfit, true)} hint={pctText(t.contract ? t.budgetProfit / t.contract : null)} />
        <Tile label="Heading for" value={money(t.projectedProfit, true)} hint={pctText(t.projectedMargin)} tone={t.fade < -0.5 ? "warn" : "good"} />
        <Tile
          label="Profit faded"
          value={money(t.fade, true)}
          hint={`${fading.length} job${fading.length === 1 ? "" : "s"} over budget`}
          tone={fading.length ? "bad" : "default"}
        />
      </div>

      <section className={reportCard}>
        <header className={reportHead}>
          <ListFind listId="profit-list" placeholder="Find a job…" />
          <span className="flex flex-wrap items-center gap-2">
            <Chips base="/reports" param="show" value={show} options={SHOW} />
            <PrintButton label="Print / PDF" small />
          </span>
        </header>
        <div className={reportNote}>
          <Explain>
            <strong>Bid profit</strong> is the contract (approved estimate + approved change orders) minus what it was budgeted to cost. <strong>Heading for</strong> uses the budget —
            or what&apos;s been spent, once that&apos;s more. <strong>Fade</strong> is the profit a job has lost against its bid.
          </Explain>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No jobs here. Jobs show once they&apos;re contracted.</p>
        ) : (
          <div id="profit-list">
            <div className="overflow-x-auto print:overflow-visible" data-find-group>
              <table className="w-full min-w-[1100px] text-left text-sm print:min-w-0 print:text-[10px]">
                <thead className="border-b border-slate-100 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-normal">Job</th>
                    <th className="px-3 py-2 text-right font-normal">Contract</th>
                    <th className="px-3 py-2 text-right font-normal">Budget cost</th>
                    <th className="px-3 py-2 text-right font-normal">Bid profit</th>
                    <th className="px-3 py-2 text-right font-normal">Cost so far</th>
                    <th className="px-3 py-2 text-right font-normal">Heading for</th>
                    <th className="px-3 py-2 text-right font-normal">Fade</th>
                    <th className="px-3 py-2 text-right font-normal">Billed</th>
                    <th className="px-3 py-2 text-right font-normal">Collected</th>
                    <th className="px-3 py-2 text-right font-normal">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-find={[`#${r.number}`, r.name, r.client].filter(Boolean).join(" ").toLowerCase()} className={cn("border-b border-slate-100 align-top last:border-b-0", r.fade < -0.5 && "bg-rose-50/40")}>
                      <td className="px-3 py-2">
                        <Link href={`/projects/${r.id}/budget`} className="font-medium text-slate-900 hover:text-blue-700">
                          {r.number ? <span className="text-slate-400">#{r.number} </span> : null}
                          {r.name}
                        </Link>
                        <span className="block text-xs text-slate-500">
                          {titleCase(r.status)}
                          {r.client ? ` · ${r.client}` : ""}
                          {!r.hasBudget ? " · no approved estimate" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.contract, true)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.hasBudget ? money(r.budgetCost, true) : <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2 text-right">
                        {r.hasBudget ? (
                          <>
                            <Signed value={r.budgetProfit} />
                            <span className="block text-xs text-slate-500">{pctText(r.budgetMargin)}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(r.actualCost, true)}
                        {r.budgetCost ? <span className="block text-xs text-slate-500">{pctText(r.actualCost / r.budgetCost, 0)} of budget</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        <Signed value={r.projectedProfit} />
                        <span className="block text-xs font-normal text-slate-500">{pctText(r.projectedMargin)}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{r.fade < -0.5 ? <Signed value={r.fade} className="font-semibold" /> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.billed, true)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.collected, true)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.owed > 0.5 ? money(r.owed, true) : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 font-medium text-slate-900">
                  <tr>
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(t.contract, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(t.budgetCost, true)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Signed value={t.budgetProfit} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(t.actualCost, true)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Signed value={t.projectedProfit} />
                      <span className="block text-xs font-normal text-slate-500">{pctText(t.projectedMargin)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Signed value={t.fade} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(t.billed, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(t.collected, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(t.owed, true)}</td>
                  </tr>
                </tfoot>
              </table>
              <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
                None match.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
