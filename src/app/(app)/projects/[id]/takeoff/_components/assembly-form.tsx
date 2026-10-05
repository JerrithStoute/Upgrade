"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { Field, SubmitButton, buttonClasses } from "@/components/ui";
import { UNITS } from "@/lib/constants";
import { costCodeLabel, money } from "@/lib/utils";
import { METRICS, METRICS_BY_TYPE, itemNameKey, type ConditionType } from "@/lib/takeoff";

export type AssemblyFormValues = {
  id: string;
  description: string;
  costCodeId: string | null;
  metric: string;
  qty: number;
  per: number;
  unit: string;
  roundUp: boolean;
  wastePct: number;
  unitCost: number;
  markupPct: number;
  /** "This job only": keeps its own price when the Item List changes. */
  pricePinned?: boolean;
};

export type ItemOption = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  markupPct: number;
  wastePct: number;
  roundUp: boolean;
  costCodeId: string | null;
  sku: string | null;
};

/**
 * "qty [unit] per [per] [metric unit] of [metric]" — e.g. 1 ea per 32 sf of area.
 * The item name searches the Item List; picking an entry fills in its unit, price,
 * markup, waste and cost code. A name that isn't on the list is added to it on save.
 */
export function AssemblyForm({
  action,
  hidden,
  condition,
  costCodes,
  items,
  values,
  cancelHref,
  onCancel,
  pricesLocked,
}: {
  /** Job takeoffs: this job's prices are locked (a price typed here stays on this job). Leave out on templates. */
  pricesLocked?: boolean;
  action: (fd: FormData) => Promise<void>;
  /** Hidden fields identifying where the item lives (projectId, or templateId). */
  hidden: Record<string, string>;
  condition: { id: string; type: string; metric: string; markupPct: number };
  costCodes: { id: string; code: string | null; name: string }[];
  items: ItemOption[];
  values?: AssemblyFormValues;
  cancelHref?: string;
  onCancel?: () => void;
}) {
  const metrics = METRICS_BY_TYPE[condition.type as ConditionType] ?? [];
  const p = (k: string) => `asm-${values?.id ?? `new-${condition.id}`}-${k}`;
  const byKey = useMemo(() => new Map(items.map((i) => [itemNameKey(i.name), i])), [items]);

  const [description, setDescription] = useState(values?.description ?? "");
  const [unit, setUnit] = useState(values?.unit ?? "ea");
  const [unitCost, setUnitCost] = useState(String(values?.unitCost ?? 0));
  const [markupPct, setMarkupPct] = useState(String(values?.markupPct ?? condition.markupPct));
  const [wastePct, setWastePct] = useState(String(values?.wastePct ?? 0));
  const [roundUp, setRoundUp] = useState(values?.roundUp ?? false);
  const [costCodeId, setCostCodeId] = useState(values?.costCodeId ?? "");

  const match = description.trim() ? byKey.get(itemNameKey(description)) : undefined;

  const pick = (name: string) => {
    setDescription(name);
    const item = byKey.get(itemNameKey(name));
    // Only fill from the list when the name changes to a list item, so editing keeps the job's prices.
    if (!item || itemNameKey(name) === itemNameKey(values?.description ?? "")) return;
    setUnit((UNITS as readonly string[]).includes(item.unit) ? item.unit : "ea");
    setUnitCost(String(item.unitCost));
    setMarkupPct(String(item.markupPct));
    setWastePct(String(item.wastePct));
    setRoundUp(item.roundUp);
    setCostCodeId(item.costCodeId ?? "");
  };

  return (
    <form action={action} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="conditionId" value={condition.id} />
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      {/* Item on its own row; cost code, unit cost and markup under it — room to read the price. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Item" htmlFor={p("description")} className="col-span-2 md:col-span-4">
          <input
            id={p("description")}
            name="description"
            required
            list={p("items")}
            autoComplete="off"
            className="input"
            value={description}
            onChange={(e) => pick(e.target.value)}
            placeholder="Search the Item List or type a new item"
          />
          <datalist id={p("items")}>
            {items.map((i) => (
              <option key={i.id} value={i.name}>
                {[i.category, i.sku, `${money(i.unitCost)}/${i.unit}`].filter(Boolean).join(" · ")}
              </option>
            ))}
          </datalist>
          {description.trim() ? (
            match ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <BookOpen className="h-3 w-3" /> From the Item List · {match.category} · list price {money(match.unitCost)}/{match.unit}
                {match.unitCost > 0 && Math.abs(Number(unitCost.replace(/[$,\s]/g, "")) - match.unitCost) > 0.0001 ? (
                  <button type="button" className="ml-1 font-medium text-blue-700 hover:underline" onClick={() => setUnitCost(String(match.unitCost))}>
                    Use {money(match.unitCost)}
                  </button>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                <Plus className="h-3 w-3" /> New — will be added to the Item List when you save
              </p>
            )
          ) : null}
        </Field>
        <Field label="Cost code" htmlFor={p("costCodeId")} className="col-span-2 md:col-span-4">
          <select id={p("costCodeId")} name="costCodeId" className="input" value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)}>
            <option value="">—</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {costCodeLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit cost" htmlFor={p("unitCost")} className="md:col-span-2">
          <input id={p("unitCost")} name="unitCost" inputMode="decimal" className="input" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </Field>
        <Field label="Markup %" htmlFor={p("markupPct")}>
          <input id={p("markupPct")} name="markupPct" inputMode="decimal" className="input" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} />
        </Field>
        {hidden.projectId ? (
          <div className="col-span-2 space-y-1 text-xs text-slate-500 md:col-span-4">
            {pricesLocked ? (
              <p>This job&apos;s prices are locked — a price you save here goes on every takeoff in this job that uses this item, and nowhere else.</p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-slate-700">
                  <input type="checkbox" name="pinPrice" defaultChecked={values?.pricePinned ?? false} className="h-4 w-4 rounded border-slate-300" />
                  This job only — keep this price when the Item List changes
                </label>
                <p>Not ticked: the price is the Item List&apos;s, so saving it here changes it on every job that isn&apos;t locked.</p>
              </>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm text-slate-600">
        <Field label="Qty" htmlFor={p("qty")} className="w-24">
          <input id={p("qty")} name="qty" inputMode="decimal" className="input" defaultValue={values?.qty ?? 1} />
        </Field>
        <Field label="Unit" htmlFor={p("unit")} className="w-24">
          <select id={p("unit")} name="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <span className="pb-2">per</span>
        <Field label="Per" htmlFor={p("per")} className="w-24">
          <input id={p("per")} name="per" inputMode="decimal" className="input" defaultValue={values?.per ?? 1} />
        </Field>
        <Field label="Of" htmlFor={p("metric")} className="w-56">
          <select id={p("metric")} name="metric" className="input" defaultValue={values?.metric ?? condition.metric}>
            {metrics.map((m) => (
              <option key={m} value={m}>
                {METRICS[m].unit} of {METRICS[m].label.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Waste %" htmlFor={p("wastePct")} className="w-24">
          <input id={p("wastePct")} name="wastePct" inputMode="decimal" className="input" value={wastePct} onChange={(e) => setWastePct(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" name="roundUp" checked={roundUp} onChange={(e) => setRoundUp(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Round up
        </label>
        <div className="ml-auto flex items-center gap-2 pb-0.5">
          <SubmitButton size="sm">{values ? "Save item" : "Add item"}</SubmitButton>
          {onCancel ? (
            <button type="button" onClick={onCancel} className={buttonClasses("ghost", "sm")}>
              Cancel
            </button>
          ) : cancelHref ? (
            <Link href={cancelHref} className={buttonClasses("ghost", "sm")}>
              Cancel
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}
