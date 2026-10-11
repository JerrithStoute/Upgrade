"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui";
import { UnitInput } from "@/components/ui/unit-input";

export type CodeChoice = { id: string; label: string };
type Values = {
  id?: string;
  name: string;
  kind: string;
  amount: number;
  frequency: string;
  loanBalance: number | null;
  ratePct: number | null;
  startDate: string;
  endDate: string;
  costCodeId: string | null;
};

const PRESETS = ["Construction loan interest", "Builder's risk / vacant insurance", "HOA dues", "Utilities", "Lawn care & cleaning", "Staging"];

/** A carrying cost: loan interest (balance × rate), or an amount monthly / yearly / once. */
export function CarryingForm({
  action,
  projectId,
  codes,
  values,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  projectId: string;
  codes: CodeChoice[];
  values: Values;
  submitLabel: string;
}) {
  const [kind, setKind] = useState(values.kind);
  const [name, setName] = useState(values.name);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="w-72 max-w-full space-y-1">
          <span className="label">What</span>
          <input
            name="name"
            required
            list="carrying-presets"
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (/interest/i.test(e.target.value)) setKind("INTEREST");
            }}
            placeholder="e.g. Builder's risk insurance"
          />
          <datalist id="carrying-presets">
            {PRESETS.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <div className="space-y-1">
          <span className="label">Worked out as</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
            {[
              ["INTEREST", "Loan interest"],
              ["AMOUNT", "An amount"],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={kind === k ? "rounded-md bg-slate-900 px-3 py-1.5 text-white" : "rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100"}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {kind === "INTEREST" ? (
          <>
            <UnitInput label="Starting balance" name="loanBalance" prefix="$" width="w-32" defaultValue={values.loanBalance} placeholder="0" />
            <UnitInput label="Rate a year" name="ratePct" suffix="%" width="w-24" defaultValue={values.ratePct} placeholder="8.5" required />
          </>
        ) : (
          <>
            <UnitInput label="Amount" name="amount" prefix="$" width="w-28" defaultValue={values.amount || ""} required />
            <label className="space-y-1">
              <span className="label">How often</span>
              <select name="frequency" className="input !w-36" defaultValue={values.frequency}>
                <option value="MONTHLY">A month</option>
                <option value="YEARLY">A year</option>
                <option value="ONCE">Once</option>
              </select>
            </label>
          </>
        )}
        <label className="space-y-1">
          <span className="label">From</span>
          <input name="startDate" type="date" required className="input !w-40" defaultValue={values.startDate} />
        </label>
        <label className="space-y-1">
          <span className="label">Until (optional)</span>
          <input name="endDate" type="date" className="input !w-40" defaultValue={values.endDate} />
        </label>
      </div>
      {kind === "INTEREST" ? <p className="text-xs text-slate-500">Starting balance: what was owed before the draws you log — $0 if every dollar came from a draw.</p> : null}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="w-80 max-w-full space-y-1">
          <span className="label">Cost code (its estimate line)</span>
          <select name="costCodeId" className="input" defaultValue={values.costCodeId ?? ""}>
            <option value="">No cost code</option>
            {codes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton size="sm" pendingText="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
