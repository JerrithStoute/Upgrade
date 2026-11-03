"use client";

import { useState } from "react";

/**
 * A cost code pick for a form, ending with "+ New cost code…": picking that opens a box for its
 * name, and it's added to your cost codes when the form is saved (`${name}New`).
 */
export function CodePick({ name, label, codes, value }: { name: string; label: string; codes: { id: string; label: string }[]; value: string | null }) {
  const [v, setV] = useState(value ?? "");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select name={name} className="input !h-8 !w-64 !py-0 text-sm" value={v} onChange={(e) => setV(e.target.value)} aria-label={label}>
        <option value="">None</option>
        {codes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
        <option value="__new">+ New cost code…</option>
      </select>
      {v === "__new" ? (
        <>
          <input name={`${name}NewCode`} className="input !h-8 !w-24 !py-0 text-sm" placeholder="Code" aria-label="New cost code number" />
          <input name={`${name}NewName`} required autoFocus className="input !h-8 !w-48 !py-0 text-sm" placeholder="Name, e.g. Contract" aria-label="New cost code name" />
        </>
      ) : null}
    </div>
  );
}
