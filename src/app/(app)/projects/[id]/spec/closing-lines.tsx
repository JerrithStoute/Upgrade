"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ClosingLine } from "@/lib/spec-math";

let seq = 0;
const key = () => `c${++seq}`;

/** The seller's closing costs, line by line: each a % of the price or a flat amount. Saved with the form as JSON. */
export function ClosingLinesEditor({ initial }: { initial: ClosingLine[] }) {
  const [lines, setLines] = useState(() => initial.map((l) => ({ ...l, key: key(), text: String(l.value) })));
  const set = (k: string, patch: Partial<ClosingLine & { text: string }>) => setLines((cur) => cur.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  return (
    <div className="max-w-xl space-y-2">
      <input
        type="hidden"
        name="closingLines"
        value={JSON.stringify(lines.map(({ key: _k, text, ...l }) => (void _k, { ...l, value: Number(text.replace(/[$,%\s]/g, "")) || 0 })))}
      />
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {lines.map((l) => (
            <tr key={l.key}>
              <td className="py-1 pr-2">
                <input
                  className="input !h-8 text-sm"
                  value={l.name}
                  onChange={(e) => set(l.key, { name: e.target.value })}
                  aria-label="Closing cost"
                  placeholder="e.g. Escrow fee"
                />
              </td>
              <td className="w-[5.5rem] py-1 pr-2">
                <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs font-medium">
                  {(["PCT", "FLAT"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set(l.key, { kind: k })}
                      title={k === "PCT" ? "A percentage of the price" : "A flat amount"}
                      className={l.kind === k ? "bg-slate-900 px-2.5 py-1 text-white" : "bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50"}
                    >
                      {k === "PCT" ? "%" : "$"}
                    </button>
                  ))}
                </div>
              </td>
              <td className="w-28 py-1 pr-1">
                <span className="relative block">
                  {l.kind === "FLAT" ? <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">$</span> : null}
                  <input
                    className={l.kind === "FLAT" ? "input !h-8 !pl-5 text-right text-sm" : "input !h-8 !pr-6 text-right text-sm"}
                    inputMode="decimal"
                    value={l.text}
                    onChange={(e) => set(l.key, { text: e.target.value })}
                    aria-label={`${l.name} amount`}
                  />
                  {l.kind === "PCT" ? <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">%</span> : null}
                </span>
              </td>
              <td className="w-8 py-1 text-right">
                <button
                  type="button"
                  onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                  aria-label={`Remove ${l.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => setLines((cur) => [...cur, { key: key(), name: "", kind: "FLAT", value: 0, text: "" }])}
        className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add a closing cost
      </button>
    </div>
  );
}
