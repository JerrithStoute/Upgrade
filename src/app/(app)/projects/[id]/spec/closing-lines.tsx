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
    <div className="space-y-1">
      <input
        type="hidden"
        name="closingLines"
        value={JSON.stringify(lines.map(({ key: _k, text, ...l }) => (void _k, { ...l, value: Number(text.replace(/[$,%\s]/g, "")) || 0 })))}
      />
      <div className="divide-y divide-slate-100">
        {lines.map((l) => (
          // Wraps on a phone: the name gets its own line rather than being squeezed.
          <div key={l.key} className="flex flex-wrap items-center gap-1.5 py-1">
            <input
              className="input !h-8 min-w-[9rem] flex-1 text-sm"
              value={l.name}
              onChange={(e) => set(l.key, { name: e.target.value })}
              aria-label="Closing cost"
              placeholder="e.g. Escrow fee"
            />
            <span className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs font-medium">
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
            </span>
            <span className="relative block w-24">
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
            <button
              type="button"
              onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
              aria-label={`Remove ${l.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setLines((cur) => [...cur, { key: key(), name: "", kind: "FLAT", value: 0, text: "" }])}
        className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add a closing cost
      </button>
    </div>
  );
}
