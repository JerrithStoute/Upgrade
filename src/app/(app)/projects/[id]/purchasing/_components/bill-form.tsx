"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, SubmitButton } from "@/components/ui";
import { money } from "@/lib/utils";
import type { CodeOption } from "./po-editor";

type Line = { key: string; description: string; costCodeId: string | null; amount: number };
export type PoChoice = { id: string; label: string; vendor: string; left: number; lines: { description: string; costCodeId: string | null; amount: number }[] };

let seq = 0;
const key = () => `b${Date.now().toString(36)}${++seq}`;

/**
 * A vendor bill: who it's from (or the PO it's for — its lines fill in), bill # and dates,
 * what it's for by cost code, and the vendor's file. Saved by `action` (a server action).
 */
export function BillForm({
  action,
  projectId,
  billId,
  codes,
  vendors,
  pos,
  initial,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<void>;
  projectId: string;
  billId?: string;
  codes: CodeOption[];
  vendors: string[];
  pos: PoChoice[];
  initial: { purchaseOrderId: string; vendor: string; billNumber: string; billDate: string; dueDate: string; notes: string; lines: Omit<Line, "key">[] };
  submitLabel: string;
}) {
  const [poId, setPoId] = useState(initial.purchaseOrderId);
  const [vendor, setVendor] = useState(initial.vendor);
  const [lines, setLines] = useState<Line[]>(initial.lines.map((l) => ({ ...l, key: key() })));
  const po = pos.find((p) => p.id === poId);
  const total = lines.reduce((n, l) => n + l.amount, 0);
  const set = (k: string, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      {billId ? <input type="hidden" name="id" value={billId} /> : null}
      <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ key: _k, ...l }) => (void _k, l)))} />
      <div className="grid gap-3 md:grid-cols-4">
        {billId ? null : (
          <label className="space-y-1 md:col-span-2">
            <span className="label">For PO</span>
            <select
              name="purchaseOrderId"
              className="input"
              value={poId}
              onChange={(e) => {
                const next = pos.find((p) => p.id === e.target.value);
                setPoId(e.target.value);
                if (next) {
                  setVendor(next.vendor);
                  // Fill in what's left on the PO — change it to what this bill covers.
                  if (!lines.some((l) => l.description || l.amount)) setLines(next.lines.map((l) => ({ ...l, key: key() })));
                }
              }}
            >
              <option value="">No PO</option>
              {pos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1 md:col-span-2">
          <span className="label">From</span>
          <input
            name="vendor"
            className="input"
            list="bill-vendors"
            required
            value={po ? po.vendor : vendor}
            disabled={!!po || !!billId}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Sub or vendor"
          />
          <datalist id="bill-vendors">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label className="space-y-1">
          <span className="label">Their bill #</span>
          <input name="billNumber" className="input" defaultValue={initial.billNumber} />
        </label>
        <label className="space-y-1">
          <span className="label">Bill date</span>
          <input name="billDate" type="date" required className="input" defaultValue={initial.billDate} />
        </label>
        <label className="space-y-1">
          <span className="label">Due</span>
          <input name="dueDate" type="date" className="input" defaultValue={initial.dueDate} />
        </label>
        <label className="space-y-1">
          <span className="label">Their bill (PDF or photo)</span>
          <input name="file" type="file" accept=".pdf,image/*" className="block w-full text-xs" />
        </label>
        <label className="space-y-1 md:col-span-4">
          <span className="label">Notes</span>
          <input name="notes" className="input" defaultValue={initial.notes} />
        </label>
      </div>

      {po ? (
        <p className="text-xs text-slate-600">
          {po.label}: <strong>{money(po.left)}</strong> left to bill before this one.
          {total > po.left + 0.004 ? <span className="ml-1 font-semibold text-amber-700">This bill is {money(total - po.left)} over what&apos;s left on the PO.</span> : null}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 font-medium">For</th>
              <th className="w-56 px-2 py-2 font-medium">Cost code</th>
              <th className="w-32 px-2 py-2 text-right font-medium">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="px-1 py-1">
                  <input className="input !h-8 !py-0" value={l.description} aria-label="For" onChange={(e) => set(l.key, { description: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="input !h-8 !py-0 text-xs"
                    value={l.costCodeId ?? ""}
                    aria-label="Cost code"
                    onChange={(e) => set(l.key, { costCodeId: e.target.value || null })}
                  >
                    <option value="">No cost code</option>
                    {codes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    className="input !h-8 !py-0 text-right"
                    type="number"
                    step="0.01"
                    value={l.amount}
                    aria-label="Amount"
                    onChange={(e) => set(l.key, { amount: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Remove line"
                    onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200">
            <tr className="font-semibold">
              <td colSpan={2} className="px-2 py-2 text-right">
                Bill total
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLines((cur) => [...cur, { key: key(), description: "", costCodeId: cur[cur.length - 1]?.costCodeId ?? null, amount: 0 }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </Button>
        <SubmitButton className="ml-auto" pendingText="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
