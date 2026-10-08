import Link from "next/link";
import { Receipt } from "lucide-react";
import { agingRows } from "@/lib/reports";
import { AGING_BUCKETS } from "@/lib/report-math";
import { groupBy } from "@/lib/finance";
import { cn, fmtDate, money } from "@/lib/utils";
import { EmptyState, Stat } from "@/components/ui";
import { PrintButton } from "../../projects/[id]/_components/print-button";
import { Explain } from "../_parts";

/** What clients owe you, by how late it is. */
export default async function AgingReport() {
  const today = new Date();
  const rows = await agingRows(today);
  const sum = (key: string, list = rows) => list.filter((r) => r.bucket === key).reduce((n, r) => n + r.balance, 0);
  const total = rows.reduce((n, r) => n + r.balance, 0);
  const late = total - sum("current");
  const clients = groupBy(rows, (r) => r.client).sort((a, b) => b[1].reduce((n, r) => n + r.balance, 0) - a[1].reduce((n, r) => n + r.balance, 0));
  const cell = "px-3 py-2 text-right tabular-nums";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Explain>
          Every invoice sent and not fully paid, as of {fmtDate(today)}, by how many days past its due date (an invoice with no due date is due the day it&apos;s issued).
        </Explain>
        <PrintButton label="Print / PDF" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Owed to you" value={money(total, true)} hint={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`} />
        {AGING_BUCKETS.map((b) => {
          const v = sum(b.key);
          return <Stat key={b.key} label={b.label} value={money(v, true)} tone={b.key === "current" || v < 0.5 ? "default" : b.key === "d30" ? "warn" : "bad"} />;
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Nobody owes you anything" description="Sent invoices that aren't paid show here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
          <table className="w-full min-w-[980px] text-left text-sm print:min-w-0 print:text-[10px]">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Client · invoice</th>
                <th className="px-3 py-2.5 font-medium">Due</th>
                <th className="px-3 py-2.5 text-right font-medium">Days late</th>
                {AGING_BUCKETS.map((b) => (
                  <th key={b.key} className="px-3 py-2.5 text-right font-medium">
                    {b.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            {clients.map(([client, list]) => (
              <tbody key={client} className="divide-y divide-slate-100 border-t border-slate-200">
                <tr className="bg-slate-50/60 font-medium text-slate-900">
                  <td className="px-3 py-2" colSpan={3}>
                    {client}
                  </td>
                  {AGING_BUCKETS.map((b) => (
                    <td key={b.key} className={cell}>
                      {sum(b.key, list) > 0.005 ? money(sum(b.key, list), true) : ""}
                    </td>
                  ))}
                  <td className={cell}>
                    {money(
                      list.reduce((n, r) => n + r.balance, 0),
                      true,
                    )}
                  </td>
                </tr>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 pl-6">
                      <Link href={`/projects/${r.projectId}/invoices/${r.id}`} className="text-blue-700 hover:underline">
                        Invoice #{r.number}
                      </Link>
                      <span className="ml-1.5 text-xs text-slate-500">{r.project}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.due)}</td>
                    <td className={cn(cell, r.days > 30 ? "font-semibold text-rose-700" : r.days > 0 ? "text-amber-700" : "text-slate-400")}>{r.days > 0 ? r.days : "—"}</td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b.key} className={cell}>
                        {r.bucket === b.key ? money(r.balance, true) : ""}
                      </td>
                    ))}
                    <td className={cell}>
                      {money(r.balance, true)}
                      {r.balance < r.total - 0.005 ? <span className="block text-xs text-slate-500">of {money(r.total, true)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot className="border-t border-slate-300 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-3 py-2.5" colSpan={3}>
                  Total {late > 0.5 ? <span className="ml-2 text-xs font-normal text-rose-700">{money(late, true)} late</span> : null}
                </td>
                {AGING_BUCKETS.map((b) => (
                  <td key={b.key} className={cell}>
                    {money(sum(b.key), true)}
                  </td>
                ))}
                <td className={cell}>{money(total, true)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
