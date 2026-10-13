"use client";

import { cn, money } from "@/lib/utils";
import { takeoffKeyOf, type SheetLine } from "@/lib/estimate-sheet";
import type { TakeoffDetailRow } from "@/lib/takeoff-data";

/** What the takeoff has for a line's cost code, added up (null: nothing there now). */
export function takeoffTotal(detail: Record<string, TakeoffDetailRow[]> | null | undefined, key: string | null) {
  const rows = key ? detail?.[key] : undefined;
  if (!rows?.length) return null;
  return Math.round(rows.reduce((n, r) => n + r.quantity * r.unitCost, 0) * 100) / 100;
}

/**
 * "From takeoff": on — the line's quantity and cost are the takeoff's (locked); off — they're
 * yours and the takeoff leaves the line alone. Only on lines the takeoff has a total for.
 * The same switch wherever a line shows (the estimate, a category's details).
 */
export function TakeoffSwitch({
  line: l,
  detail,
  onChange,
  label,
}: {
  line: SheetLine;
  detail: Record<string, TakeoffDetailRow[]> | null;
  onChange: (patch: Partial<SheetLine>) => void;
  /** Show the words beside it (where there's room). */
  label?: boolean;
}) {
  const key = takeoffKeyOf(l);
  if (!key) return null;
  const on = l.fromTakeoff;
  const total = takeoffTotal(detail, key);
  const mine = Math.round(l.quantity * l.unitCost * 100) / 100;
  const flip = () => {
    if (on) return onChange({ fromTakeoff: false, takeoffKey: key });
    if (total == null) return window.alert("The takeoff has nothing for this cost code right now — measure it on the plans first.");
    if (Math.abs(total - mine) >= 0.01 && !window.confirm(`Use the takeoff's ${money(total)} for this item? It replaces your ${money(mine)}.`)) return;
    onChange({ fromTakeoff: true, takeoffKey: key, quantity: 1, unit: "ls", unitCost: total, qtyFormula: null, costFormula: null });
  };
  const title = on
    ? "From takeoff: on — its quantity and cost come from the takeoff. Switch off to type your own."
    : `From takeoff: off — these numbers are yours and the takeoff leaves them alone.${total != null ? ` Switch on to use the takeoff's ${money(total)}.` : ""}`;
  return (
    <button type="button" role="switch" aria-checked={on} aria-label="From takeoff" title={title} onClick={flip} className="group/sw inline-flex shrink-0 items-center gap-1.5">
      <span className={cn("relative h-3.5 w-6 rounded-full transition-colors", on ? "bg-blue-600" : "bg-slate-300 group-hover/sw:bg-slate-400")}>
        <span className={cn("absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all", on ? "left-3" : "left-0.5")} />
      </span>
      {label ? <span className={cn("text-xs", on ? "text-blue-700" : "text-slate-500")}>From takeoff</span> : null}
    </button>
  );
}
