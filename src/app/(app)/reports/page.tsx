import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { ACTIVE, SOLD, jobRows, sumRows } from "@/lib/reports";
import { cn, money, titleCase } from "@/lib/utils";
import { EmptyState, Stat } from "@/components/ui";
import { PrintButton } from "../projects/[id]/_components/print-button";
import { Chips, Explain, Signed, pctText } from "./_parts";

const SHOW = [
  { value: "", label: "All sold jobs" },
  { value: "active", label: "Active" },
  { value: "done", label: "Finished" },
];

/** Profit by job: what you bid to make, and where each job is heading now. */
export default async function JobProfitReport({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "" } = await searchParams;
  const statuses = show === "active" ? ACTIVE : show === "done" ? ["COMPLETED"] : SOLD;
  const rows = await jobRows(statuses);
  const t = sumRows(rows);
  const fading = rows.filter((r) => r.fade < -0.5);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Chips base="/reports" param="show" value={show} options={SHOW} />
        <PrintButton label="Print / PDF" />
      </div>
      <Explain>
        <strong>Bid profit</strong> is the contract (approved estimate + approved change orders) minus what it was budgeted to cost. <strong>Heading for</strong> uses the budget —
        or what&apos;s been spent, once that&apos;s more. <strong>Fade</strong> is the profit a job has lost against its bid.
      </Explain>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Contracts" value={money(t.contract, true)} hint={`${rows.length} job${rows.length === 1 ? "" : "s"}`} />
        <Stat label="Bid profit" value={money(t.budgetProfit, true)} hint={pctText(t.contract ? t.budgetProfit / t.contract : null)} />
        <Stat label="Heading for" value={money(t.projectedProfit, true)} hint={pctText(t.projectedMargin)} tone={t.fade < -0.5 ? "warn" : "good"} />
        <Stat
          label="Profit faded"
          value={money(t.fade, true)}
          hint={`${fading.length} job${fading.length === 1 ? "" : "s"} over budget`}
          tone={fading.length ? "bad" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={TrendingDown} title="No jobs here" description="Jobs show once they're contracted." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print:overflow-visible print:border-0 print:shadow-none">
          <table className="w-full min-w-[1100px] text-left text-sm print:min-w-0 print:text-[10px]">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Job</th>
                <th className="px-3 py-2.5 text-right font-medium">Contract</th>
                <th className="px-3 py-2.5 text-right font-medium">Budget cost</th>
                <th className="px-3 py-2.5 text-right font-medium">Bid profit</th>
                <th className="px-3 py-2.5 text-right font-medium">Cost so far</th>
                <th className="px-3 py-2.5 text-right font-medium">Heading for</th>
                <th className="px-3 py-2.5 text-right font-medium">Fade</th>
                <th className="px-3 py-2.5 text-right font-medium">Billed</th>
                <th className="px-3 py-2.5 text-right font-medium">Collected</th>
                <th className="px-3 py-2.5 text-right font-medium">Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={cn(r.fade < -0.5 && "bg-rose-50/40")}>
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
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
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
        </div>
      )}
    </div>
  );
}
