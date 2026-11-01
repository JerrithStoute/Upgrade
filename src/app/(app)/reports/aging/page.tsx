import Link from "@/components/link";
import { agingRows } from "@/lib/reports";
import { AGING_BUCKETS } from "@/lib/report-math";
import { groupBy } from "@/lib/finance";
import { cn, fmtDate, money } from "@/lib/utils";
import { Tile } from "@/components/ui/tile";
import { ListFind } from "@/components/list-find";
import { PrintButton } from "../../projects/[id]/_components/print-button";
import { Explain, reportCard, reportHead, reportNote } from "../_parts";
import { companyClock } from "@/lib/company-zone";
import { requireView } from "@/lib/auth";

/** What clients owe you, by how late it is. */
export default async function AgingReport() {
  await requireView("reports");
  const today = (await companyClock()).now; // today, on the company's clock
  const rows = await agingRows(today);
  const sum = (key: string, list = rows) => list.filter((r) => r.bucket === key).reduce((n, r) => n + r.balance, 0);
  const total = rows.reduce((n, r) => n + r.balance, 0);
  const late = total - sum("current");
  const clients = groupBy(rows, (r) => r.client).sort((a, b) => b[1].reduce((n, r) => n + r.balance, 0) - a[1].reduce((n, r) => n + r.balance, 0));
  const cell = "px-3 py-2 text-right tabular-nums";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Tile label="Owed to you" value={money(total, true)} hint={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`} />
        {AGING_BUCKETS.map((b) => {
          const v = sum(b.key);
          return <Tile key={b.key} label={b.label} value={money(v, true)} tone={b.key === "current" || v < 0.5 ? undefined : b.key === "d30" ? "warn" : "bad"} />;
        })}
      </div>

      <section className={reportCard}>
        <header className={reportHead}>
          <ListFind listId="aging-list" placeholder="Find a client, job or invoice #…" />
          <PrintButton label="Print / PDF" small />
        </header>
        <div className={reportNote}>
          <Explain>
            Every invoice sent and not fully paid, as of {fmtDate(today)}, by how many days past its due date (an invoice with no due date is due the day it&apos;s issued).
          </Explain>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Nobody owes you anything. Sent invoices that aren&apos;t paid show here.</p>
        ) : (
          <div id="aging-list">
            <div className="overflow-x-auto print:overflow-visible" data-find-group>
              <table className="w-full min-w-[980px] text-left text-sm print:min-w-0 print:text-[10px]">
                <thead className="border-b border-slate-100 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-normal">Client · invoice</th>
                    <th className="px-3 py-2 font-normal">Due</th>
                    <th className="px-3 py-2 text-right font-normal">Days late</th>
                    {AGING_BUCKETS.map((b) => (
                      <th key={b.key} className="px-3 py-2 text-right font-normal">
                        {b.label}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right font-normal">Balance</th>
                  </tr>
                </thead>
                {clients.map(([client, list]) => (
                  // One tbody per client, so the find box hides a client with their invoices.
                  <tbody
                    key={client}
                    data-find={[client, ...list.map((r) => `#${r.number} ${r.project}`)].join(" ").toLowerCase()}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <tr className="bg-slate-50/60 font-medium text-slate-900">
                      <td className="px-4 py-2" colSpan={3}>
                        {client}
                      </td>
                      {AGING_BUCKETS.map((b) => (
                        <td key={b.key} className={cell}>
                          {sum(b.key, list) > 0.005 ? money(sum(b.key, list), true) : ""}
                        </td>
                      ))}
                      <td className={cn(cell, "pr-4")}>
                        {money(
                          list.reduce((n, r) => n + r.balance, 0),
                          true,
                        )}
                      </td>
                    </tr>
                    {list.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 pl-7">
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
                        <td className={cn(cell, "pr-4")}>
                          {money(r.balance, true)}
                          {r.balance < r.total - 0.005 ? <span className="block text-xs text-slate-500">of {money(r.total, true)}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tfoot className="border-t border-slate-200 font-medium text-slate-900">
                  <tr>
                    <td className="px-4 py-2" colSpan={3}>
                      Total {late > 0.5 ? <span className="ml-2 text-xs font-normal text-rose-700">{money(late, true)} late</span> : null}
                    </td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b.key} className={cell}>
                        {money(sum(b.key), true)}
                      </td>
                    ))}
                    <td className={cn(cell, "pr-4")}>{money(total, true)}</td>
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
