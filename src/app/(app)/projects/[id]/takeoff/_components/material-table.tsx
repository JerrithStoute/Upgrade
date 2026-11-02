import { ClipboardList } from "lucide-react";
import { boardPatternText, feetInches, itemNameKey } from "@/lib/takeoff";
import type { CutList, MaterialLine } from "@/lib/takeoff-materials";
import { groupBy } from "@/lib/finance";
import { money, num } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { PriceCell } from "./price-cell";
import { SubstituteButton } from "./substitute-button";

/** The Material List table, by category (no card of its own; Find narrows its rows). CutSheet is the framing cut sheet. */
export function MaterialTable({
  lines,
  total,
  showPrices,
  edit,
  pulled,
  stale,
}: {
  lines: MaterialLine[];
  total: number;
  showPrices: boolean;
  /** The job's Material list: prices of Item List items can be changed right here, and items substituted. */
  edit?: { projectId: string; locked: boolean; substitutions?: { fromName: string; toName: string }[] };
  /** Pulled from the company's inventory, by line key: shown under the quantity with what's left to order. */
  pulled?: Record<string, number>;
  /** Item List prices past their cost code's recheck time, by item id: why. */
  stale?: Record<string, string>;
}) {
  const groups = groupBy(lines, (l) => l.category);
  // "Instead of 2x6 × 26'" under a line that's a substitute on this job.
  const insteadOf = new Map((edit?.substitutions ?? []).map((s) => [itemNameKey(s.toName), s.fromName]));
  const cols = showPrices ? 7 : 5;
  if (lines.length === 0)
    return <EmptyState icon={ClipboardList} title="Nothing to list yet" description="Measure takeoffs on your plans; their assembly items show up here." />;
  return (
    <div className="overflow-x-auto" data-find-group>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-100 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 pl-4 font-normal">Item</th>
            <th className="px-3 py-2 font-normal">SKU · vendor</th>
            <th className="px-3 py-2 font-normal">Used in</th>
            <th className="px-3 py-2 text-right font-normal">Qty</th>
            <th className="px-3 py-2 font-normal">Unit</th>
            {showPrices ? (
              <>
                <th className="px-3 py-2 text-right font-normal">Unit cost</th>
                <th className="px-3 py-2 pr-4 text-right font-normal">Extended</th>
              </>
            ) : null}
          </tr>
        </thead>
        {groups.map(([category, rows]) => (
          // A category hides itself when Find leaves nothing in it.
          <tbody key={category} className="[&:not(:has([data-find]:not([hidden])))]:hidden">
            <tr>
              <td colSpan={cols} className="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-500">
                {category}
              </td>
            </tr>
            {rows.map((l) => (
              <tr
                key={l.key}
                data-find={[l.name, l.sku, l.vendor, category, ...l.usedIn].filter(Boolean).join(" ").toLowerCase()}
                className="border-t border-slate-100 align-top hover:bg-slate-50"
              >
                <td className="px-3 py-2 pl-4 text-slate-900">
                  {l.name}
                  {l.pieces ? (
                    <span className="ml-1.5 text-xs text-slate-500">
                      ({l.pieces} {l.pieces === 1 ? "pc" : "pcs"})
                    </span>
                  ) : null}
                  {edit && l.materialItemId ? (
                    <SubstituteButton projectId={edit.projectId} line={{ materialItemId: l.materialItemId, name: l.name, unit: l.unit, quantity: l.quantity }} />
                  ) : null}
                  {insteadOf.has(itemNameKey(l.name)) ? <span className="block text-xs text-amber-700">Instead of {insteadOf.get(itemNameKey(l.name))}</span> : null}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{[l.sku, l.vendor].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{l.usedIn.join(", ")}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(l.quantity)}
                  {pulled?.[l.key] ? (
                    <span className="block whitespace-nowrap text-xs text-emerald-700">
                      {num(pulled[l.key])} from inventory · order {num(Math.max(0, l.quantity - pulled[l.key]))}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{l.unit}</td>
                {showPrices ? (
                  <>
                    <td className={l.extended > 0 ? "px-3 py-2 text-right tabular-nums" : "px-3 py-2 text-right font-semibold text-amber-700"}>
                      {edit && l.materialItemId ? (
                        <PriceCell
                          projectId={edit.projectId}
                          materialItemId={l.materialItemId}
                          name={l.name}
                          unit={l.unit}
                          price={l.unitCost}
                          pinned={l.pinned}
                          locked={edit.locked}
                        />
                      ) : l.extended > 0 ? (
                        money(l.unitCost)
                      ) : (
                        <span title="No price — this goes to the estimate at $0. Price it in the takeoff.">No price</span>
                      )}
                      {l.materialItemId && !l.pinned && stale?.[l.materialItemId] ? (
                        <span className="no-print block whitespace-nowrap text-xs font-medium text-amber-700" title={stale[l.materialItemId]}>
                          Recheck price
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 pr-4 text-right tabular-nums">{money(l.extended)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        ))}
        {showPrices ? (
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold text-slate-900">
              <td colSpan={6} className="px-3 py-2.5 pl-4">
                Total material and labor cost
              </td>
              <td className="px-3 py-2.5 pr-4 text-right tabular-nums">{money(total)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
        None match.
      </p>
    </div>
  );
}

/** The framing cut sheet: what each stock board is cut into. */
export function CutSheet({ cutLists }: { cutLists: CutList[] }) {
  return (
    <>
      {cutLists.length > 0 ? (
        <section className="break-inside-avoid rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">Framing cut sheet</header>
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            What each stock board is cut into. Short pieces within a condition share boards; identical boards are grouped. 1/8&quot; saw kerf allowed per cut.
          </p>
          <div className="space-y-3 px-4 py-3">
            {cutLists.map((c, i) => (
              // Two takeoffs can share a name (a "2x6 Rafters" on each plan): keyed by place, not name.
              <div key={`${i}:${c.condition}`} className="break-inside-avoid">
                <p className="text-sm font-medium text-slate-900">
                  {c.condition}
                  {c.size ? <span className="font-normal text-slate-500"> · {c.size}</span> : null}
                  {c.method ? <span className="font-normal text-slate-500"> · {c.method}</span> : null}
                </p>
                {c.boards.length ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                    {c.boards.map((b, i) => (
                      <li key={i} className="tabular-nums">
                        <span className="inline-block w-10 text-right font-medium text-slate-900">{b.count} ×</span> {boardPatternText(b)}
                      </li>
                    ))}
                    {c.waste ? (
                      <li className="tabular-nums text-slate-500">
                        <span className="inline-block w-10 text-right font-medium text-slate-700">+{c.waste.count} ×</span> {num(c.waste.length)}&apos; for {num(c.waste.pct, 1)}%
                        waste
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-700">{c.pieces.map(([len, n]) => `${n} @ ${c.exact ? feetInches(len) : `${num(len)}'`}`).join(" · ")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
