import Link from "@/components/link";
import { addDays } from "date-fns";
import { Calculator, Home } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { specPicture } from "@/lib/spec";
import { carryToClosing, daysOnMarket, futureDrawInterest, offerMath, priceForProfit } from "@/lib/spec-math";
import { cn, money } from "@/lib/utils";
import { Badge, Button, EmptyState, PageHeader, Stat, buttonClasses } from "@/components/ui";
import { setSpec } from "../projects/[id]/spec/actions";

export const metadata = { title: "Spec homes" };

/** Every spec house: what it's costing to hold, break-even, and profit at list — today. */
export default async function SpecHomesPage() {
  await requireView("budget");
  const today = new Date();
  const [houses, others] = await Promise.all([
    db.project.findMany({ where: { isSpec: true }, orderBy: { number: "desc" }, select: { id: true } }),
    db.project.findMany({ where: { isSpec: false, status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { number: "desc" }, select: { id: true, number: true, name: true } }),
  ]);
  const in30 = addDays(today, 30);
  const rows = await Promise.all(
    houses.map(async (h) => {
      const p = await specPicture(h.id, today);
      const carry30 = carryToClosing(p.carrying, in30, p.stop);
      const cost30 = p.build + carry30 + (p.loanRate ? futureDrawInterest(p.toFinish, p.loanRate, today, in30) : 0);
      return {
        p,
        breakEven: priceForProfit(0, p.sheet, in30, cost30),
        atList: p.spec?.listPrice ? offerMath(p.spec.listPrice, p.sheet, in30, cost30) : null,
        dom: p.spec?.listedAt ? daysOnMarket(p.spec.listedAt, p.spec.soldAt ?? today) : null,
        sold: !!p.spec?.soldAt,
      };
    }),
  );
  const onMarket = rows.filter((r) => !r.sold);
  const perDay = onMarket.reduce((n, r) => n + r.p.perDay, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spec homes"
        description="Houses you built to sell: what each one costs to hold, its break-even, and what it makes at list — today. An offer comes in? Hit Offer."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="On the market" value={onMarket.length} />
        <Stat
          label="Listed at"
          value={money(
            onMarket.reduce((n, r) => n + (r.p.spec?.listPrice ?? 0), 0),
            true,
          )}
        />
        <Stat label="Carrying, all houses" value={`${money(perDay, true)}/day`} hint={`${money(perDay * 30, true)} a month`} tone={perDay ? "warn" : "default"} />
        <Stat
          label="Profit at list"
          value={money(
            onMarket.reduce((n, r) => n + (r.atList?.profit ?? 0), 0),
            true,
          )}
          hint="Closing in 30 days"
          tone="good"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Home} title="No spec houses yet" description="Mark a job as a spec house below — or tick “Spec house” when you edit a job." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">House</th>
                <th className="px-3 py-2.5 text-right font-medium">List price</th>
                <th className="px-3 py-2.5 text-right font-medium">Days listed</th>
                <th className="px-3 py-2.5 text-right font-medium">The house</th>
                <th className="px-3 py-2.5 text-right font-medium">Carrying</th>
                <th className="px-3 py-2.5 text-right font-medium">Break-even</th>
                <th className="px-3 py-2.5 text-right font-medium">Profit at list</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ p, breakEven, atList, dom, sold }) => (
                <tr key={p.project.id} className={cn(sold && "text-slate-500")}>
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${p.project.id}/spec`} className="font-medium text-slate-900 hover:text-blue-700">
                      <span className="text-slate-400">#{p.project.number}</span> {p.project.name}
                    </Link>
                    <span className="mt-0.5 block">
                      {sold ? (
                        <Badge status="APPROVED">Sold · {money(p.spec?.soldPrice, true)}</Badge>
                      ) : p.spec?.listPrice ? (
                        <Badge status="OPEN">On the market</Badge>
                      ) : (
                        <Badge>Not listed yet</Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.spec?.listPrice ? money(p.spec.listPrice, true) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{dom ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(p.build, true)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(p.carryingToDate, true)}
                    {p.perDay && !sold ? <span className="block text-xs text-amber-700">{money(p.perDay, true)}/day</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{sold ? "—" : breakEven ? money(Math.ceil(breakEven), true) : "—"}</td>
                  <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", atList && atList.profit < 0 && "text-rose-700")}>
                    {sold ? "—" : atList ? money(atList.profit, true) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!sold ? (
                      <Link href={`/projects/${p.project.id}/spec/offer`} className={buttonClasses("primary", "sm")}>
                        <Calculator className="h-3.5 w-3.5" /> Offer
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {others.length ? (
        <form action={setSpec} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm">
          <span className="text-slate-600">Mark a job as a spec house:</span>
          <select name="projectId" className="input !w-auto" required defaultValue="">
            <option value="" disabled>
              Pick a job…
            </option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.number} {o.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary">
            Mark spec
          </Button>
        </form>
      ) : null}
    </div>
  );
}
