"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { UNITS } from "@/lib/constants";
import { cn, costCodeLabel } from "@/lib/utils";
import { ConfirmForm, buttonClasses } from "@/components/ui";
import { deleteMaterialItem, restoreItemCells, saveItemCells, type ItemCell } from "./actions";
import { moveByArrow } from "@/components/grid-keys";

export type ItemRow = {
  id: string;
  name: string;
  notes: string | null;
  category: string;
  unit: string;
  unitCost: number;
  markupPct: number;
  wastePct: number;
  roundUp: boolean;
  costCodeId: string | null;
  sku: string | null;
  vendor: string | null;
  used: number;
};

type CostCode = { id: string; code: string | null; name: string };
type Status = "saving" | "saved" | { error: string };

const cell = "!h-8 !px-2 !py-1";
// The checkbox and item name stay in view when the table scrolls sideways.
const pinBox = "sticky left-0 z-10 w-10 min-w-10 px-3";
const pinItem = "sticky left-10 z-10 px-2 shadow-[1px_0_0_0_theme(colors.slate.200)]";

/**
 * The Item List as an editable table: change a price, markup, waste, cost code, unit,
 * SKU or vendor right in its row (it saves when you leave the box). Like a spreadsheet,
 * tick several rows and a change on one of them goes into the same box on all of them,
 * with Undo.
 */
