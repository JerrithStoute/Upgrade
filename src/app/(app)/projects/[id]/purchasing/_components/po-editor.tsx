"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { money } from "@/lib/utils";
import { savePurchaseOrder } from "../actions";

export type CodeOption = { id: string; label: string };
type Line = { key: string; description: string; costCodeId: string | null; quantity: number; unit: string; unitCost: number };

let seq = 0;
const key = () => `l${Date.now().toString(36)}${++seq}`;

/** A PO's details and lines, edited in place and saved together. Read-only once it's closed or void. */
export function PoEditor({
  projectId,
  poId,
  initial,
  codes,
  vendors,
  readOnly,
}: {
  projectId: string;
  poId: string;
  initial: { title: string; vendor: string; scope: string; deliveryDate: string; lines: Omit<Line, "key">[] };
  codes: CodeOption[];
  vendors: string[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [vendor, setVendor] = useState(initial.vendor);
  const [scope, setScope] = useState(initial.scope);
  const [deliveryDate, setDeliveryDate] = useState(initial.deliveryDate);
  const [lines, setLines] = useState<Line[]>(initial.lines.map((l) => ({ ...l, key: key() })));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const touch = () => setDirty(true);
  const set = (k: string, patch: Partial<Line>) => {
    setLines((cur) => cur.map((l) => (l.key === k ? { ...l, ...patch } : l)));
    touch();
  };
  const total = lines.reduce((n, l) => n + l.quantity * l.unitCost, 0);
  const save = () =>
    start(async () => {
      setError(null);
      const r = await savePurchaseOrder(projectId, poId, { title, vendor, scope, deliveryDate, lines: lines.map(({ key: _k, ...l }) => (void _k, l)) });
      if (!r.ok) return setError(r.error);
      setDirty(false);
      router.refresh();
    });
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 md:col-span-2">
          <span className="label">Title</span>
          <input className="input" value={title} disabled={readOnly} onChange={(e) => (setTitle(e.target.value), touch())} />
        </label>
        <label className="space-y-1">
          <span className="label">To (sub / vendor)</span>
          <input className="input" list="po-vendors" value={vendor} disabled={readOnly} onChange={(e) => (setVendor(e.target.value), touch())} />
          <datalist id="po-vendors">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label className="space-y-1">
          <span className="label">Needed by</span>
          <input type="date" className="input" value={deliveryDate} disabled={readOnly} onChange={(e) => (setDeliveryDate(e.target.value), touch())} />
        </label>
        <label className="space-y-1 md:col-span-4">
          <span className="label">Scope of work / notes (on the PO)</span>
          <textarea
            className="input"
            rows={3}
            value={scope}
            disabled={readOnly}
            placeholder="What's included, what's not, cleanup, schedule…"
            onChange={(e) => (setScope(e.target.value), touch())}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 font-medium">Item</th>
              <th className="w-56 px-2 py-2 font-medium">Cost code</th>
              <th className="w-24 px-2 py-2 text-right font-medium">Qty</th>
              <th className="w-20 px-2 py-2 font-medium">Unit</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Unit price</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                  No lines yet{readOnly ? "." : " — add one below."}
                </td>
              </tr>
            ) : null}
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="px-1 py-1">
                  <input className="input !h-8 !py-0" value={l.description} disabled={readOnly} aria-label="Item" onChange={(e) => set(l.key, { description: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <select
                    className="input !h-8 !py-0 text-xs"
                    value={l.costCodeId ?? ""}
                    disabled={readOnly}
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
                    step="any"
                    value={l.quantity}
                    disabled={readOnly}
                    aria-label="Quantity"
                    onChange={(e) => set(l.key, { quantity: num(e.target.value) })}
                  />
                </td>
                <td className="px-1 py-1">
                  <input className="input !h-8 !py-0" value={l.unit} disabled={readOnly} aria-label="Unit" onChange={(e) => set(l.key, { unit: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <input
                    className="input !h-8 !py-0 text-right"
                    type="number"
                    step="0.01"
                    value={l.unitCost}
                    disabled={readOnly}
                    aria-label="Unit price"
                    onChange={(e) => set(l.key, { unitCost: num(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-1 text-right font-medium tabular-nums">{money(l.quantity * l.unitCost)}</td>
                <td className="px-1 py-1">
                  {readOnly ? null : (
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                      aria-label="Remove line"
                      onClick={() => (setLines((cur) => cur.filter((x) => x.key !== l.key)), touch())}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200">
            <tr className="font-semibold">
              <td colSpan={5} className="px-2 py-2 text-right">
                PO total
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{money(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const last = lines[lines.length - 1];
              setLines((cur) => [...cur, { key: key(), description: "", costCodeId: last?.costCodeId ?? null, quantity: 1, unit: "ls", unitCost: 0 }]);
              touch();
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add line
          </Button>
          <span className="ml-auto flex items-center gap-2">
            {error ? <span className="text-sm text-rose-700">{error}</span> : dirty ? <span className="text-xs text-amber-700">Not saved yet</span> : null}
            <Button type="button" onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save PO"}
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
