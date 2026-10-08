import Link from "next/link";
import { cashFlow } from "@/lib/reports";
import { cn, fmtDate, money } from "@/lib/utils";
import { Button, Stat } from "@/components/ui";
import { PrintButton } from "../../projects/[id]/_components/print-button";
import { Chips, Explain, Signed } from "../_parts";

/** Money in and out by week or month: what happened, and what's coming. */
export default async function CashFlowReport({ searchParams }: { searchParams: Promise<{ by?: string; start?: string }> }) {
  const { by: rawBy, start: rawStart } = await searchParams;
  const by = rawBy === "week" ? "week" : "month";
  const start = rawStart != null && rawStart !== "" && Number.isFinite(Number(rawStart)) ? Number(rawStart) : null;
  const rows = await cashFlow(by);
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.in + r.expectedIn, r.out + r.expectedOut)));
  // From today on: cash on hand (if you gave it) plus what's expected, period by period.
  let running = start ?? 0;
  const ahead = rows.filter((r) => !r.past);
  const balance = new Map<string, number>();
  for (const r of ahead) {
    // Money already in or out this period is in the bank balance already: only what is still expected.
    running += r.expectedIn - r.expectedOut;
    balance.set(r.key, running);
  }
  const next = ahead.slice(0, by === "month" ? 2 : 5);
  const comingIn = next.reduce((n, r) => n + r.expectedIn, 0);
  const goingOut = next.reduce((n, r) => n + r.expectedOut, 0);
  const lowest = ahead.reduce<{ key: string; label: string; value: number } | null>((m, r) => {
    const v = balance.get(r.key)!;
    return !m || v < m.value ? { key: r.key, label: r.label, value: v } : m;
  }, null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="no-print flex flex-wrap items-center gap-3">
          <Chips
            base="/reports/cash-flow"
            param="by"
            value={by === "week" ? "week" : ""}
            keep={{ start: rawStart }}
            options={[
              { value: "", label: "By month" },
              { value: "week", label: "By week" },
            ]}
          />
          <form className="flex items-center gap-2 text-sm">
            {by === "week" ? <input type="hidden" name="by" value="week" /> : null}
            <label htmlFor="start" className="text-slate-600">
              Cash in the bank today
            </label>
            <input id="start" name="start" type="number" step="1" className="input !w-36" placeholder="optional" defaultValue={start ?? ""} />
            <Button type="submit" size="sm" variant="secondary">
              Show
            </Button>
          </form>
        </span>
        <PrintButton label="Print / PDF" />
      </div>
      <Explain>
        Past periods show money that actually came in (client payments) and went out (costs and bills marked paid). From this {by} on it shows what&apos;s <em>expected</em>: open
        invoices by due date, and bills and costs not paid yet by due date — anything already late is counted this {by}. Put in what&apos;s in the bank to see your balance ahead of
        time.
      </Explain>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={`Coming in · next ${next.length} ${by}s`} value={money(comingIn, true)} tone="good" />
        <Stat label={`Going out · next ${next.length} ${by}s`} value={money(goingOut, true)} tone={goingOut > comingIn ? "warn" : "default"} />
        <Stat
          label={start != null ? "Lowest balance ahead" : "Tightest stretch"}
          value={lowest ? money(lowest.value, true) : "—"}
          hint={lowest ? `${lowest.label}${start == null ? " (from $0 today)" : ""}` : undefined}
          tone={lowest && lowest.value < 0 ? "bad" : "default"}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
        <table className="w-full min-w-[860px] text-left text-sm print:min-w-0 print:text-[10px]">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">{by === "week" ? "Week" : "Month"}</th>
              <th className="w-[26%] px-3 py-2.5 font-medium">In / out</th>
              <th className="px-3 py-2.5 text-right font-medium">Money in</th>
              <th className="px-3 py-2.5 text-right font-medium">Money out</th>
              <th className="px-3 py-2.5 text-right font-medium">Net</th>
              <th className="px-3 py-2.5 text-right font-medium">{start != null ? "Bank balance" : "Running (from today)"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const inn = r.in + r.expectedIn;
              const out = r.out + r.expectedOut;
              return (
                <tr key={r.key} className={cn(r.current && "bg-blue-50/50", r.past && "text-slate-600")}>
                  <td className="px-3 py-2 align-top">
                    <span className="font-medium text-slate-900">{r.label}</span>
                    <span className="block text-xs text-slate-500">{r.past ? "Actual" : r.current ? "This " + by + " — actual + expected" : "Expected"}</span>
                    {r.inItems.length || r.outItems.length ? (
                      <details className="no-print mt-1 text-xs">
                        <summary className="cursor-pointer text-blue-700">
                          {r.inItems.length + r.outItems.length} item{r.inItems.length + r.outItems.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {[...r.inItems.map((i) => ({ ...i, side: "in" })), ...r.outItems.map((i) => ({ ...i, side: "out" }))].map((i, n) => (
                            <li key={n} className="flex gap-2">
                              <span className="w-12 shrink-0 text-slate-500">{fmtDate(i.date, "MMM d")}</span>
                              <Link href={i.href} className="min-w-0 flex-1 truncate hover:text-blue-700">
                                {i.label}
                              </Link>
                              <span className={cn("tabular-nums", i.side === "in" ? "text-emerald-700" : "text-rose-700")}>
                                {i.side === "in" ? "+" : "−"}
                                {money(i.amount, true)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="space-y-1">
                      <div className="flex h-2.5 overflow-hidden rounded bg-slate-100" title={`In ${money(inn)}`}>
                        <div className="bg-emerald-500" style={{ width: `${(r.in / scale) * 100}%` }} />
                        <div className="bg-emerald-300" style={{ width: `${(r.expectedIn / scale) * 100}%` }} />
                      </div>
                      <div className="flex h-2.5 overflow-hidden rounded bg-slate-100" title={`Out ${money(out)}`}>
                        <div className="bg-rose-500" style={{ width: `${(r.out / scale) * 100}%` }} />
                        <div className="bg-rose-300" style={{ width: `${(r.expectedOut / scale) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">
                    {money(inn, true)}
                    {r.expectedIn > 0.5 && r.in > 0.5 ? <span className="block text-xs text-slate-500">{money(r.expectedIn, true)} expected</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">
                    {money(out, true)}
                    {r.expectedOut > 0.5 && r.out > 0.5 ? <span className="block text-xs text-slate-500">{money(r.expectedOut, true)} expected</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right align-top font-medium">
                    <Signed value={inn - out} />
                  </td>
                  <td className="px-3 py-2 text-right align-top font-medium">
                    {balance.has(r.key) ? <Signed value={balance.get(r.key)!} /> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-emerald-500" /> received
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-emerald-300" /> expected in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-rose-500" /> paid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-rose-300" /> expected out
        </span>
      </p>
    </div>
  );
}
