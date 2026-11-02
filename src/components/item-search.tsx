"use client";

import { useState } from "react";
import { cn, money } from "@/lib/utils";

export type ItemSearchOption = { id: string; name: string; category?: string | null; unit: string; unitCost: number; sku?: string | null };

/**
 * A box that finds an Item List item as you type — one short line per item (name, then
 * its price), about ten showing before the list scrolls. You can also type a name that
 * isn't on the list. ↑ ↓ move, Enter picks, Esc closes. Enter with the list closed
 * goes to `onEnter` (or submits the form, when there's no onEnter).
 */
export function ItemSearch({
  id,
  name,
  value,
  onChange,
  items,
  placeholder = "Find in the Item List or type a new one",
  label = "Item",
  autoFocus,
  required,
  onEnter,
  className,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (name: string) => void;
  items: ItemSearchOption[];
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  required?: boolean;
  onEnter?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const q = value.trim().toLowerCase();
  const hits = (
    words.length
      ? items.filter((i) => {
          const text = `${i.name} ${i.sku ?? ""} ${i.category ?? ""}`.toLowerCase();
          return words.every((w) => text.includes(w));
        })
      : items
  )
    // Names that start with what you typed come first.
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
    .slice(0, 60);
  // Nothing to show once the box holds exactly one item's name.
  const exact = hits.length === 1 && hits[0].name.toLowerCase() === q;
  const shown = open && hits.length > 0 && !exact;
  const listId = `${id ?? name ?? "item"}-list`;
  const pick = (n: string) => {
    onChange(n);
    setOpen(false);
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <input
        id={id}
        name={name}
        value={value}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-label={label}
        aria-expanded={shown}
        aria-controls={listId}
        placeholder={placeholder}
        className="input w-full"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setAt(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            if (hits.length) setAt((i) => (i + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
          } else if (e.key === "Enter") {
            if (shown) {
              e.preventDefault();
              pick(hits[Math.min(at, hits.length - 1)].name);
            } else if (onEnter) {
              e.preventDefault();
              onEnter();
            }
          }
        }}
      />
      {shown ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 min-w-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg">
          {hits.map((i, k) => (
            <li
              key={i.id}
              role="option"
              aria-selected={k === at}
              title={[i.category, i.sku].filter(Boolean).join(" · ") || undefined}
              // Keep the box's focus until the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAt(k)}
              onClick={() => pick(i.name)}
              className={cn("flex cursor-pointer items-center gap-2 px-2.5 py-1", k === at ? "bg-blue-600 text-white" : "text-slate-800")}
            >
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className={cn("shrink-0 tabular-nums", k === at ? "text-blue-100" : "text-slate-400")}>
                {money(i.unitCost)}/{i.unit}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
