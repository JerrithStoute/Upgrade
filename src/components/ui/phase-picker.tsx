"use client";

import { useState } from "react";
import { SCHEDULE_PHASES } from "@/lib/constants";

const NEW = "__new__";

/**
 * A schedule phase: a dropdown of every phase (yours included), or "New phase…" to type one.
 */
export function PhasePicker({ value, onChange, extra = [], className }: { value: string; onChange: (phase: string) => void; extra?: string[]; className?: string }) {
  const known = Array.from(new Set([...SCHEDULE_PHASES, ...extra.filter((p) => p.trim())]));
  const [typing, setTyping] = useState(!!value && !known.includes(value));
  if (typing)
    return (
      <span className="flex items-center gap-1">
        <input className={className} value={value} autoFocus placeholder="New phase" aria-label="Phase" onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="shrink-0 text-xs text-blue-700 hover:underline" onClick={() => setTyping(false)}>
          List
        </button>
      </span>
    );
  return (
    <select
      className={className}
      value={known.includes(value) ? value : ""}
      aria-label="Phase"
      onChange={(e) => {
        if (e.target.value === NEW) {
          setTyping(true);
          onChange("");
        } else onChange(e.target.value);
      }}
    >
      {!known.includes(value) ? <option value="">Pick a phase…</option> : null}
      {known.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      <option value={NEW}>New phase…</option>
    </select>
  );
}
