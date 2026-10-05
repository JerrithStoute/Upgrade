"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, GripVertical, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";

import { codeDivisions, type SheetCostCode } from "@/lib/cost-code-divisions";

function matches(c: SheetCostCode, division: string, q: string) {
  return !q || `${c.code ?? ""} ${c.name} ${division}`.toLowerCase().includes(q);
}

function useFiltered(codes: SheetCostCode[], query: string) {
  const divisions = useMemo(() => codeDivisions(codes), [codes]);
  const q = query.trim().toLowerCase();
  return useMemo(() => divisions.map(([d, list]) => [d, list.filter((c) => matches(c, d, q))] as const).filter(([, list]) => list.length > 0), [divisions, q]);
}

function SearchBox({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        className="input !py-1.5 !pl-8 !pr-7"
        placeholder="Search codes, e.g. framing or 3100"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
          onClick={() => onChange("")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Your cost code list beside the sheet. Click a code to add a line with it to the
 * item you're working in (or, with none picked, a new item named after the code
 * in its division's category). Or drag a code onto an item or a category.
 */
export function CostCodePanel({
  codes,
  used,
  target,
  onAdd,
  onDragCode,
  onDragEnd,
  onClearTarget,
  onClose,
}: {
  codes: SheetCostCode[];
  used: Set<string>;
  /** The item clicks add to, or null (each click makes a new item). */
  target: { name: string; category: string } | null;
  onAdd: (code: SheetCostCode) => void;
  onDragCode: (code: SheetCostCode, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClearTarget: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const groups = useFiltered(codes, query);
  const searching = query.trim() !== "";

  return (
    <aside
      className="sticky top-[calc(4.5rem+var(--job-head,0px))] flex max-h-[calc(100vh-11rem-var(--job-head,0px))] w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
      aria-label="Cost codes"
    >
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Cost codes</h3>
          <button type="button" onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hide cost codes">
            <X className="h-4 w-4" />
          </button>
        </div>
        <SearchBox value={query} onChange={setQuery} />
        {/* Where a click goes — always two lines tall so the list doesn't jump. */}
        <div className="h-9 rounded-md bg-slate-50 px-2 py-1 text-[11px] leading-tight text-slate-600">
          {target ? (
            <>
              Click adds an item to <span className="font-semibold text-blue-800">{target.name || "Untitled item"}</span>
              <button type="button" className="ml-1 font-medium text-blue-700 hover:underline" onClick={onClearTarget}>
                Use their own categories instead
              </button>
            </>
          ) : (
            <>Click adds the code to its category (made if needed). Click a category on the sheet to add to that one instead, or drag a code where you want it.</>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {groups.length === 0 ? <p className="px-3 py-6 text-center text-xs text-slate-500">No cost codes match “{query}”.</p> : null}
        {groups.map(([division, list]) => {
          const expanded = searching || open.has(division);
          const usedCount = list.filter((c) => used.has(c.id)).length;
          return (
            <div key={division}>
              <button
                type="button"
                onClick={() =>
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(division)) n.delete(division);
                    else n.add(division);
                    return n;
                  })
                }
                className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <span className="min-w-0 flex-1 truncate">{division}</span>
                <span className="shrink-0 font-normal text-slate-400">
                  {usedCount ? `${usedCount}/` : ""}
                  {list.length}
                </span>
              </button>
              {expanded
                ? list.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => onDragCode(c, e)}
                      onDragEnd={onDragEnd}
                      className="group/code flex cursor-grab items-center gap-1 py-1 pl-4 pr-2 text-xs hover:bg-blue-50"
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-200 group-hover/code:text-slate-400" />
                      <button type="button" onClick={() => onAdd(c)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={`Add ${c.name}`}>
                        {c.code ? <span className="shrink-0 font-mono text-slate-500">{c.code}</span> : null}
                        <span className="min-w-0 flex-1 truncate text-slate-800">{c.name}</span>
                        {used.has(c.id) ? (
                          <span title="Already on this estimate" className="shrink-0 text-emerald-600">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <Plus className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover/code:text-blue-700" />
                        )}
                      </button>
                    </div>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/**
 * "Start from my cost codes": tick the codes (or whole divisions) this job needs.
 * Each division becomes one spec item with the ticked codes as its cost lines,
 * filed in the category you pick (a division already on the estimate gets the lines).
 */
export function CodePicker({
  codes,
  used,
  categories,
  byCategories,
  onConfirm,
  onCancel,
}: {
  codes: SheetCostCode[];
  used: Set<string>;
  categories: string[];
  /** You've set up categories in Settings: an empty box files each division into its own. */
  byCategories: boolean;
  onConfirm: (codes: SheetCostCode[], category: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(byCategories ? "" : "General");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const groups = useFiltered(codes, query);
  const all = useMemo(() => codeDivisions(codes).flatMap(([, l]) => l), [codes]);
  const flip = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="Start from my cost codes">
      <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="space-y-2 border-b border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-900">Add from my cost codes</h2>
          <p className="text-sm text-slate-600">
            Tick what this job needs. Each cost code category becomes one category (your selection/specification), and the codes you tick become its items.
          </p>
          <SearchBox value={query} onChange={setQuery} autoFocus />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {groups.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No cost codes match “{query}”.</p> : null}
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {groups.map(([division, list]) => {
              const ids = list.map((c) => c.id);
              const n = ids.filter((id) => picked.has(id)).length;
              return (
                <div key={division} className="break-inside-avoid">
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={n === ids.length}
                      ref={(el) => {
                        if (el) el.indeterminate = n > 0 && n < ids.length;
                      }}
                      onChange={(e) => flip(ids, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1 truncate">{division}</span>
                  </label>
                  {list.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded py-0.5 pl-7 pr-1 text-xs text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={picked.has(c.id)} onChange={(e) => flip([c.id], e.target.checked)} />
                      {c.code ? <span className="font-mono text-slate-500">{c.code}</span> : null}
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {used.has(c.id) ? <span className="shrink-0 text-[10px] text-emerald-700">on estimate</span> : null}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            New categories go in
            <input
              className="input !h-8 !w-56 !py-0 text-xs"
              list="picker-categories"
              value={category}
              placeholder={byCategories ? "Your divisions" : "General"}
              aria-label="Division for new categories"
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="picker-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{picked.size ? `${picked.size} picked` : ""}</span>
            <button type="button" className={buttonClasses("ghost", "sm")} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={cn(buttonClasses("primary", "sm"))}
              disabled={!picked.size}
              onClick={() =>
                onConfirm(
                  all.filter((c) => picked.has(c.id)),
                  category,
                )
              }
            >
              Add {picked.size || ""} cost code{picked.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
