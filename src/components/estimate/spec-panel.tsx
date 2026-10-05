"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn, money } from "@/lib/utils";
import { SPEC_KINDS, type SheetSpec, type Totals } from "@/lib/estimate-sheet";
import { buttonClasses } from "@/components/ui";

type Patch = Partial<Omit<SheetSpec, "key" | "id" | "lines">>;

/**
 * A spec item's details, beside the sheet. Changes go straight into the sheet
 * (and are saved with it) — "Done" just closes the panel.
 */
export function SpecPanel({
  spec,
  categories,
  totals,
  proposal,
  allowanceProfitDefault,
  allowanceExtra = 0,
  onChange,
  onClose,
  onDelete,
}: {
  spec: SheetSpec;
  categories: string[];
  totals: Totals;
  /** Show "On the proposal" (job estimates). */
  proposal?: boolean;
  /** Job estimates: new allowances' profit in / out (company setting). Leave out on templates. */
  allowanceProfitDefault?: boolean;
  /** What the Markup, Margin & Tax rows marked "in allowances" add (overhead, tax…). */
  allowanceExtra?: number;
  onChange: (p: Patch) => void;
  onClose: () => void;
  /** Deletes the category and its items (asks first). */
  onDelete?: () => void;
}) {
  const view = spec.proposalView;
  const choice = (key: keyof typeof view, label: string, yes: string, no: string) => (
    <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
      {label}
      <select
        className="input !h-8 !w-44 !py-0 text-xs"
        value={view[key] === null ? "" : view[key] ? "1" : "0"}
        onChange={(e) => onChange({ proposalView: { ...view, [key]: e.target.value === "" ? null : e.target.value === "1" } })}
      >
        <option value="">Like the rest</option>
        <option value="1">{yes}</option>
        <option value="0">{no}</option>
      </select>
    </label>
  );
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`${spec.name} details`}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-slate-900/20" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{spec.category}</p>
            <h2 className="truncate text-base font-semibold text-slate-900">{spec.name || "Untitled category"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="label">Name</span>
            <input
              className="input"
              value={spec.name}
              autoFocus={spec.name === "New item"}
              onFocus={(e) => spec.name === "New item" && e.currentTarget.select()}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="label">Division</span>
            {/* Moves the item when you leave the box, not on every letter. */}
            <input
              key={spec.category}
              className="input"
              list="spec-categories"
              defaultValue={spec.category}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== spec.category) onChange({ category: v });
                else e.target.value = spec.category;
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <datalist id="spec-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <div>
            <span className="label">Type</span>
            <div className="inline-flex rounded-md border border-slate-300 p-0.5">
              {SPEC_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => onChange({ kind: k.value })}
                  className={cn("rounded px-3 py-1 text-sm font-medium", spec.kind === k.value ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100")}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{spec.kind === "SELECTION" ? "The client picks what goes here." : "You decide what goes here."}</p>
          </div>

          <label className="block">
            <span className="label">Specifications</span>
            <textarea
              className="input"
              rows={5}
              value={spec.specText}
              placeholder="What's included — clients and trade partners both see this"
              onChange={(e) => onChange({ specText: e.target.value })}
            />
          </label>

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={spec.isAllowance} onChange={(e) => onChange({ isAllowance: e.target.checked })} />
              Allowance
            </label>
            <p className="mt-1 pl-6 text-xs text-slate-500">
              {spec.isAllowance ? (
                <>
                  Allowance amount{" "}
                  <span className="font-semibold text-slate-800">
                    {money(((spec.allowanceProfit ?? allowanceProfitDefault ?? true) ? totals.price : totals.cost) + allowanceExtra)}
                  </span>{" "}
                  — this category&apos;s items, {(spec.allowanceProfit ?? allowanceProfitDefault ?? true) ? "with profit" : "at cost"}
                  {allowanceExtra > 0 ? `, plus ${money(allowanceExtra)} from your markup table` : ""}.
                </>
              ) : (
                "Tick if the client's choice here is measured against an amount."
              )}
            </p>
            {spec.isAllowance && allowanceProfitDefault !== undefined ? (
              <select
                className="input mt-2 !h-8 !w-auto !py-0 pl-2 text-xs"
                aria-label="Allowance profit"
                value={spec.allowanceProfit === null ? "" : spec.allowanceProfit ? "in" : "out"}
                onChange={(e) => onChange({ allowanceProfit: e.target.value === "" ? null : e.target.value === "in" })}
              >
                <option value="out">Profit out (at cost)</option>
                <option value="in">Profit in</option>
                <option value="">Company default (profit {allowanceProfitDefault ? "in" : "out"})</option>
              </select>
            ) : null}
          </div>

          <label className="block">
            <span className="label">Client notes</span>
            <textarea className="input" rows={3} value={spec.clientNotes} placeholder="Only the client sees these" onChange={(e) => onChange({ clientNotes: e.target.value })} />
          </label>

          <label className="block">
            <span className="label">Trade partner notes</span>
            <textarea className="input" rows={3} value={spec.tradeNotes} placeholder="Only trade partners see these" onChange={(e) => onChange({ tradeNotes: e.target.value })} />
          </label>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-800">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={spec.urgent} onChange={(e) => onChange({ urgent: e.target.checked })} />
              Urgent
            </label>
            <label className="block">
              <span className="label">Requested by</span>
              <input type="date" className="input !w-44" value={spec.requestedBy} onChange={(e) => onChange({ requestedBy: e.target.value })} />
            </label>
          </div>

          {proposal ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-800">On the proposal</p>
              <p className="-mt-1 text-xs text-slate-500">&ldquo;Like the rest&rdquo; follows the options on the proposal page.</p>
              {choice("show", "This category", "Show it", "Hide it")}
              {choice("prices", "Its price", "Show", "Hide")}
              {choice("items", "Its items", "Show them", "Hide them")}
            </div>
          ) : null}

          <dl className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Cost</dt>
              <dd className="font-semibold tabular-nums text-slate-800">{money(totals.cost)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Profit</dt>
              <dd className="font-semibold tabular-nums text-slate-800">{money(totals.profit)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Price</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{money(totals.price)}</dd>
            </div>
          </dl>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          {onDelete ? (
            <button
              type="button"
              className="rounded px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
              onClick={() => {
                const n = spec.lines.length;
                if (window.confirm(`Delete "${spec.name || "this category"}"${n ? ` and its ${n} item${n === 1 ? "" : "s"}` : ""}? (Discard brings it back until you save.)`))
                  onDelete();
              }}
            >
              Delete category
            </button>
          ) : null}
          <span className="text-xs text-slate-500">Saved with the estimate when you click Save changes.</span>
          <button type="button" className={buttonClasses("primary", "sm")} onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
