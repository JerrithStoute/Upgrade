"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { itemNameKey, memberSizeName, parseInches, sizeTypeOf } from "@/lib/takeoff";
import { quickAddMemberSize } from "../actions";
import type { MemberSizeOption } from "./condition-form";

/**
 * "+ New size…" under a takeoff's size list: a type (pick one you use or type a new one) and
 * thickness × depth. The name is built for you ("LVL 1-3/4x24") so the list stays neat, and a
 * size you already have is offered instead of making a second one.
 */
export function NewMemberSize({ sizes, onAdded, onCancel }: { sizes: MemberSizeOption[]; onAdded: (size: MemberSizeOption) => void; onCancel: () => void }) {
  const listId = useId();
  const types = [...new Map(sizes.map((m) => sizeTypeOf(m.name)).filter((t): t is string => !!t).map((t) => [t.toLowerCase(), t])).values()];
  const [type, setType] = useState(types.find((t) => /^lvl$/i.test(t)) ?? "");
  const [thickness, setThickness] = useState("");
  const [depth, setDepth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const clean = (v: string) => v.replace(/["”″]/g, "");
  const t = parseInches(clean(thickness));
  const d = parseInches(clean(depth));
  const name = type.trim() && t && d ? memberSizeName(type, t, d) : null;
  const have = name ? sizes.find((m) => itemNameKey(m.name) === itemNameKey(name)) : undefined;
  const newType = type.trim() && !types.some((x) => x.toLowerCase() === type.trim().toLowerCase());
  const add = () => {
    if (have) return onAdded(have);
    if (!type.trim()) return setError("Pick or type a type, e.g. LVL");
    if (!t || !d) return setError("Enter the thickness and depth in inches, e.g. 1-3/4 and 24");
    start(async () => {
      setError(null);
      const r = await quickAddMemberSize({ type, thickness: clean(thickness), depth: clean(depth) });
      if (r.ok) onAdded(r.size);
      else setError(r.error);
    });
  };
  // Inside the takeoff's own form: Enter adds the size, it doesn't save the takeoff.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Escape") onCancel();
  };
  const box = "input !py-1 text-xs";
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 rounded-md border border-blue-300 bg-white p-2 text-xs text-slate-500">
      <span>Type</span>
      <div>
        <input autoFocus list={listId} aria-label="Type" className={`${box} !w-36`} value={type} placeholder="LVL" onChange={(e) => setType(e.target.value)} onKeyDown={onKey} />
        <datalist id={listId}>
          {types.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        {newType ? <span className="ml-1.5 text-[11px] text-blue-700">New type</span> : null}
      </div>
      <span>Size</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input aria-label="Thickness (in)" inputMode="decimal" className={`${box} !w-14`} value={thickness} placeholder="1-3/4" onChange={(e) => setThickness(e.target.value)} onKeyDown={onKey} />×
        <input aria-label="Depth (in)" inputMode="decimal" className={`${box} !w-14`} value={depth} placeholder="24" onChange={(e) => setDepth(e.target.value)} onKeyDown={onKey} />
        in. <span className="text-[11px] text-slate-400">thickness × depth</span>
      </div>
      <span>Name</span>
      <span className="font-medium text-slate-800">{name ?? "—"}</span>
      <span />
      {have ? (
        <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          You already have {have.name}.{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => onAdded(have)}>
            Use it
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" onClick={add} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
      {error ? <p className="col-start-2 text-[11px] text-rose-700">{error}</p> : null}
      {newType && name && !have ? <p className="col-start-2 text-[11px] text-slate-400">A new type starts as engineered, made to order — change it in Catalog → Member sizes.</p> : null}
    </div>
  );
}
