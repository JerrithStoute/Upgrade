"use client";

import Link from "next/link";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { boardPatternText, feetInches, type BoardPattern } from "@/lib/takeoff";
import { cn, money, num } from "@/lib/utils";

export type TotalsPanelData = {
  conditions: {
    id: string;
    name: string;
    color: string;
    type: string;
    unit: string;
    metric: string;
    sheet: number; // on the sheet being viewed
    job: number; // every sheet, before waste
    withWaste: number;
    wastePct: number;
    price: number; // incl. markup
    unscaled: number;
    lines: { name: string; quantity: number; unit: string }[]; // what it orders
  }[];
  materials: {
    lines: { key: string; name: string; category: string; quantity: number; unit: string }[];
    cutLists: {
      condition: string;
      size: string | null;
      pieces: [number, number][];
      exact: boolean;
      boards: BoardPattern[];
      method: string | null;
      waste: { length: number; count: number; pct: number } | null;
    }[];
  };
};

export type PanelView = "totals" | "materials";

/**
 * Side panel over the plan: each condition's total (this sheet and the job) with
 * what it orders, and the combined Material List. The data comes from the server
 * and refreshes after every change, so it follows along as you measure.
 */
export function TotalsPanel({
  data,
  view,
  onView,
  onClose,
  materialsHref,
}: {
  data: TotalsPanelData;
  view: PanelView;
  onView: (v: PanelView) => void;
  onClose: () => void;
  materialsHref: string;
}) {
  const total = data.conditions.reduce((s, c) => s + c.price, 0);
  const categories = Array.from(new Set(data.materials.lines.map((l) => l.category)));
  const tabClass = (on: boolean) => cn("border-b-2 px-3 py-2 text-sm font-medium", on ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-800");

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,26rem)] flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-1 border-b border-slate-200 pl-2 pr-2">
        <button type="button" className={tabClass(view === "totals")} onClick={() => onView("totals")}>
          Totals
        </button>
        <button type="button" className={tabClass(view === "materials")} onClick={() => onView("materials")}>
          Material list
        </button>
        <button type="button" aria-label="Close" title="Close" className="ml-auto rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "totals" ? (
          data.conditions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No takeoffs yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-slate-100 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Takeoff</span>
                <span className="w-20 text-right">This sheet</span>
                <span className="w-24 text-right">Job</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {data.conditions.map((c) => (
                  <li key={c.id}>
                    <details className="group">
                      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto_auto] items-start gap-x-3 px-4 py-2 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-start gap-1.5">
                          <ChevronRight className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90", !c.lines.length && "invisible")} />
                          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                            <span className="block text-[11px] text-slate-500">
                              {money(c.price)}
                              {c.unscaled ? <span className="text-amber-700"> · {c.unscaled} unscaled</span> : null}
                            </span>
                          </span>
                        </span>
                        <span className="w-20 text-right text-sm tabular-nums text-slate-600">
                          {num(c.sheet)} <span className="text-[11px]">{c.unit}</span>
                        </span>
                        <span className="w-24 text-right text-sm font-semibold tabular-nums text-slate-900">
                          {num(c.job)} <span className="text-[11px] font-normal">{c.unit}</span>
                          {c.wastePct > 0 ? <span className="block text-[11px] font-normal text-slate-500">{num(c.withWaste)} w/ waste</span> : null}
                        </span>
                      </summary>
                      {c.lines.length ? (
                        <ul className="space-y-0.5 bg-slate-50/70 px-4 py-2 pl-12 text-xs">
                          {c.lines.map((l, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="truncate text-slate-700">{l.name}</span>
                              <span className="shrink-0 tabular-nums text-slate-900">
                                {num(l.quantity)} {l.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900">
                <span>Takeoff price</span>
                <span className="tabular-nums">{money(total)}</span>
              </div>
              <p className="px-4 pb-4 text-[11px] text-slate-500">Job totals are before waste; prices include markup. Click a takeoff to see what it orders.</p>
            </>
          )
        ) : (
          <div className="pb-4">
            {/* The quick list here; the full one (prices on/off, print, CSV) is its own tab. */}
            <Link
              href={materialsHref}
              target="_blank"
              className="flex items-center gap-1.5 border-b border-slate-100 bg-blue-50/60 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Full list — print, show / hide prices, CSV
            </Link>
            {data.materials.lines.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">Nothing to list yet — measure takeoffs with items on them.</p>
            ) : (
              categories.map((cat) => (
                <div key={cat}>
                  <p className="bg-slate-50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cat}</p>
                  <ul className="divide-y divide-slate-100">
                    {data.materials.lines
                      .filter((l) => l.category === cat)
                      .map((l) => (
                        <li key={l.key} className="flex justify-between gap-3 px-4 py-1.5 text-sm">
                          <span className="min-w-0 truncate text-slate-900">{l.name}</span>
                          <span className="shrink-0 tabular-nums text-slate-900">
                            {num(l.quantity)} <span className="text-[11px] text-slate-500">{l.unit}</span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))
            )}
            {data.materials.cutLists.length ? (
              <div className="mt-2 border-t border-slate-200 px-4 pt-3">
                <p className="label">Framing cut sheet</p>
                <div className="space-y-2">
                  {data.materials.cutLists.map((c) => (
                    <div key={c.condition}>
                      <p className="text-xs font-medium text-slate-900">
                        {c.condition}
                        {c.size ? <span className="font-normal text-slate-500"> · {c.size}</span> : null}
                        {c.method ? <span className="font-normal text-slate-500"> · {c.method}</span> : null}
                      </p>
                      {c.boards.length ? (
                        <ul className="text-xs text-slate-700">
                          {c.boards.map((b, i) => (
                            <li key={i} className="tabular-nums">
                              {b.count} × {boardPatternText(b)}
                            </li>
                          ))}
                          {c.waste ? (
                            <li className="tabular-nums text-slate-500">
                              +{c.waste.count} × {num(c.waste.length)}&apos; for {num(c.waste.pct, 1)}% waste
                            </li>
                          ) : null}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-700">{c.pieces.map(([len, n]) => `${n} @ ${c.exact ? feetInches(len) : `${num(len)}'`}`).join(" · ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="px-4 pt-3">
              <Link href={materialsHref} target="_blank" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Full Material List — prices, by plan, print, CSV
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
