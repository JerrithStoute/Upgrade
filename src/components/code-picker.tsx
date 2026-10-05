"use client";

import { useState } from "react";
import { Search } from "lucide-react";

/**
 * Cost codes as checkboxes (name="costCode"), with a search box — for long code lists.
 * Checked ones stay listed first so you can see what's picked.
 */
export function CodePicker({ codes, picked = [], idPrefix }: { codes: { id: string; label: string }[]; picked?: string[]; idPrefix: string }) {
  const [q, setQ] = useState("");
  const [on, setOn] = useState(() => new Set(picked));
  const needle = q.trim().toLowerCase();
  const shown = codes.filter((c) => on.has(c.id) || !needle || c.label.toLowerCase().includes(needle)).sort((a, b) => Number(on.has(b.id)) - Number(on.has(a.id)));
  return (
    <div className="rounded-md border border-slate-300 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <input
          id={`${idPrefix}-search`}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Find a cost code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find a cost code"
        />
        <span className="shrink-0 text-xs text-slate-500">{on.size} picked</span>
      </div>
      <div className="max-h-56 overflow-y-auto px-2.5 py-1.5">
        {shown.map((c) => (
          <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
            <input
              type="checkbox"
              name="costCode"
              value={c.id}
              checked={on.has(c.id)}
              onChange={(e) =>
                setOn((cur) => {
                  const n = new Set(cur);
                  if (e.target.checked) n.add(c.id);
                  else n.delete(c.id);
                  return n;
                })
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            {c.label}
          </label>
        ))}
        {shown.length === 0 ? <p className="py-1 text-xs text-slate-400">No cost codes match.</p> : null}
      </div>
    </div>
  );
}
