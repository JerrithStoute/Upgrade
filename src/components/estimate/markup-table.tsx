"use client";

import { useState, useTransition } from "react";
import { Lock, Plus, Trash2, X } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn, costCodeLabel, money } from "@/lib/utils";
import { COST_TYPES } from "@/lib/estimate-sheet";
import { MARKUP_KINDS, newRowId, type MarkupRow } from "@/lib/markup";
import { NumCell } from "./cells";

type SaveDefault = (rows: MarkupRow[]) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * The Markup, Margin & Tax table, beside the sheet. Changes go into the sheet (saved
 * with it); profit rows fill the lines' profit %, the others add on top.
 */
export function MarkupPanel({
  rows,
  amounts,
  costCodes,
  locked,
  saveDefault,
  onChange,
  onClose,
}: {
  rows: MarkupRow[];
  /** What each overhead / tax / other row adds on this estimate, by row id. */
  amounts: Record<string, number>;
  costCodes: { id: string; code: string | null; name: string }[];
  /** Why the table can't change (approved, with change orders), or null. */
  locked: string | null;
  saveDefault?: SaveDefault;
  onChange: (rows: MarkupRow[]) => void;
  onClose: () => void;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const set = (id: string, patch: Partial<MarkupRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { id: newRowId(), name: "", kind: "OVERHEAD", pct: 0, basis: "MARKUP", appliesTo: "ALL", costCodeId: null, inAllowance: false }]);
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const asDefault = () => {
    if (!saveDefault) return;
    setMsg(null);
    startSaving(async () => {
      const r = await saveDefault(rows);
      setMsg(r.ok ? { ok: true, text: "Saved — new estimates start with this table." } : { ok: false, text: r.error });
    });
  };
  const input = "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Markup, margin & tax">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-slate-900/20" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-6xl flex-col bg-slate-50 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Markup, margin &amp; tax</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {locked ? (
            <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Lock className="h-4 w-4 shrink-0" /> {locked}
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="min-w-[160px] px-2 py-2 font-medium">Name</th>
                  <th className="w-32 px-2 py-2 font-medium">Kind</th>
                  <th className="w-20 px-2 py-2 text-right font-medium">%</th>
                  <th className="w-28 px-2 py-2 font-medium">Figured as</th>
                  <th className="w-40 px-2 py-2 font-medium">Applies to</th>
                  <th className="w-44 px-2 py-2 font-medium">Cost code</th>
                  <th className="w-20 px-2 py-2 text-center font-medium" title="Counts toward the client's allowance amounts">
                    In allow.
                  </th>
                  <th className="w-24 px-2 py-2 text-right font-medium">Adds</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5">
                      <input
                        className={input}
                        value={r.name}
                        disabled={!!locked}
                        placeholder={MARKUP_KINDS.find((k) => k.value === r.kind)?.label}
                        aria-label="Name"
                        onChange={(e) => set(r.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select className={input} value={r.kind} disabled={!!locked} aria-label="Kind" onChange={(e) => set(r.id, { kind: e.target.value as MarkupRow["kind"] })}>
                        {MARKUP_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      {locked ? (
                        <span className="block text-right tabular-nums text-slate-600">{r.pct}%</span>
                      ) : (
                        <NumCell value={r.pct} ariaLabel="Percent" className="border-slate-300 bg-white text-right" onChange={(v) => set(r.id, { pct: Math.max(0, v) })} />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={input}
                        value={r.basis}
                        disabled={!!locked}
                        aria-label="Figured as"
                        onChange={(e) => set(r.id, { basis: e.target.value as MarkupRow["basis"] })}
                      >
                        <option value="MARKUP">Markup</option>
                        <option value="MARGIN">Margin</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select className={input} value={r.appliesTo} disabled={!!locked} aria-label="Applies to" onChange={(e) => set(r.id, { appliesTo: e.target.value })}>
                        <option value="ALL">All costs</option>
                        {COST_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label} only
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className={input}
                        value={r.costCodeId ?? ""}
                        disabled={!!locked || r.kind === "PROFIT"}
                        aria-label="Cost code"
                        title={r.kind === "PROFIT" ? "Profit stays on each line" : "Where this amount shows in the budget"}
                        onChange={(e) => set(r.id, { costCodeId: e.target.value || null })}
                      >
                        <option value="">{r.kind === "PROFIT" ? "—" : "No cost code"}</option>
                        {costCodes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {costCodeLabel(c)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={r.kind !== "PROFIT" && r.inAllowance}
                        disabled={!!locked || r.kind === "PROFIT"}
                        aria-label="Include in allowance amounts"
                        title={r.kind === "PROFIT" ? "Each allowance picks profit in or out itself" : "Include in the client's allowance amounts"}
                        onChange={(e) => set(r.id, { inAllowance: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {r.kind === "PROFIT" ? <span className="text-xs text-slate-400">on each line</span> : money(amounts[r.id] ?? 0)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {locked ? null : (
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Remove ${r.name || "row"}`}
                          onClick={() => remove(r.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">
                      No rows — lines keep the profit % you type on them.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {locked ? null : (
            <button type="button" className={buttonClasses("secondary", "sm")} onClick={add}>
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
          )}
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>
              <b>Profit</b> rows fill each line&apos;s profit % (by cost type). Lines still at the table&apos;s % follow it when you change it; a line you changed by hand keeps
              yours.
            </li>
            <li>
              <b>Overhead</b> and <b>Other</b> rows add to the estimate total; <b>Tax</b> rows add tax on top (its own line on the proposal). Each is a % of the cost of the lines
              it applies to — markup on cost, or margin of the selling price.
            </li>
            <li>The cost code puts the amount in that line of the budget. Saved with the estimate when you click Save changes.</li>
          </ul>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <span className="flex items-center gap-3">
            {saveDefault ? (
              <button type="button" className={buttonClasses("ghost", "sm")} disabled={saving} onClick={asDefault} title="New estimates and templates start with this table">
                {saving ? "Saving…" : "Save as my default"}
              </button>
            ) : null}
            {msg ? <span className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span> : null}
          </span>
          <button type="button" className={buttonClasses("primary", "sm")} onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}
