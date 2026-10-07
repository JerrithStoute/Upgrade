"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

type Option = { id: string; name: string; phase: string };
export type LinkValue = { id: string; lag: number };

/**
 * "Waits on": the tasks this one starts after — several, each with lag days (e.g. paint
 * 2 workdays after drywall, for drying). Saved with the form as JSON in `name`.
 */
export function PredecessorsField({ name, options, initial, idPrefix }: { name: string; options: Option[]; initial: LinkValue[]; idPrefix: string }) {
  const [rows, setRows] = useState<LinkValue[]>(initial.filter((l) => options.some((o) => o.id === l.id)));
  const free = (keep?: string) => options.filter((o) => o.id === keep || !rows.some((r) => r.id === o.id));
  const set = (i: number, patch: Partial<LinkValue>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-1.5">
      <input type="hidden" name={name} value={JSON.stringify(rows.filter((r) => r.id))} />
      {rows.length === 0 ? <p className="text-xs text-slate-500">Starts on its own — nothing it waits on.</p> : null}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            className="input !h-9 min-w-0 flex-1"
            value={r.id}
            aria-label="Waits on"
            id={i === 0 ? `${idPrefix}-pred` : undefined}
            onChange={(e) => set(i, { id: e.target.value })}
          >
            <option value="">Pick a task…</option>
            {free(r.id).map((o) => (
              <option key={o.id} value={o.id}>
                {o.phase} · {o.name}
              </option>
            ))}
          </select>
          <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
            then
            <input
              type="number"
              min={0}
              max={365}
              className="input !h-9 !w-16 text-right"
              value={r.lag}
              aria-label="Lag workdays"
              onChange={(e) => set(i, { lag: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
            workdays
          </label>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Remove"
            onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {free().length ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          onClick={() => setRows((cur) => [...cur, { id: "", lag: 0 }])}
        >
          <Plus className="h-3.5 w-3.5" /> {rows.length ? "Also waits on…" : "Waits on…"}
        </button>
      ) : null}
    </div>
  );
}
