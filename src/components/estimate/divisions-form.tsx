"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";
import { saveEstimateCategories } from "@/app/(app)/settings/estimate-divisions/actions";

export type DivisionSetup = { name: string; divisions: string[] };
type Row = { key: number; name: string; categories: string[] };

let seq = 0;

/**
 * Your divisions (big groups such as "Excavation and Foundation"), in the order
 * estimates and proposals show them, and the cost code categories each one holds
 * ("2000 Excavation", "2100 Footing and Foundation"). Used in Settings and, in a side
 * panel, right on the estimate. Nothing is saved until "Save changes".
 *
 * (In the database a division is an EstimateCategory, and a cost code category is
 * CostCode.division — `DivisionSetup.divisions` holds those.)
 */
export function DivisionsForm({
  initial,
  categories,
  compact,
  onSaved,
}: {
  initial: DivisionSetup[];
  /** Your cost code categories, with how many codes each has. */
  categories: { name: string; codes: number }[];
  /** In the estimate's side panel: one column. */
  compact?: boolean;
  /** Called with what was saved (the estimate re-organizes itself). */
  onSaved?: (saved: DivisionSetup[]) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initial.map((c) => ({ key: ++seq, name: c.name, categories: c.divisions })));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const placed = new Set(rows.flatMap((c) => c.categories));
  const unplaced = categories.filter((d) => !placed.has(d.name));
  const known = new Set(categories.map((d) => d.name));
  const change = (fn: (c: Row[]) => Row[]) => {
    setRows(fn);
    setDirty(true);
    setError(null);
  };
  const patch = (key: number, p: Partial<Row>) => change((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
  const move = (i: number, by: number) =>
    change((cs) => {
      const n = [...cs];
      const [c] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + by)), 0, c);
      return n;
    });

  useEffect(() => {
    if (!dirty || compact) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, compact]);

  const save = () =>
    startSaving(async () => {
      const saved = rows.map((c) => ({ name: c.name.trim(), divisions: c.categories }));
      const r = await saveEstimateCategories(saved);
      if (!r.ok) setError(r.error);
      else {
        setDirty(false);
        onSaved?.(saved);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-600">
        Divisions are your big groups — e.g. <span className="font-medium text-slate-800">Excavation and Foundation</span> holding the categories 2000 Excavation and 2100 Footing
        and Foundation. A category added to an estimate (from your cost codes or the takeoff) goes in its division. Categories you haven&apos;t placed go in{" "}
        <span className="font-medium text-slate-800">General</span>. Arranging categories on an estimate and saving it updates this list too.
      </p>

      <div className={cn("grid gap-4", !compact && "lg:grid-cols-[1fr_18rem]")}>
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              No divisions yet — add your first one below.
            </div>
          ) : null}
          {rows.map((c, i) => (
            <div key={c.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-xs text-slate-400">{i + 1}.</span>
                <input
                  className={cn("input !py-1.5 font-semibold", !c.name.trim() && "!border-rose-300")}
                  value={c.name}
                  placeholder="Division name, e.g. Excavation and Foundation"
                  aria-label="Division name"
                  autoFocus={!c.name}
                  onChange={(e) => patch(c.key, { name: e.target.value })}
                />
                <button type="button" className={buttonClasses("ghost", "sm")} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={buttonClasses("ghost", "sm")} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(buttonClasses("ghost", "sm"), "text-rose-700")}
                  onClick={() => change((cs) => cs.filter((x) => x.key !== c.key))}
                  aria-label={`Delete ${c.name || "division"}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                {c.categories.map((d) => (
                  <span
                    key={d}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                      known.has(d) ? "bg-blue-50 text-blue-900 ring-blue-200" : "bg-slate-50 text-slate-500 ring-slate-200",
                    )}
                    title={known.has(d) ? undefined : "Not in your cost codes any more"}
                  >
                    {d}
                    <button
                      type="button"
                      aria-label={`Take ${d} out`}
                      className="rounded-full p-0.5 hover:bg-blue-100"
                      onClick={() => patch(c.key, { categories: c.categories.filter((x) => x !== d) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <select
                  className="input !h-7 !w-56 !py-0 text-xs"
                  value=""
                  aria-label={`Add a category to ${c.name || "this division"}`}
                  onChange={(e) => e.target.value && patch(c.key, { categories: [...c.categories, e.target.value] })}
                >
                  <option value="">{unplaced.length ? "+ Add a category…" : "All categories are placed"}</option>
                  {unplaced.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => change((cs) => [...cs, { key: ++seq, name: "", categories: [] }])}>
            <Plus className="h-3.5 w-3.5" /> Add division
          </button>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Not in a division yet</h3>
          <p className="mb-2 text-xs text-slate-500">These go in General. Add them to a division from its “Add a category” list.</p>
          {unplaced.length === 0 ? (
            <p className="text-xs text-emerald-700">Every category has a division.</p>
          ) : (
            <ul className={cn("space-y-0.5 overflow-y-auto text-xs text-slate-700", compact ? "max-h-48" : "max-h-[28rem]")}>
              {unplaced.map((d) => (
                <li key={d.name} className="flex justify-between gap-2">
                  <span className="truncate">{d.name}</span>
                  <span className="shrink-0 text-slate-400">{d.codes}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <span className={cn("mr-auto text-xs", error ? "text-rose-700" : "text-amber-700")}>{error ?? (dirty ? "Not saved yet" : "")}</span>
        <button
          type="button"
          className={buttonClasses("secondary")}
          disabled={!dirty || saving}
          onClick={() => {
            setRows(initial.map((c) => ({ key: ++seq, name: c.name, categories: c.divisions })));
            setDirty(false);
            setError(null);
          }}
        >
          Discard
        </button>
        <button type="button" className={buttonClasses("primary")} disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
