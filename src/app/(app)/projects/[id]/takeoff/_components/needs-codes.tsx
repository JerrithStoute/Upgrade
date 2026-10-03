"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, X } from "lucide-react";
import { CODE_GROUPS, type CodeGroup, type CodeRules } from "@/lib/code-groups";
import { cn, costCodeLabel } from "@/lib/utils";
import { assignCostCodes } from "../actions";

type CostCode = { id: string; code: string | null; name: string };
export type NeedsCodeItem = { id: string; name: string; group: CodeGroup };

/**
 * Items this job's takeoffs created with no cost code (you said "ask me for each",
 * or never answered). Shown as a button over the plan's corner or a banner on the
 * Takeoff page; opens a short list to give each one a code — or one code for the
 * whole group, which is remembered for next time.
 */
export function NeedsCodes({
  projectId,
  items,
  costCodes,
  rules,
  variant,
}: {
  projectId: string;
  items: NeedsCodeItem[];
  costCodes: CostCode[];
  rules: CodeRules;
  variant: "button" | "banner";
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const text = `${items.length} item${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} a cost code`;
  const panel = open ? <CodesPanel projectId={projectId} items={items} costCodes={costCodes} rules={rules} onClose={() => setOpen(false)} /> : null;

  if (variant === "button")
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-100 px-2.5 text-xs font-medium text-amber-900 shadow-lg ring-1 ring-inset ring-amber-300 hover:bg-amber-200"
          title="New items from your takeoffs that have no cost code yet"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> {text}
        </button>
        {panel ? <div className="absolute bottom-10 left-0 z-40 w-[min(30rem,90vw)]">{panel}</div> : null}
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-medium">{text}.</span>
        <span className="text-amber-800">Your takeoffs added them to the Item List without one.</span>
        <button type="button" onClick={() => setOpen(!open)} className="ml-auto rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700">
          {open ? "Close" : "Set them"}
        </button>
      </div>
      {panel}
    </div>
  );
}

function CodesPanel({ projectId, items, costCodes, rules, onClose }: { projectId: string; items: NeedsCodeItem[]; costCodes: CostCode[]; rules: CodeRules; onClose: () => void }) {
  const groups: [CodeGroup, NeedsCodeItem[]][] = [];
  for (const i of items) {
    const g = groups.find(([k]) => k === i.group);
    if (g) g[1].push(i);
    else groups.push([i.group, [i]]);
  }
  // Per group: one code for all (unless you'd said "ask me for each"), else a code per item.
  const [forAll, setForAll] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(([g]) => [g, rules[g]?.sameForAll !== false])));
  const [groupCode, setGroupCode] = useState<Record<string, string>>({});
  const [itemCode, setItemCode] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ruleList = groups.filter(([g]) => forAll[g] && groupCode[g]).map(([g]) => ({ group: g, costCodeId: groupCode[g] }));
  const itemList = groups.filter(([g]) => !forAll[g]).flatMap(([, list]) => list.filter((i) => itemCode[i.id]).map((i) => ({ id: i.id, costCodeId: itemCode[i.id] })));
  const any = ruleList.length > 0 || itemList.length > 0;

  const save = () =>
    startTransition(async () => {
      try {
        await assignCostCodes({ projectId, items: itemList, rules: ruleList });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} className={cn("input !h-8 !py-1 text-xs", !value && "border-amber-400")} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pick a cost code…</option>
      {costCodes.map((c) => (
        <option key={c.id} value={c.id}>
          {costCodeLabel(c)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-2xl">
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 font-semibold text-slate-900">Give these items a cost code</p>
        <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3">
        {groups.map(([g, list]) => {
          const label = CODE_GROUPS[g];
          return (
            <div key={g} className="rounded-lg border border-slate-200 p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label.label} · {list.length}
              </p>
              <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={forAll[g]} onChange={(e) => setForAll({ ...forAll, [g]: e.target.checked })} />
                All {label.plural} use the same code — remember it for next time
              </label>
              {forAll[g] ? (
                <div className="mt-1.5 space-y-1">
                  {select(groupCode[g] ?? "", (v) => setGroupCode({ ...groupCode, [g]: v }), `Cost code for all ${label.label}`)}
                  <p className="text-[11px] text-slate-500">{list.map((i) => i.name).join(", ")}</p>
                </div>
              ) : (
                <div className="mt-1.5 space-y-1">
                  {list.map((i) => (
                    <div key={i.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-800" title={i.name}>
                        {i.name}
                      </span>
                      <div className="w-56">{select(itemCode[i.id] ?? "", (v) => setItemCode({ ...itemCode, [i.id]: v }), `Cost code for ${i.name}`)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={!any || pending} onClick={save} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save cost codes"}
        </button>
        <span className="text-[11px] text-slate-500">Anything left on &ldquo;Pick…&rdquo; stays blank for now.</span>
      </div>
    </div>
  );
}
