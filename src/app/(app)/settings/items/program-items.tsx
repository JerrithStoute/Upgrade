"use client";

import { useState, useTransition } from "react";
import { Bot } from "lucide-react";
import { CODE_GROUPS, CODE_GROUP_KEYS, groupCategory, type CodeGroup, type CodeRules } from "@/lib/code-groups";
import { cn, costCodeLabel } from "@/lib/utils";
import { saveCategoryCode, saveKindCategory } from "./actions";

type CostCode = { id: string; code: string | null; name: string };

/**
 * "Items the program adds": for each kind (windows, interior / exterior doors,
 * framing lumber, sheathing, drywall, trim), which of your categories new ones go
 * in and their cost code. Changing a category offers to move the ones already in
 * the old place. The program finds them by kind, so any category name works.
 */
export function ProgramItems({
  rules,
  categories,
  costCodes,
  counts,
}: {
  rules: CodeRules;
  categories: string[];
  costCodes: CostCode[];
  /** Per group: how many of its items are in each category. */
  counts: Partial<Record<CodeGroup, Record<string, number>>>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 border-b border-slate-100 px-4 py-3">
        <Bot className="mt-0.5 h-4 w-4 text-slate-400" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Items the program adds</p>
          <p className="text-xs text-slate-500">
            When a takeoff adds windows, doors, lumber, sheathing, drywall or trim to this list, they go in the category you pick here with this cost code. Use your own categories
            — the program still finds them.
          </p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {CODE_GROUP_KEYS.map((g) => (
          <Row key={`${g}:${groupCategory(g, rules)}`} group={g} rules={rules} categories={categories} costCodes={costCodes} counts={counts[g] ?? {}} />
        ))}
      </div>
      <datalist id="program-item-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}

function Row({ group, rules, categories, costCodes, counts }: { group: CodeGroup; rules: CodeRules; categories: string[]; costCodes: CostCode[]; counts: Record<string, number> }) {
  const current = groupCategory(group, rules);
  const builtIn = CODE_GROUPS[group].category;
  const [draft, setDraft] = useState(current);
  const [ask, setAsk] = useState<{ to: string; count: number; from: string[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rule = rules[group];
  const codeValue = !rule ? "" : rule.sameForAll ? (rule.costCodeId ?? "") : "ask";
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const saveCategory = (to: string, move: boolean) =>
    startTransition(async () => {
      const r = await saveKindCategory(group, to, move);
      setAsk(null);
      setNote(r.error ?? (r.moved ? `✓ moved ${r.moved}` : "✓ saved"));
    });

  const pick = (to: string) => {
    const name = to.trim().replace(/\s+/g, " ");
    if (!name || name === current) return;
    // Items still in the built-in or previous category can move along.
    const from = Array.from(new Set([builtIn, current])).filter((c) => c !== name && counts[c]);
    const count = from.reduce((n, c) => n + (counts[c] ?? 0), 0);
    if (count) setAsk({ to: name, count, from });
    else saveCategory(name, false);
  };

  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="w-32 shrink-0 text-sm font-medium text-slate-800">{CODE_GROUPS[group].label}</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          goes in
          <input
            list="program-item-categories"
            aria-label={`Category for ${CODE_GROUPS[group].label}`}
            className={cn("input !h-8 !w-56 !py-1 text-xs", current === builtIn && !categories.includes(builtIn) && "border-amber-400")}
            value={draft}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => pick(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setDraft(current);
            }}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          cost code
          <select
            key={codeValue}
            aria-label={`Cost code for ${CODE_GROUPS[group].label}`}
            className={cn("input !h-8 !w-56 !py-0 text-xs", !codeValue && "border-amber-400")}
            defaultValue={codeValue}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              startTransition(async () => {
                const r = await saveCategoryCode(group, v);
                setNote(r.error ?? (r.filled ? `✓ filled in ${r.filled} with no code` : "✓ saved"));
              });
            }}
          >
            <option value="">Not set — ask me</option>
            <option value="ask">Different codes — ask for each</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {costCodeLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">
          {total} on the list{Object.keys(counts).length > 1 ? ` (${Object.keys(counts).length} categories)` : ""}
        </span>
        {note ? <span className="text-xs text-emerald-700">{note}</span> : null}
      </div>
      {ask ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            Move the {ask.count} {CODE_GROUPS[group].plural.split(" (")[0]} item{ask.count === 1 ? "" : "s"} in {ask.from.map((f) => `“${f}”`).join(" and ")} to{" "}
            <strong>“{ask.to}”</strong> too?
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => saveCategory(ask.to, true)}
            className="rounded bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700"
          >
            Move them too
          </button>
          <button type="button" disabled={pending} onClick={() => saveCategory(ask.to, false)} className="rounded px-2 py-1 font-medium hover:bg-amber-100">
            Just new ones
          </button>
          <button
            type="button"
            onClick={() => {
              setAsk(null);
              setDraft(current);
            }}
            className="hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
