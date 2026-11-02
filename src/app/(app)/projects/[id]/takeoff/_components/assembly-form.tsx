"use client";

import { useMemo, useState } from "react";
import Link from "@/components/link";
import { BookOpen, Plus } from "lucide-react";
import { SubmitButton, buttonClasses } from "@/components/ui";
import { UNITS } from "@/lib/constants";
import { cn, costCodeLabel, money } from "@/lib/utils";
import { METRICS, METRICS_BY_TYPE, itemNameKey, type ConditionType } from "@/lib/takeoff";
import { Line, SMALL_BOXES } from "./mini";
import { ItemSearch } from "@/components/item-search";

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
  /** "This job only": keeps its own price when the Item List changes. */
  pricePinned?: boolean;
};

export type ItemOption = {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  wastePct: number;
  roundUp: boolean;
  costCodeId: string | null;
  sku: string | null;
};

/**
 * One item of a takeoff, in a small box of short lines: the item; "[1] [ea] per [32]
 * [sf of area] · [0]% waste"; "$[price] each · [cost code]"; then Remove… / Cancel / Save.
 * The item name searches the Item List; picking an entry fills in its unit, price,
 * waste and cost code. A name that isn't on the list is added to it on save.
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
  removeAction,
}: {
  /** Job takeoffs: this job's prices are locked (a price typed here stays on this job). Leave out on templates. */
  pricesLocked?: boolean;
  action: (fd: FormData) => Promise<void>;
  /** Hidden fields identifying where the item lives (projectId, or templateId). */
  hidden: Record<string, string>;
  condition: { id: string; type: string; metric: string };
  costCodes: { id: string; code: string | null; name: string }[];
  items: ItemOption[];
  values?: AssemblyFormValues;
  cancelHref?: string;
  onCancel?: () => void;
  /** Editing: Remove… (asks first) runs this with the form's fields (projectId, id, returnTo). */
  removeAction?: (fd: FormData) => Promise<void>;
}) {
  const metrics = METRICS_BY_TYPE[condition.type as ConditionType] ?? [];
  const p = (k: string) => `asm-${values?.id ?? `new-${condition.id}`}-${k}`;
  const byKey = useMemo(() => new Map(items.map((i) => [itemNameKey(i.name), i])), [items]);

  const [description, setDescription] = useState(values?.description ?? "");
  const [unit, setUnit] = useState(values?.unit ?? "ea");
  const [unitCost, setUnitCost] = useState(String(values?.unitCost ?? 0));
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
    setWastePct(String(item.wastePct));
    setRoundUp(item.roundUp);
    setCostCodeId(item.costCodeId ?? "");
  };

  const listPrice = match && match.unitCost > 0 && Math.abs(Number(unitCost.replace(/[$,\s]/g, "")) - match.unitCost) > 0.0001 ? match.unitCost : null;

  return (
    <form action={action} className={cn("space-y-1.5 rounded-md bg-slate-50 p-2", SMALL_BOXES)}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="conditionId" value={condition.id} />
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <Line>
        <ItemSearch id={p("description")} name="description" required autoFocus={!values} value={description} onChange={pick} items={items} className="flex-1" />
      </Line>
      {description.trim() ? (
        match ? (
          <p className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
            <BookOpen className="h-3 w-3" /> From the Item List · {match.category} · list price {money(match.unitCost)}/{match.unit}
            {listPrice != null ? (
              <button type="button" className="ml-1 font-medium text-blue-700 hover:underline" onClick={() => setUnitCost(String(listPrice))}>
                Use {money(listPrice)}
              </button>
            ) : null}
          </p>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-emerald-700">
            <Plus className="h-3 w-3" /> New — added to the Item List when you save
          </p>
        )
      ) : null}
      <Line>
        <input id={p("qty")} name="qty" inputMode="decimal" aria-label="How many" className="input !w-12" defaultValue={values?.qty ?? 1} />
        <select id={p("unit")} name="unit" aria-label="Unit" className="input !w-auto" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <span>per</span>
        <input id={p("per")} name="per" inputMode="decimal" aria-label="Per" className="input !w-14" defaultValue={values?.per ?? 1} />
        <select id={p("metric")} name="metric" aria-label="Of" className="input !w-32" defaultValue={values?.metric ?? condition.metric}>
          {metrics.map((m) => (
            <option key={m} value={m}>
              {METRICS[m].unit} of {METRICS[m].label.toLowerCase()}
            </option>
          ))}
        </select>
      </Line>
      <Line>
        <input id={p("wastePct")} name="wastePct" inputMode="decimal" aria-label="Waste %" className="input !w-11" value={wastePct} onChange={(e) => setWastePct(e.target.value)} />
        <span>% waste</span>
        <label className="flex items-center gap-1 text-slate-700">
          <input type="checkbox" name="roundUp" checked={roundUp} onChange={(e) => setRoundUp(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
          Round up
        </label>
        <span>·</span>
        <span>$</span>
        <input id={p("unitCost")} name="unitCost" inputMode="decimal" aria-label="Unit cost" className="input !w-20" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        <span>per {unit}</span>
      </Line>
      <Line>
        {hidden.projectId ? (
          pricesLocked ? (
            <span title="A price you save here goes on every takeoff in this job that uses this item, and nowhere else.">Prices locked on this job</span>
          ) : (
            <label
              className="flex items-center gap-1 text-slate-700"
              title="Keeps this price on this job when the Item List changes. Not ticked: the price is the Item List's, so saving it here changes it on every job that isn't locked."
            >
              <input type="checkbox" name="pinPrice" defaultChecked={values?.pricePinned ?? false} className="h-3.5 w-3.5 rounded border-slate-300" />
              This job only
            </label>
          )
        ) : null}
        <select
          id={p("costCodeId")}
          name="costCodeId"
          aria-label="Cost code"
          title="Just this takeoff's line — the same item can go under another cost code in another takeoff. The price is shared."
          className="input min-w-36 flex-1"
          value={costCodeId}
          onChange={(e) => setCostCodeId(e.target.value)}
        >
          <option value="">Cost code —</option>
          {costCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {costCodeLabel(c)}
            </option>
          ))}
        </select>
      </Line>
      {/* Save comes first in the page (shown last), so Enter in a box saves rather than removes. */}
      <div className="flex items-center gap-2 pt-0.5">
        <SubmitButton size="xs" className="order-last">
          {values ? "Save" : "Add"}
        </SubmitButton>
        {values && removeAction ? (
          <button
            type="submit"
            formAction={removeAction}
            formNoValidate
            className="text-xs text-rose-600 hover:underline"
            onClick={(e) => {
              if (!window.confirm(`Remove "${values.description}"?`)) e.preventDefault();
            }}
          >
            Remove…
          </button>
        ) : null}
        <span className="order-1 flex-1" />
        {onCancel ? (
          <button type="button" onClick={onCancel} className={buttonClasses("secondary", "xs", "order-2")}>
            Cancel
          </button>
        ) : cancelHref ? (
          <Link href={cancelHref} className={buttonClasses("secondary", "xs", "order-2")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}
