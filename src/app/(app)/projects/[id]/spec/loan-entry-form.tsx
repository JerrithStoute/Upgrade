"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui";
import { UnitInput } from "@/components/ui/unit-input";

const KINDS = [
  ["DRAW", "Draw"],
  ["PAYDOWN", "Paydown"],
  ["RATE", "Rate change"],
  ["ACTUAL", "Bank's interest for a month"],
] as const;

/** Adds to a construction loan's log: a draw, a paydown, a new rate, or the bank's interest for a month. */
export function LoanEntryForm({ action, projectId, carryingCostId, today }: { action: (fd: FormData) => Promise<void>; projectId: string; carryingCostId: string; today: string }) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("DRAW");
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="carryingCostId" value={carryingCostId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="space-y-1">
        <span className="label">Add</span>
        <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {kind === "ACTUAL" ? (
        <label className="space-y-1">
          <span className="label">Month</span>
          <input name="month" type="month" required className="input !w-40" defaultValue={today.slice(0, 7)} />
        </label>
      ) : (
        <label className="space-y-1">
          <span className="label">{kind === "RATE" ? "From" : "Date"}</span>
          <input name="date" type="date" required className="input !w-40" defaultValue={today} />
        </label>
      )}
      {kind === "RATE" ? (
        <UnitInput label="New rate" name="ratePct" suffix="%" width="w-24" placeholder="8.75" required />
      ) : (
        <UnitInput label={kind === "ACTUAL" ? "Bank's interest" : "Amount"} name="amount" prefix="$" width="w-32" required />
      )}
      <label className="w-56 max-w-full space-y-1">
        <span className="label">Note (optional)</span>
        <input name="note" className="input" placeholder={kind === "DRAW" ? "e.g. Draw 4 — framing" : ""} />
      </label>
      <SubmitButton size="sm" pendingText="Adding…">
        Add
      </SubmitButton>
    </form>
  );
}
