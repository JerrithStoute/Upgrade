"use client";

import { useMemo, useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { Field, Line, Section } from "./mini";
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
};

const blank = (metric: string): PendingItem => ({
  description: "",
  costCodeId: "",
  metric,
  qty: 1,
  per: 1,
  unit: "ea",
  roundUp: false,
  wastePct: 0,
  unitCost: 0,
});

/**
 * A new takeoff's items, added before it's saved: they go with the takeoff as one
 * JSON field ("pendingItems") and are created along with it. One line adds an item —
 * picking an Item List entry fills in its unit, price, waste and cost code; More…
 * opens those to change them.
 */
export function PendingItems({
  type,
  metric,
  costCodes,
  items,
  title,
  empty,
}: {
  type: ConditionType;
  metric: string;
  costCodes: { id: string; code: string | null; name: string }[];
  items: ItemOption[];
  title: string;
  /** What the closed line says while there are none. */
  empty: string;
}) {
  const [list, setList] = useState<PendingItem[]>([]);
  // Closed to one line until you click Add.
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PendingItem>(() => blank(metric));
  const [editing, setEditing] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const metrics = METRICS_BY_TYPE[type] ?? [];
  const byKey = useMemo(() => new Map(items.map((i) => [itemNameKey(i.name), i])), [items]);
  const fits = (m: string) => (metrics as string[]).includes(m);
  const metricFor = (m: string) => (fits(m) ? m : metric);
  const unitOf = (m: string) => METRICS[metricFor(m) as MetricKey]?.unit ?? "";
  const ofText = (m: string) => `${METRICS[metricFor(m) as MetricKey].unit} of ${METRICS[metricFor(m) as MetricKey].label.toLowerCase()}`;

  const commit = () => {
    if (!draft.description.trim()) return;
    const row = { ...draft, description: draft.description.trim() };
    setList((cur) => (editing == null ? [...cur, row] : cur.map((r, k) => (k === editing ? row : r))));
    setDraft(blank(metric));
    setEditing(null);
    setMore(false);
  };
  const pick = (name: string) => {
    const item = byKey.get(itemNameKey(name));
    setDraft((d) =>
      item
        ? {
            ...d,
            description: name,
            unit: (UNITS as readonly string[]).includes(item.unit) ? item.unit : "ea",
            unitCost: item.unitCost,
            wastePct: item.wastePct,
            roundUp: item.roundUp,
            costCodeId: item.costCodeId ?? "",
          }
        : { ...d, description: name },
    );
  };
  // Enter adds the item instead of submitting the whole takeoff form.
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };
  const set = <K extends keyof PendingItem>(k: K, v: PendingItem[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const match = draft.description.trim() ? byKey.get(itemNameKey(draft.description)) : undefined;
  // An item still being typed when the takeoff is saved goes too, rather than being lost.
  const typed = draft.description.trim() ? { ...draft, description: draft.description.trim() } : null;
  const sent = !typed ? list : editing == null ? [...list, typed] : list.map((r, k) => (k === editing ? typed : r));

  return (
    <Section title={title}>
      <input type="hidden" name="pendingItems" value={JSON.stringify(sent.map((r) => ({ ...r, metric: metricFor(r.metric) })))} />
      <Line>
        <span>{list.length ? `${list.length} item${list.length === 1 ? "" : "s"}` : empty}</span>
        <button type="button" className="ml-auto text-blue-700 hover:underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Add"}
        </button>
      </Line>
      {list.length ? (
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {list.map((r, k) => (
            <li key={k} className={cn("flex items-center gap-2 py-1 text-sm", editing === k && "bg-blue-50/60")}>
              <button type="button" className="min-w-0 flex-1 truncate text-left text-slate-900 hover:underline" title="Change it" onClick={() => {
                setEditing(k);
                setDraft({ ...r, metric: metricFor(r.metric) });
              }}>
                {r.description}
              </button>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">
                {num(r.qty, 4)} {r.unit} / {num(r.per, 4)} {unitOf(r.metric)}
                {r.wastePct > 0 ? ` · ${num(r.wastePct, 1)}% waste` : ""}
              </span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-700">
                {money(r.unitCost)}/{r.unit}
              </span>
              <button type="button" aria-label={`Remove ${r.description}`} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600" onClick={() => {
                setList((cur) => cur.filter((_, j) => j !== k));
                if (editing === k) {
                  setEditing(null);
                  setDraft(blank(metric));
                }
              }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open || editing != null ? (
        <>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <input
          list="pending-items-list"
          autoComplete="off"
          aria-label="Item"
          className="input min-w-48 flex-1"
          value={draft.description}
          onChange={(e) => pick(e.target.value)}
          onKeyDown={enter}
          placeholder="Find in the Item List or type a new one"
        />
        <datalist id="pending-items-list">
          {items.map((i) => (
            <option key={i.id} value={i.name}>
              {[i.category, `${money(i.unitCost)}/${i.unit}`].join(" · ")}
            </option>
          ))}
        </datalist>
        <input type="number" step="any" min="0" aria-label="How many" className="input !w-14" value={draft.qty} onChange={(e) => set("qty", Number(e.target.value) || 0)} onKeyDown={enter} />
        <span className="text-xs text-slate-500">{draft.unit} per</span>
        <input type="number" step="any" min="0" aria-label="Per" className="input !w-14" value={draft.per} onChange={(e) => set("per", Number(e.target.value) || 0)} onKeyDown={enter} />
        <span className="text-xs text-slate-500">{unitOf(draft.metric)}</span>
        <button type="button" disabled={!draft.description.trim()} onClick={commit} className={buttonClasses("secondary", "xs")}>
          {editing == null ? "Add" : "Update"}
        </button>
        {editing != null ? (
          <button type="button" className="text-xs text-slate-600 hover:underline" onClick={() => {
            setEditing(null);
            setDraft(blank(metric));
            setMore(false);
          }}>
            Cancel
          </button>
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
        {draft.description.trim() ? (
          match ? (
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> From the Item List · {money(match.unitCost)}/{match.unit}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Plus className="h-3 w-3" /> New — added to the Item List when you save
            </span>
          )
        ) : (
          <span>Price, unit, waste and cost code come from the Item List.</span>
        )}
        <button type="button" className="text-blue-700 hover:underline" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? "Less" : "More…"}
        </button>
      </p>
      {more ? (
        <div className="flex flex-wrap items-end gap-2.5 rounded-md bg-slate-50 p-2">
          <Field label="Unit">
            <select aria-label="Unit" className="input !w-20" value={draft.unit} onChange={(e) => set("unit", e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          {metrics.length > 1 ? (
            <Field label="Per what">
              <select aria-label="Per what" className="input !w-48" value={metricFor(draft.metric)} onChange={(e) => set("metric", e.target.value)}>
                {metrics.map((m) => (
                  <option key={m} value={m}>
                    {ofText(m)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Unit cost">
            <input type="number" step="0.01" min="0" aria-label="Unit cost" className="input !w-24" value={draft.unitCost} onChange={(e) => set("unitCost", Number(e.target.value) || 0)} onKeyDown={enter} />
          </Field>
          <Field label="Waste %">
            <input type="number" step="0.5" min="0" aria-label="Waste %" className="input !w-16" value={draft.wastePct} onChange={(e) => set("wastePct", Number(e.target.value) || 0)} onKeyDown={enter} />
          </Field>
          <Field label="Cost code" className="min-w-40 flex-1">
            <select aria-label="Cost code" className="input" value={draft.costCodeId} onChange={(e) => set("costCodeId", e.target.value)}>
              <option value="">—</option>
              {costCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {costCodeLabel(c)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex h-8 items-center gap-1.5 text-xs text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={draft.roundUp} onChange={(e) => set("roundUp", e.target.checked)} />
            Round up
          </label>
        </div>
      ) : null}
        </>
      ) : null}
    </Section>
  );
}
