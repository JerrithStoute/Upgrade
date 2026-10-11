"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A card's list: the first few items, and "Show all" to open the rest right there. */
export function MoreList({ items, show = 4, className }: { items: React.ReactNode[]; show?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const extra = items.length - show;
  return (
    <>
      <ul className={cn("divide-y divide-slate-100", className)}>{open || extra <= 0 ? items : items.slice(0, show)}</ul>
      {extra > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-1 border-t border-slate-100 px-4 py-1.5 text-xs font-medium text-blue-700 hover:bg-slate-50"
          aria-expanded={open}
        >
          {open ? "Show fewer" : `Show all ${items.length}`}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      ) : null}
    </>
  );
}
