"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { cn, fmtDateTime, money } from "@/lib/utils";
import type { AutoNote } from "@/lib/takeoff-changes";

/**
 * "What changed": what the takeoff updated on this draft by itself since it was last
 * saved — which lines, by how much, and why (prices, quantities, items added or gone).
 * Saving the estimate (or Dismiss) clears it; Discard on the sheet doesn't undo these.
 */
export function AutoChanges({ note, onDismiss }: { note: AutoNote; onDismiss: () => Promise<{ ok: true }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(note.lines.length <= 3);
  const [busy, start] = useTransition();
  const total = note.lines.reduce((n, l) => n + (l.to - l.from), 0);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
        <div className="min-w-0 flex-1">
          <button type="button" className="flex items-center gap-1 text-left font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Updated from the takeoff since you last saved: {note.lines.length} line{note.lines.length === 1 ? "" : "s"}, {signed(total)} in cost
          </button>
          <p className="ml-5 text-xs text-blue-800">
            Since {fmtDateTime(note.since)}. Prices follow the Item List until the job&apos;s prices are locked; quantities follow the takeoff.
          </p>
          {open ? (
            <ul className="ml-5 mt-2 space-y-1.5">
              {note.lines.map((l) => (
                <li key={l.key}>
                  <span className="font-medium">{l.name}</span>{" "}
                  <span className="tabular-nums text-blue-800">
                    {money(l.from)} → {money(l.to)}
                  </span>{" "}
                  <span className={cn("tabular-nums text-xs font-semibold", l.to - l.from > 0 ? "text-rose-700" : "text-emerald-700")}>({signed(l.to - l.from)})</span>
                  {l.details.length ? (
                    <ul className="ml-4 list-disc text-xs text-blue-900/80">
                      {l.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          className="rounded p-1 text-blue-700 hover:bg-blue-100"
          aria-label="Dismiss"
          title="Dismiss (the changes stay)"
          onClick={() =>
            start(async () => {
              await onDismiss();
              router.refresh();
            })
          }
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