export function ItemTable({
  rows,
  costCodes,
  returnTo,
  editId,
  editForm,
}: {
  rows: ItemRow[];
  costCodes: CostCode[];
  returnTo: string;
  editId?: string;
  editForm?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [undo, setUndo] = useState<{ field: ItemCell; prev: { id: string; value: string }[]; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const groups: [string, ItemRow[]][] = [];
  for (const r of rows) {
    const g = groups.find(([c]) => c === r.category);
    if (g) g[1].push(r);
    else groups.push([r.category, [r]]);
  }
  const visible = new Set(rows.map((r) => r.id));
  const picked = [...selected].filter((id) => visible.has(id));

  const toggle = (ids: string[], on: boolean) => {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  /** A change on a ticked row goes to every ticked row (spreadsheet-style); otherwise just this one. */
  const save = (id: string, field: ItemCell, value: string) => {
    const k = `${id}:${field}`;
    const ids = selected.has(id) && picked.length > 1 ? picked : [id];
    setStatus((s) => ({ ...s, [k]: "saving" }));
    startTransition(async () => {
      const r = await saveItemCells(ids, field, value);
      setStatus((s) => ({ ...s, [k]: r.error ? { error: r.error } : "saved" }));
      if (!r.error && r.prev && ids.length > 1) setUndo({ field, prev: r.prev, text: `${FIELD_LABELS[field]} applied to ${ids.length} items` });
      if (!r.error)
        setTimeout(
          () =>
            setStatus((s) => {
              if (s[k] !== "saved") return s;
              const next = { ...s };
              delete next[k];
              return next;
            }),
          1500,
        );
    });
  };
  const mark = (id: string, field: ItemCell) => <CellStatus status={status[`${id}:${field}`]} />;
  const allOn = rows.length > 0 && picked.length === rows.length;

  return (
    <>
      <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm" onKeyDown={moveByArrow}>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className={cn(pinBox, "bg-slate-50 py-2.5")}>
                <input
                  type="checkbox"
                  aria-label="Select all items shown"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={allOn}
                  onChange={(e) => toggle([...visible], e.target.checked)}
                />
              </th>
              <th className={cn(pinItem, "bg-slate-50 py-2.5 font-medium")}>Item</th>
              <th className="px-2 py-2.5 font-medium">Cost code</th>
              <th className="px-2 py-2.5 text-right font-medium">Unit cost</th>
              <th className="px-2 py-2.5 text-right font-medium">Markup %</th>
              <th className="px-2 py-2.5 text-right font-medium">Waste %</th>
              <th className="px-2 py-2.5 text-center font-medium" title="Round quantities up (sold whole)">
                Round up
              </th>
              <th className="px-2 py-2.5 font-medium">SKU</th>
              <th className="px-2 py-2.5 font-medium">Vendor</th>
              <th className="px-2 py-2.5 text-right font-medium">Used</th>
              <th />
            </tr>
          </thead>
          {groups.map(([cat, list]) => {
            const ids = list.map((r) => r.id);
            const on = ids.every((id) => selected.has(id));
            return (
              <tbody key={cat} className="divide-y divide-slate-100">
                <tr className="bg-slate-50/70">
                  <td className={cn(pinBox, "bg-slate-50 py-1.5")}>
                    <input
                      type="checkbox"
                      aria-label={`Select all ${cat}`}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={on}
                      onChange={(e) => toggle(ids, e.target.checked)}
                    />
                  </td>
                  <td colSpan={10} className="bg-slate-50 px-2 py-1.5">
                    <span className="sticky left-12 inline-flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</span>
                    </span>
                  </td>
                </tr>
                {list.map((i) =>
                  editId === i.id ? (
                    <tr key={i.id} id={`item-${i.id}`}>
                      <td colSpan={11} className="bg-slate-50/50 px-4 py-4">
                        {editForm}
                      </td>
                    </tr>
                  ) : (
                    <tr key={i.id} className={cn("group", selected.has(i.id) ? "bg-blue-50" : "bg-white hover:bg-slate-50")}>
                      <td className={cn(pinBox, "bg-inherit py-1.5 align-middle")}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${i.name}`}
                          className="h-4 w-4 rounded border-slate-300"
                          checked={selected.has(i.id)}
                          onChange={(e) => toggle([i.id], e.target.checked)}
                        />
                      </td>
                      <td className={cn(pinItem, "min-w-44 scroll-mt-24 bg-inherit py-1.5 align-middle")}>
                        <span id={`item-${i.id}`} className="font-medium text-slate-900">
                          {i.name}
                        </span>
                        {i.notes ? <span className="block text-xs text-slate-500">{i.notes}</span> : null}
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <div className="flex items-center gap-1">
                          <select
                            key={i.costCodeId ?? ""}
                            aria-label={`Cost code for ${i.name}`}
                            className={cn("input !w-40", cell)}
                            defaultValue={i.costCodeId ?? ""}
                            onChange={(e) => save(i.id, "costCodeId", e.target.value)}
                          >
                            <option value="">—</option>
                            {costCodes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {costCodeLabel(c)}
                              </option>
                            ))}
                          </select>
                          {mark(i.id, "costCodeId")}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          {mark(i.id, "unitCost")}
                          <span className="text-slate-400">$</span>
                          <NumberCell label={`Unit cost for ${i.name}`} value={i.unitCost} min="0" width="!w-20" onSave={(v) => save(i.id, "unitCost", v)} />
                          <span className="text-slate-400">/</span>
                          <select
                            key={i.unit}
                            aria-label={`Unit for ${i.name}`}
                            className={cn("input !w-16", cell)}
                            defaultValue={i.unit}
                            onChange={(e) => save(i.id, "unit", e.target.value)}
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                          {mark(i.id, "unit")}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          {mark(i.id, "markupPct")}
                          <NumberCell label={`Markup % for ${i.name}`} value={i.markupPct} width="!w-16" onSave={(v) => save(i.id, "markupPct", v)} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          {mark(i.id, "wastePct")}
                          <NumberCell label={`Waste % for ${i.name}`} value={i.wastePct} min="0" width="!w-16" onSave={(v) => save(i.id, "wastePct", v)} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center align-middle">
                        <input
                          key={String(i.roundUp)}
                          type="checkbox"
                          aria-label={`Round up ${i.name}`}
                          className="h-4 w-4 rounded border-slate-300"
                          defaultChecked={i.roundUp}
                          onChange={(e) => save(i.id, "roundUp", e.target.checked ? "1" : "0")}
                        />
                        {mark(i.id, "roundUp")}
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <div className="flex items-center gap-1">
                          <TextCell label={`SKU for ${i.name}`} value={i.sku} onSave={(v) => save(i.id, "sku", v)} />
                          {mark(i.id, "sku")}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        <div className="flex items-center gap-1">
                          <TextCell label={`Vendor for ${i.name}`} value={i.vendor} onSave={(v) => save(i.id, "vendor", v)} />
                          {mark(i.id, "vendor")}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right align-middle text-xs tabular-nums text-slate-500">{i.used}</td>
                      <td className="px-2 py-1.5 align-middle">
                        <div className="flex justify-end gap-1">
                          <Link
                            href={`${returnTo}${returnTo.includes("?") ? "&" : "?"}edit=${i.id}#item-${i.id}`}
                            className={buttonClasses("ghost", "sm")}
                            title="Edit name, category, notes, sizes"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit {i.name}</span>
                          </Link>
                          <ConfirmForm
                            action={deleteMaterialItem}
                            hidden={{ id: i.id, returnTo }}
                            message={`Remove "${i.name}" from the Item List?${i.used ? ` ${i.used} assembly item(s) keep their lines and prices but are no longer linked.` : ""}`}
                            variant="ghost"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" aria-label={`Delete ${i.name}`} />
                          </ConfirmForm>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="text-xs text-slate-500">
        {picked.length > 1 ? (
          <span className="font-medium text-blue-800">
            {picked.length} rows ticked — change a box on any of them and it goes into all {picked.length}.{" "}
          </span>
        ) : null}
        Change a price or code right in its row — it saves when you click away. Tick several rows to change them together, like a spreadsheet.
      </p>
      {undo ? <UndoToast key={undo.text + undo.prev.length} undo={undo} onClose={() => setUndo(null)} /> : null}
    </>
  );
}

/** ✓ when a cell saved, a spinner dot while saving, and the error when it didn't. */
function CellStatus({ status }: { status?: Status }) {
  if (!status) return <span className="inline-block w-3.5" />;
  if (status === "saving") return <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" aria-label="Saving" />;
  if (status === "saved") return <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Saved" />;
  return (
    <span title={status.error} className="text-rose-600">
      <X className="h-3.5 w-3.5" aria-label={status.error} />
    </span>
  );
}

/** Saves on blur or Enter when the value changed; Esc puts it back. */
function editKeys(e: React.KeyboardEvent<HTMLInputElement>, original: string) {
  if (e.key === "Enter") e.currentTarget.blur();
  if (e.key === "Escape") {
    e.currentTarget.value = original;
    e.currentTarget.blur();
  }
}

function NumberCell({ label, value, min, width = "!w-20", onSave }: { label: string; value: number; min?: string; width?: string; onSave: (v: string) => void }) {
  const original = String(value);
  // A plain box (no up / down arrows): the arrow keys move between cells instead.
  return (
    <input
      key={original}
      inputMode="decimal"
      aria-label={label}
      className={cn("input text-right tabular-nums", width, cell)}
      defaultValue={original}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => editKeys(e, original)}
      onBlur={(e) => {
        const v = e.currentTarget.value.replace(/[$,%\s]/g, "") || "0";
        const n = Number(v);
        if (!Number.isFinite(n) || (min !== undefined && n < Number(min))) {
          e.currentTarget.value = original;
          return;
        }
        if (n !== value) onSave(String(n));
      }}
    />
  );
}

function TextCell({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) {
  const original = value ?? "";
  return (
    <input
      key={original}
      aria-label={label}
      className={cn("input !w-24", cell)}
      defaultValue={original}
      placeholder="—"
      onKeyDown={(e) => editKeys(e, original)}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v !== original) onSave(v);
      }}
    />
  );
}

const FIELD_LABELS: Record<ItemCell, string> = {
  category: "Category",
  costCodeId: "Cost code",
  unit: "Unit",
  unitCost: "Unit cost",
  markupPct: "Markup",
  wastePct: "Waste",
  roundUp: "Round up",
  sku: "SKU",
  vendor: "Vendor",
};

/** "Unit cost applied to 5 items · Undo" — goes away by itself after a while. */
function UndoToast({ undo, onClose }: { undo: { field: ItemCell; prev: { id: string; value: string }[]; text: string }; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(onClose, 15000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl">
      <Check className="h-4 w-4 text-emerald-400" />
      <span>{error ?? undo.text}</span>
      <button
        type="button"
        disabled={pending}
        className="font-semibold text-blue-300 hover:text-blue-200 disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            const r = await restoreItemCells(undo.field, undo.prev);
            if (r.error) setError(r.error);
            else onClose();
          })
        }
      >
        {pending ? "Undoing…" : "Undo"}
      </button>
      <button type="button" aria-label="Dismiss" className="text-slate-400 hover:text-white" onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
