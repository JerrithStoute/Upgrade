"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui";
import { cn, money } from "@/lib/utils";
import { createPurchaseOrder } from "../actions";

/**
 * A new PO: blank, from the budget (the estimate's lines for the cost codes you pick), or
 * from a bid you took (that vendor's quoted lines for its cost code).
 */
export function NewPoForm({
  projectId,
  vendors,
  budget,
  awards,
}: {
  projectId: string;
  vendors: string[];
  budget: { codeKey: string; label: string; cost: number; lines: number }[];
  awards: { value: string; label: string; total: number }[];
}) {
  const [source, setSource] = useState<"blank" | "budget" | "bid">(awards.length ? "bid" : budget.length ? "budget" : "blank");
  const tab = (v: typeof source, label: string, disabled?: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setSource(v)}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40", source === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
    >
      {label}
    </button>
  );
  return (
    <form action={createPurchaseOrder} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="source" value={source} />
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {tab("bid", "From a bid you took", !awards.length)}
        {tab("budget", "From the budget", !budget.length)}
        {tab("blank", "Blank")}
      </div>

      {source === "bid" ? (
        <label className="block space-y-1">
          <span className="label">Bid</span>
          <select name="award" className="input" required>
            {awards.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label} — {money(a.total)}
              </option>
            ))}
          </select>
          <span className="block text-xs text-slate-500">The PO goes to that vendor, with their quoted items and prices.</span>
        </label>
      ) : (
        <label className="block max-w-md space-y-1">
          <span className="label">To (sub / vendor)</span>
          <input name="vendor" required list="new-po-vendors" className="input" placeholder="e.g. Hill Country Plumbing" />
          <datalist id="new-po-vendors">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      )}

      {source === "budget" ? (
        <fieldset className="space-y-1">
          <legend className="label">Cost codes (the budget&apos;s lines for them, at cost)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {budget.map((b) => (
              <label key={b.codeKey} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="code" value={b.codeKey} className="h-4 w-4 rounded border-slate-300" />
                <span className="min-w-0 flex-1 truncate">{b.label}</span>
                <span className="text-xs tabular-nums text-slate-500">{money(b.cost)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="block max-w-md space-y-1">
        <span className="label">Title (optional)</span>
        <input name="title" className="input" placeholder="e.g. Rough plumbing" />
      </label>
      <SubmitButton pendingText="Creating…">Create PO</SubmitButton>
    </form>
  );
}
