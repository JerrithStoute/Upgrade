"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Colors for schedule bars and the like: one click each. */
export const SWATCHES = ["#2563eb", "#0891b2", "#059669", "#65a30d", "#d97706", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#92400e", "#78716c", "#475569"];

/**
 * A color, picked from a row of swatches (or any color under "More…"). A button showing the
 * color opens it. Controlled (`value` + `onChange`) or, in a plain form, by `name` + `defaultValue`.
 */
export function ColorSwatches({
  name,
  value,
  defaultValue = SWATCHES[0],
  onChange,
  label = "Color",
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (color: string) => void;
  label?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const color = value ?? own;
  // Open: where the swatches show (fixed on the page, so a scrolling table can't clip them).
  const [open, setOpen] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const pick = (c: string) => {
    setOwn(c);
    onChange?.(c);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const close = () => setOpen(null);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-flex">
      {name ? <input type="hidden" name={name} value={color} /> : null}
      <button
        type="button"
        onClick={(e) => {
          if (open) return setOpen(null);
          const r = e.currentTarget.getBoundingClientRect();
          setOpen({ top: Math.min(r.bottom + 4, window.innerHeight - 140), left: Math.min(r.left, window.innerWidth - 230) });
        }}
        aria-label={label}
        aria-expanded={!!open}
        title={label}
        className="h-8 w-8 shrink-0 rounded-md border border-slate-300 p-1 hover:border-slate-400"
      >
        <span className="block h-full w-full rounded" style={{ background: color }} />
      </button>
      {open ? (
        // Floats over what's below, so nothing moves.
        <span className="fixed z-50 w-[13.5rem] rounded-lg border border-slate-200 bg-white p-2 shadow-xl" style={{ top: open.top, left: open.left }}>
          <span className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  pick(c);
                  setOpen(null);
                }}
                className={cn("grid h-7 w-7 place-items-center rounded-md ring-offset-1 hover:ring-2 hover:ring-slate-300", color.toLowerCase() === c && "ring-2 ring-slate-900")}
                style={{ background: c }}
                aria-label={c}
              >
                {color.toLowerCase() === c ? <Check className="h-4 w-4 text-white" /> : null}
              </button>
            ))}
          </span>
          <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
            <input type="color" value={color} onChange={(e) => pick(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-slate-300 p-0" />
            More colors…
          </label>
        </span>
      ) : null}
    </span>
  );
}
