"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff } from "lucide-react";
import { cn, money } from "@/lib/utils";
import { pinItemPrice, setMaterialPrice } from "../actions";

/**
 * A Material list price you can change. On an unlocked job it's the Item List price
 * (every unlocked job gets it) unless pinned to "this job only"; on a locked job it's
 * this job's price. Saves when you leave the box (Enter too); Esc puts it back.
 */
export function PriceCell({
  projectId,
  materialItemId,
  name,
  unit,
  price,
  pinned,
  locked,
}: {
  projectId: string;
  materialItemId: string;
  name: string;
  unit: string;
  price: number;
  pinned: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const original = (Math.round(price * 100) / 100).toFixed(2);
  const save = (raw: string) => {
    setText(null);
    const n = Number(raw.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return setErr("Enter a price");
    if (Math.abs(n - price) < 0.00005) return setErr(null);
    start(async () => {
      const r = await setMaterialPrice(projectId, materialItemId, raw, pinned);
      setErr(r.ok ? null : r.error);
      router.refresh();
    });
  };
  const where = locked ? "this job" : pinned ? "this job only" : "the Item List — every job that isn't locked";
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {/* The printout shows the price, not the box. */}
      <span className="hidden tabular-nums print:inline">{money(price)}</span>
      <input
        inputMode="decimal"
        aria-label={`Price for ${name}`}
        title={err ?? `Per ${unit} — saving changes it for ${where}`}
        disabled={busy}
        className={cn(
          "h-7 w-24 rounded border border-transparent bg-transparent px-1.5 text-right tabular-nums hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none print:hidden",
          !(price > 0) && text === null && "font-semibold text-amber-700",
          err && "border-rose-400 bg-rose-50",
        )}
        value={text ?? (price > 0 ? money(price) : "No price")}
        onFocus={(e) => {
          setText(price > 0 ? original : "");
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => save(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(null);
            setErr(null);
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
          }
        }}
      />
      {locked ? (
        <span className="w-6 print:hidden" />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              await pinItemPrice(projectId, materialItemId, !pinned);
              router.refresh();
            })
          }
          className={cn("rounded p-1 print:hidden", pinned ? "text-violet-700 hover:bg-violet-50" : "text-slate-300 hover:bg-slate-100 hover:text-slate-600")}
          aria-label={pinned ? `${name}: this job only — click to follow the Item List again` : `${name}: keep this job's price (this job only)`}
          title={pinned ? "This job only — click to follow the Item List again" : "Keep this job's price when the Item List changes (this job only)"}
        >
          {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  );
}
