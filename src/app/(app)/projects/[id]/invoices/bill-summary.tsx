"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "invoices.billBreakdown";

/**
 * What you can bill, folded to one line of totals so the invoices stay near the top; Show
 * breakdown opens the full table (children). Open or closed is remembered on this computer.
 */
export function BillSummary({ total, billed, left, due, waiting, over, children }: { total: string; billed: string; left: string; due: string; waiting: number; over: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount (not on the server)
      if (localStorage.getItem(KEY) === "1") setOpen(true);
    } catch {
      /* storage blocked: folded */
    }
  }, []);
  const flip = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(KEY, o ? "0" : "1");
      } catch {
        /* storage blocked */
      }
      return !o;
    });
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={flip} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-left text-sm">
        <span className="font-semibold text-slate-900">What you can bill</span>
        <span>
          <span className="text-slate-500">Total</span> <span className="tabular-nums text-slate-900">{total}</span>
        </span>
        <span>
          <span className="text-slate-500">Billed</span> <span className="tabular-nums text-slate-900">{billed}</span>
        </span>
        <span>
          <span className="text-slate-500">Left</span> <span className={cn("font-semibold tabular-nums", over ? "text-rose-700" : "text-slate-900")}>{left}</span>
        </span>
        <span>
          <span className="text-slate-500">Due</span> <span className="tabular-nums text-amber-700">{due}</span>
        </span>
        {waiting ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">{waiting} not counted yet</span> : null}
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-700">
          {open ? "Hide breakdown" : "Show breakdown"} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? <div className="border-t border-slate-100">{children}</div> : null}
    </section>
  );
}
