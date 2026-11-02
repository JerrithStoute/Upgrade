"use client";

import { useState } from "react";
import { CODE_GROUPS, codeGroupsFor, type CodeGroup, type CodeRules } from "@/lib/code-groups";
import { cn, costCodeLabel } from "@/lib/utils";
import { Line, Section } from "./mini";

type CostCode = { id: string; code: string | null; name: string };

/** A group's answer is in: one code for all of them, or "ask me for each one". */
const isSet = (rule: CodeRules[CodeGroup]) => !!rule && (!rule.sameForAll || !!rule.costCodeId);

/**
 * Cost codes for the kinds of items this takeoff makes by itself — one line each, the
 * code they all use or "Ask me for each one". Set once per company: when they're all
 * set it's one line (Change opens it); a missing one keeps it open, in amber.
 * Posted as coderule_<group> = cost code id, "ask", or blank.
 */
export function CodeRuleFields({ type, costCodes, rules }: { type: string; costCodes: CostCode[]; rules: CodeRules }) {
  const groups = codeGroupsFor(type);
  const missing = groups.some((g) => !isSet(rules[g]));
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;
  const shown = open || missing;
  return (
    <Section title="Cost codes">
      <Line>
        {missing ? (
          <span className="text-amber-700">Pick your codes once — every takeoff after this uses them</span>
        ) : shown ? (
          <span>Remembered for every job</span>
        ) : (
          <span>
            <span className="text-slate-800">All set</span> · {groups.map((g) => CODE_GROUPS[g].label.toLowerCase()).join(", ")}
          </span>
        )}
        {missing ? null : (
          <button type="button" className="ml-auto text-blue-700 hover:underline" aria-expanded={shown} onClick={() => setOpen((o) => !o)}>
            {shown ? "Close" : "Change"}
          </button>
        )}
      </Line>
      {/* Closed, the rows stay (hidden) so a change you made still saves. */}
      {groups.map((g) => (
        <RuleRow key={g} group={g} costCodes={costCodes} rule={rules[g]} hidden={!shown} />
      ))}
    </Section>
  );
}

/** "Framing lumber [cost code ▾]" — or "Ask me for each one". */
function RuleRow({ group, costCodes, rule, hidden }: { group: CodeGroup; costCodes: CostCode[]; rule?: { sameForAll: boolean; costCodeId: string | null }; hidden: boolean }) {
  const [same, setSame] = useState(rule?.sameForAll ?? true);
  const [code, setCode] = useState(rule?.costCodeId ?? "");
  const g = CODE_GROUPS[group];
  const value = same ? code : "ask";
  return (
    <Line className={cn(hidden && "hidden")}>
      <input type="hidden" name={`coderule_${group}`} value={value} />
      <span className="w-24 shrink-0 truncate text-slate-700" title={`New ${g.plural}`}>
        {g.label}
      </span>
      <select
        aria-label={`Cost code for all ${g.label}`}
        title={same && !code ? `Pick one — otherwise new ${g.plural} get no cost code and you'll be asked later` : "Every new one gets this cost code (codes already on an item never change)"}
        className={cn("input min-w-40 flex-1", same && !code && "border-amber-400 ring-2 ring-amber-200")}
        value={value}
        onChange={(e) => {
          if (e.target.value === "ask") setSame(false);
          else {
            setSame(true);
            setCode(e.target.value);
          }
        }}
      >
        <option value="">Which cost code?</option>
        {costCodes.map((c) => (
          <option key={c.id} value={c.id}>
            {costCodeLabel(c)}
          </option>
        ))}
        <option value="ask">Ask me for each one</option>
      </select>
    </Line>
  );
}
