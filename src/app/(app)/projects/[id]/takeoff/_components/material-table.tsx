import { ClipboardList } from "lucide-react";
import { boardPatternText, feetInches } from "@/lib/takeoff";
import type { CutList, MaterialLine } from "@/lib/takeoff-materials";
import { groupBy } from "@/lib/finance";
import { money, num } from "@/lib/utils";
import { EmptyState, TBody, TFoot, THead, Table, Td, Th, Tr } from "@/components/ui";
import { PriceCell } from "./price-cell";

/** The Material List table (by category) and the framing cut sheet — the Material List page and the takeoff tab. */
export function MaterialTable({
  lines,
  cutLists,
  total,
  showPrices,
  edit,
}: {
  lines: MaterialLine[];
  cutLists: CutList[];
  total: number;
  showPrices: boolean;
  /** The job's Material list: prices of Item List items can be changed right here. */
  edit?: { projectId: string; locked: boolean };
}) {
  const groups = groupBy(lines, (l) => l.category);
  return (
    <>
      {lines.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing to list yet" description="Measure takeoffs on your plans; their assembly items show up here." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th>SKU / vendor</Th>
              <Th>Used in</Th>
              <Th right>Qty</Th>
              <Th>Unit</Th>
              {showPrices ? (
                <>
                  <Th right>Unit cost</Th>
                  <Th right>Extended</Th>
                </>
              ) : null}
            </tr>
          </THead>
          {groups.map(([category, rows]) => (
            <TBody key={category}>
              <tr className="bg-slate-50/70">
                <td colSpan={showPrices ? 7 : 5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {category}
                </td>
              </tr>
              {rows.map((l) => (
                <Tr key={l.key}>
                  <Td className="font-medium text-slate-900">
                    {l.name}
                    {l.pieces ? (
                      <span className="ml-1.5 text-xs font-normal text-slate-500">
                        ({l.pieces} {l.pieces === 1 ? "pc" : "pcs"})
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-xs text-slate-500">{[l.sku, l.vendor].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td className="text-xs text-slate-500">{l.usedIn.join(", ")}</Td>
                  <Td right>{num(l.quantity)}</Td>
                  <Td>{l.unit}</Td>
                  {showPrices ? (
                    <>
                      <Td right className={l.extended > 0 ? undefined : "font-semibold text-amber-700"}>
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
                      </Td>
                      <Td right>{money(l.extended)}</Td>
                    </>
                  ) : null}
                </Tr>
              ))}
            </TBody>
          ))}
          {showPrices ? (
            <TFoot>
              <tr>
                <td colSpan={6} className="px-4 py-2.5">
                  Total material &amp; labor cost
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(total)}</td>
              </tr>
            </TFoot>
          ) : null}
        </Table>
      )}

      {cutLists.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="label">Framing cut sheet</p>
          <p className="mb-3 text-xs text-slate-500">
            What each stock board is cut into. Short pieces within a condition share boards; identical boards are grouped. 1/8&quot; saw kerf allowed per cut.
          </p>
          <div className="space-y-3">
            {cutLists.map((c) => (
              <div key={c.condition} className="break-inside-avoid">
                <p className="text-sm font-medium text-slate-900">
                  {c.condition}
                  {c.size ? <span className="font-normal text-slate-500"> · {c.size}</span> : null}
                </p>
                {c.boards.length ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                    {c.boards.map((b, i) => (
                      <li key={i} className="tabular-nums">
                        <span className="inline-block w-10 text-right font-medium text-slate-900">{b.count} ×</span> {boardPatternText(b)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-700">{c.pieces.map(([len, n]) => `${n} @ ${c.exact ? feetInches(len) : `${num(len)}'`}`).join(" · ")}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
