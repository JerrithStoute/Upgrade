"use client";

import { useMemo, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { UNITS } from "@/lib/constants";
import { cn, costCodeLabel, money, num } from "@/lib/utils";
import { METRICS, METRICS_BY_TYPE, itemNameKey, type ConditionType, type MetricKey } from "@/lib/takeoff";
import type { ItemOption } from "./assembly-form";

/** An assembly item typed into a takeoff that isn't saved yet. */
export type PendingItem = {
  description: string;
  costCodeId: string;
  metric: string;
  qty: number;
  per: number;
  unit: string;
  roundUp: boolean;
  wastePct: number;
  unitCost: number;
  markupPct: number;
};

const blank = (metric: string, markupPct: number): PendingItem => ({
  description: "",
  costCodeId: "",
  metric,
  qty: 1,
  per: 1,
  unit: "ea",
  roundUp: false,
  wastePct: 0,
  unitCost: 0,
  markupPct,
});

/**
 * A new takeoff's assembly items, added before it's saved: they go with the
 * takeoff as one JSON field ("pendingItems") and are created along with it.
 * The fields work like the assembly item form (picking an Item List entry fills
 * in its unit, price, markup, waste and cost code).
 */
export function PendingItems({
  type,
  metric,
  costCodes,
  items,
  defaultMarkup,
}: {
  type: ConditionType;
  metric: string;
  costCodes: { id: string; code: string | null; name: string }[];
  items: ItemOption[];
  defaultMarkup: number;
}) {
  const [list, setList] = useState<PendingItem[]>([]);
  const [draft, setDraft] = useState<PendingItem | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const metrics = METRICS_BY_TYPE[type] ?? [];
  const byKey = useMemo(() => new Map(items.map((i) => [itemNameKey(i.name), i])), [items]);
  const fits = (m: string) => (metrics as string[]).includes(m);
  const ofText = (m: string) => (fits(m) ? `${METRICS[m as MetricKey].unit} of ${METRICS[m as MetricKey].label.toLowerCase()}` : "");

  const open = (i: number | null) => {
    setEditing(i);
    setDraft(i == null ? blank(metric, defaultMarkup) : { ...list[i], metric: fits(list[i].metric) ? list[i].metric : metric });
  };
  const commit = () => {
    if (!draft || !draft.description.trim()) return;
    const row = { ...draft, description: draft.description.trim() };
    setList((cur) => (editing == null ? [...cur, row] : cur.map((r, k) => (k === editing ? row : r))));
    setDraft(null);
    setEditing(null);
  };
  const pick = (name: string) => {
    if (!draft) return;
    const item = byKey.get(itemNameKey(name));
    setDraft(
      item
        ? {
            ...draft,
            description: name,
            unit: (UNITS as readonly string[]).includes(item.unit) ? item.unit : "ea",
            unitCost: item.unitCost,
            markupPct: item.markupPct,
            wastePct: item.wastePct,
            roundUp: item.roundUp,
            costCodeId: item.costCodeId ?? "",
          }
        : { ...draft, description: name },
    );
  };
  // Enter adds the item instead of submitting the whole takeoff form.
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };
  const set = <K extends keyof PendingItem>(k: K, v: PendingItem[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const match = draft?.description.trim() ? byKey.get(itemNameKey(draft.description)) : undefined;
  const lbl = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500";
  // An item still being typed when the takeoff is saved goes too, rather than being lost.
  const typed = draft?.description.trim() ? { ...draft, description: draft.description.trim() } : null;
  const sent = !typed ? list : editing == null ? [...list, typed] : list.map((r, k) => (k === editing ? typed : r));

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <input type="hidden" name="pendingItems" value={JSON.stringify(sent.map((r) => ({ ...r, metric: fits(r.metric) ? r.metric : metric })))} />
      <div className="flex items-center gap-2">
        <p className="label !mb-0 flex-1">Assembly items</p>
        {!draft ? (
          <button type="button" onClick={() => open(null)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        ) : null}
      </div>
      {list.length === 0 && !draft ? <p className="text-xs text-slate-500">Optional — add what this takeoff orders now, or later. Saved together with the takeoff.</p> : null}
      {list.length ? (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {list.map((r, k) => (
            <li key={k} className="flex items-start gap-2 px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-900">{r.description}</span>
                <span className="block text-xs text-slate-500">
                  {num(r.qty, 4)} {r.unit} per {num(r.per, 4)} {ofText(fits(r.metric) ? r.metric : metric)} · {money(r.unitCost)}/{r.unit}
                  {r.costCodeId ? ` · ${costCodeLabel(costCodes.find((c) => c.id === r.costCodeId) ?? { code: null, name: "—" })}` : ""}
                </span>
                {!fits(r.metric) ? <span className="block text-xs text-amber-700">Its quantity doesn&apos;t fit this type — it&apos;ll use {ofText(metric)}.</span> : null}
              </span>
              <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => open(k)}>
                Edit
              </button>
              <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => setList((cur) => cur.filter((_, j) => j !== k))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {draft ? (
        <div className="space-y-2 rounded-md bg-slate-50 p-2.5">
          <label className="block space-y-1">
            <span className={lbl}>Item</span>
            <input
              autoFocus
              list="pending-items-list"
              autoComplete="off"
              className="input"
              value={draft.description}
              onChange={(e) => pick(e.target.value)}
              onKeyDown={enter}
              placeholder="Search the Item List or type a new item"
            />
            <datalist id="pending-items-list">
              {items.map((i) => (
                <option key={i.id} value={i.name}>
                  {[i.category, `${money(i.unitCost)}/${i.unit}`].join(" · ")}
                </option>
              ))}
            </datalist>
            {draft.description.trim() ? (
              match ? (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <BookOpen className="h-3 w-3" /> From the Item List · {match.category} · {money(match.unitCost)}/{match.unit}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-emerald-700">
                  <Plus className="h-3 w-3" /> New — added to the Item List when you save
                </span>
              )
            ) : null}
          </label>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1">
              <span className={lbl}>Qty</span>
              <input type="number" step="any" min="0" className="input !w-20" value={draft.qty} onChange={(e) => set("qty", Number(e.target.value) || 0)} onKeyDown={enter} />
            </label>
            <label className="space-y-1">
              <span className={lbl}>Unit</span>
              <select className="input !w-20" value={draft.unit} onChange={(e) => set("unit", e.target.value)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <span className="pb-2 text-slate-500">per</span>
            <label className="space-y-1">
              <span className={lbl}>Per</span>
              <input type="number" step="any" min="0" className="input !w-20" value={draft.per} onChange={(e) => set("per", Number(e.target.value) || 0)} onKeyDown={enter} />
            </label>
            <label className="min-w-40 flex-1 space-y-1">
              <span className={lbl}>Of</span>
              <select className="input" value={draft.metric} onChange={(e) => set("metric", e.target.value)}>
                {metrics.map((m) => (
                  <option key={m} value={m}>
                    {ofText(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1">
              <span className={lbl}>Unit cost</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input !w-24"
                value={draft.unitCost}
                onChange={(e) => set("unitCost", Number(e.target.value) || 0)}
                onKeyDown={enter}
              />
            </label>
            <label className="space-y-1">
              <span className={lbl}>Markup %</span>
              <input type="number" step="0.1" className="input !w-20" value={draft.markupPct} onChange={(e) => set("markupPct", Number(e.target.value) || 0)} onKeyDown={enter} />
            </label>
            <label className="space-y-1">
              <span className={lbl}>Waste %</span>
              <input
                type="number"
                step="0.5"
                min="0"
                className="input !w-20"
                value={draft.wastePct}
                onChange={(e) => set("wastePct", Number(e.target.value) || 0)}
                onKeyDown={enter}
              />
            </label>
            <label className="min-w-40 flex-1 space-y-1">
              <span className={lbl}>Cost code</span>
              <select className="input" value={draft.costCodeId} onChange={(e) => set("costCodeId", e.target.value)}>
                <option value="">—</option>
                {costCodes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {costCodeLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={draft.roundUp} onChange={(e) => set("roundUp", e.target.checked)} />
              Round up
            </label>
            <button
              type="button"
              disabled={!draft.description.trim()}
              onClick={commit}
              className={cn("ml-auto rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40")}
            >
              {editing == null ? "Add to list" : "Update"}
            </button>
            <button
              type="button"
              className="text-xs text-slate-600 hover:underline"
              onClick={() => {
                setDraft(null);
                setEditing(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
