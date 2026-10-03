"use client";

import { useState } from "react";
import { CODE_GROUPS, codeGroupsFor, groupCategory, type CodeGroup, type CodeRules } from "@/lib/code-groups";
import { cn, costCodeLabel } from "@/lib/utils";

type CostCode = { id: string; code: string | null; name: string };

/**
 * "New windows go in [category], and do they all use the same cost code?" — one
 * question per kind of item this takeoff makes by itself. Answers are remembered for
 * every job (the next takeoff shows them filled in). Posted as coderule_<group> =
 * cost code id, "ask", or blank; catrule_<group> = the category, only when changed.
 */
export function CodeRuleFields({ type, costCodes, rules, categories }: { type: string; costCodes: CostCode[]; rules: CodeRules; categories: string[] }) {
  const groups = codeGroupsFor(type);
  if (!groups.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Where new items go, and their cost codes</p>
        <p className="text-xs text-slate-600">
          Remembered for every job (change them any time in Settings → Item List). Codes you&apos;ve already set on an item are never changed — only blanks are filled in.
        </p>
      </div>
      {groups.map((g) => (
        <RuleRow key={g} group={g} costCodes={costCodes} rule={rules[g]} current={groupCategory(g, rules)} />
      ))}
      <datalist id="code-rule-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}

function RuleRow({ group, costCodes, rule, current }: { group: CodeGroup; costCodes: CostCode[]; rule?: { sameForAll: boolean; costCodeId: string | null }; current: string }) {
  const [same, setSame] = useState(rule?.sameForAll ?? true);
  const [category, setCategory] = useState(current);
  const changed = category.trim() && category.trim() !== current;
  const [code, setCode] = useState(rule?.costCodeId ?? "");
  const g = CODE_GROUPS[group];
  const value = same ? code : "ask";
  const radio = (on: boolean) => cn("px-2.5 py-1 text-xs font-medium", on ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50");
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-amber-100 pt-2">
      <input type="hidden" name={`coderule_${group}`} value={value} />
      {changed ? <input type="hidden" name={`catrule_${group}`} value={category.trim()} /> : null}
      <label className="flex w-full items-center gap-2 text-sm text-slate-800">
        New <strong>{g.label.toLowerCase()}</strong> go in
        <input
          list="code-rule-categories"
          aria-label={`Category for new ${g.label}`}
          className="input !h-8 !w-56 !py-1"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <span className="text-xs text-slate-500">— one of your Item List categories</span>
      </label>
      <span className="min-w-56 text-sm text-slate-800">
        Do all <strong>{g.plural}</strong> use the same cost code?
      </span>
      <div role="radiogroup" aria-label={`Same cost code for all ${g.label}`} className="inline-flex overflow-hidden rounded-md border border-slate-300">
        <button type="button" role="radio" aria-checked={same} className={radio(same)} onClick={() => setSame(true)}>
          Yes
        </button>
        <button type="button" role="radio" aria-checked={!same} className={radio(!same)} onClick={() => setSame(false)}>
          No, ask me for each
        </button>
      </div>
      {same ? (
        <select
          aria-label={`Cost code for all ${g.label}`}
          className={cn("input !h-8 !w-64 !py-1", !code && "border-amber-400 ring-2 ring-amber-200")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        >
          <option value="">Which cost code?</option>
          {costCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {costCodeLabel(c)}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-xs text-slate-500">You&apos;ll pick a code as each new item is created.</span>
      )}
      {same && !code ? <span className="text-xs text-amber-700">Pick one — otherwise new {g.plural} get no cost code and you&apos;ll be asked later.</span> : null}
    </div>
  );
}
