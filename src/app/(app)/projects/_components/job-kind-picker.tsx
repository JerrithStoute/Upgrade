"use client";

import { useState } from "react";
import { Hammer, Home, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "SPEC" | "CUSTOM" | "REMODEL";

const KINDS: { kind: Kind; label: string; hint: string; icon: typeof Home; type: string }[] = [
  { kind: "SPEC", label: "Spec home", hint: "Built to sell — no client. Carrying costs, listing and the offer calculator.", icon: KeyRound, type: "NEW_HOME" },
  { kind: "CUSTOM", label: "Custom home", hint: "A new home built for a client.", icon: Home, type: "NEW_HOME" },
  { kind: "REMODEL", label: "Remodel", hint: "Work on a client's existing home — remodels, additions, repairs.", icon: Hammer, type: "REMODEL" },
];

/**
 * The first thing about a job: spec, custom or remodel. It sets the job's type and whether it's
 * a spec house. Editing a job of another type (an addition, commercial…) keeps that type unless
 * you pick a different kind.
 */
export function JobKindPicker({ isSpec, type, preset }: { isSpec?: boolean; type?: string; preset?: string }) {
  // A new job can start with a kind picked ("+ New spec home" on Projects).
  const picked = KINDS.find((k) => k.kind === preset?.toUpperCase());
  const start: Kind | null = type === undefined ? (picked?.kind ?? null) : isSpec ? "SPEC" : type === "NEW_HOME" ? "CUSTOM" : "REMODEL";
  const [kind, setKind] = useState<Kind | null>(start);
  const [typeValue, setTypeValue] = useState(type ?? picked?.type ?? "");
  return (
    <div className="space-y-2">
      <input type="hidden" name="type" value={typeValue} />
      <input type="hidden" name="isSpec" value={kind === "SPEC" ? "on" : ""} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="What kind of job">
        {KINDS.map((k) => {
          const on = kind === k.kind;
          return (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (kind === k.kind) return;
                setKind(k.kind);
                setTypeValue(k.type);
              }}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                on ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <k.icon className={cn("mt-0.5 h-5 w-5 shrink-0", on ? "text-blue-700" : "text-slate-400")} />
              <span>
                <span className={cn("block font-semibold", on ? "text-blue-900" : "text-slate-900")}>{k.label}</span>
                <span className="block text-xs text-slate-500">{k.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
