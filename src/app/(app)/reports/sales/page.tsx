import Link from "@/components/link";
import { db } from "@/lib/db";
import { syncLeadStages } from "@/lib/leads";
import { LEAD_STAGES, OPEN_STAGES, daysBetween, winRate } from "@/lib/leads-math";
import { money } from "@/lib/utils";
import { Stat } from "@/components/ui";
import { PrintButton } from "../../projects/[id]/_components/print-button";
import { Chips, Explain, pctText } from "../_parts";
import { requireView } from "@/lib/auth";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Sales: win rate (overall, by source, by month), the pipeline, how long it takes, why you lose. */
export default async function SalesReport({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireView("reports");
  const { period = "" } = await searchParams;
  await syncLeadStages();
  const today = new Date();
  const from = period === "all" ? new Date(0) : period === "year" ? new Date(today.getFullYear(), 0, 1) : new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const leads = await db.lead.findMany({ select: { stage: true, source: true, value: true, createdAt: true, wonAt: true, lostAt: true, lostReason: true } });
  // Decided in the period counts toward win rate; added in the period counts toward sources.
  const decidedAt = (l: (typeof leads)[number]) => (l.stage === "WON" ? l.wonAt : l.stage === "LOST" ? l.lostAt : null);
  const decided = leads.filter((l) => {
    const d = decidedAt(l);
    return d && d >= from;
  });
  const rate = winRate(decided);
  const won = decided.filter((l) => l.stage === "WON");
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const cycle = won.filter((l) => l.wonAt).map((l) => daysBetween(l.createdAt, l.wonAt!));
  const avgDays = cycle.length ? Math.round(cycle.reduce((n, d) => n + d, 0) / cycle.length) : null;

  const sources = new Map<string, { leads: number; won: number; lost: number; open: number; wonValue: number }>();
  for (const l of leads.filter((x) => x.createdAt >= from || (decidedAt(x) ?? new Date(0)) >= from)) {
    const k = l.source || "Not set";
    const r = sources.get(k) ?? { leads: 0, won: 0, lost: 0, open: 0, wonValue: 0 };
    r.leads++;
    if (l.stage === "WON") {
      r.won++;
      r.wonValue += l.value ?? 0;
    } else if (l.stage === "LOST") r.lost++;
    else r.open++;
    sources.set(k, r);
  }
  const bySource = [...sources.entries()].sort((a, b) => b[1].leads - a[1].leads);

  const months = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const inMonth = leads.filter((l) => {
      const d = decidedAt(l);
      return d && d >= start && d < end;
    });
    return {
      label: `${MONTHS[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`,
      ...winRate(inMonth),
      added: leads.filter((l) => l.createdAt >= start && l.createdAt < end).length,
    };
  });
  const reasons = new Map<string, number>();
  for (const l of decided.filter((x) => x.stage === "LOST")) reasons.set(l.lostReason || "No reason given", (reasons.get(l.lostReason || "No reason given") ?? 0) + 1);
  const lostTotal = [...reasons.values()].reduce((n, c) => n + c, 0);
  const th = "px-3 py-2.5 font-medium";
  const td = "px-3 py-2 text-right tabular-nums";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips
          base="/reports/sales"
          param="period"
          value={period}
          options={[
            { value: "", label: "Last 12 months" },
            { value: "year", label: "This year" },
            { value: "all", label: "All time" },
          ]}
        />
        <PrintButton label="Print / PDF" />
      </div>
      <Explain>
        <strong>Win rate</strong> = won ÷ (won + lost), counting leads decided in the period. Leads still open don&apos;t count either way. Values are each lead&apos;s rough
        budget. Leads come from{" "}
        <Link href="/leads" className="font-medium text-blue-700 hover:underline">
          Leads
        </Link>
        .
      </Explain>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Win rate" value={pctText(rate.rate, 0)} hint={`${rate.won} won · ${rate.lost} lost`} tone="good" />
        <Stat
          label="Won"
          value={money(
            won.reduce((n, l) => n + (l.value ?? 0), 0),
            true,
          )}
          hint={`${won.length} job${won.length === 1 ? "" : "s"}`}
        />
        <Stat label="Days to win" value={avgDays ?? "—"} hint="Average, first call to won" />
        <Stat
          label="Open pipeline"
          value={money(
            open.reduce((n, l) => n + (l.value ?? 0), 0),
            true,
          )}
          hint={`${open.length} open lead${open.length === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-4 pt-3 text-sm font-semibold text-slate-900">Pipeline now</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className={th}>Stage</th>
                <th className={`${th} text-right`}>Leads</th>
                <th className={`${th} text-right`}>Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {LEAD_STAGES.filter((s) => s.key !== "WON").map((s) => {
                const here = open.filter((l) => l.stage === s.key);
                return (
                  <tr key={s.key}>
                    <td className="px-3 py-2">{s.label}</td>
                    <td className={td}>{here.length}</td>
                    <td className={td}>
                      {money(
                        here.reduce((n, l) => n + (l.value ?? 0), 0),
                        true,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-4 pt-3 text-sm font-semibold text-slate-900">Why you lose</h2>
          {lostTotal === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">No lost leads in this period.</p>
          ) : (
            <ul className="space-y-2 px-4 py-3 text-sm">
              {[...reasons.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([r, n]) => (
                  <li key={r}>
                    <div className="flex justify-between">
                      <span>{r}</span>
                      <span className="tabular-nums text-slate-600">
                        {n} · {pctText(n / lostTotal, 0)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
                      <div className="h-full bg-rose-400" style={{ width: `${(n / lostTotal) * 100}%` }} />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-3 text-sm font-semibold text-slate-900">By lead source</h2>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className={th}>Source</th>
              <th className={`${th} text-right`}>Leads</th>
              <th className={`${th} text-right`}>Won</th>
              <th className={`${th} text-right`}>Lost</th>
              <th className={`${th} text-right`}>Still open</th>
              <th className={`${th} text-right`}>Win rate</th>
              <th className={`${th} text-right`}>Won value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bySource.map(([k, r]) => (
              <tr key={k}>
                <td className="px-3 py-2 font-medium">{k}</td>
                <td className={td}>{r.leads}</td>
                <td className={td}>{r.won}</td>
                <td className={td}>{r.lost}</td>
                <td className={td}>{r.open}</td>
                <td className={`${td} font-medium`}>{pctText(r.won + r.lost ? r.won / (r.won + r.lost) : null, 0)}</td>
                <td className={td}>{money(r.wonValue, true)}</td>
              </tr>
            ))}
            {bySource.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                  No leads in this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-3 text-sm font-semibold text-slate-900">By month</h2>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className={th}>Month</th>
              <th className={`${th} text-right`}>New leads</th>
              <th className={`${th} text-right`}>Won</th>
              <th className={`${th} text-right`}>Lost</th>
              <th className={`${th} text-right`}>Win rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {months.map((m) => (
              <tr key={m.label}>
                <td className="px-3 py-2">{m.label}</td>
                <td className={td}>{m.added}</td>
                <td className={td}>{m.won}</td>
                <td className={td}>{m.lost}</td>
                <td className={td}>{pctText(m.rate, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
