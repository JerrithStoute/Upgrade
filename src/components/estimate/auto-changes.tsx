"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Lock, RefreshCw, Undo2, X } from "lucide-react";
import { cn, fmtDateTime, money } from "@/lib/utils";
import type { AutoNote } from "@/lib/takeoff-changes";

/**
 * "What changed": what the takeoff updated on this draft by itself since it was last
 * saved — which lines, by how much, and why (prices, quantities, items added or gone).
 * Saving the estimate (or Dismiss) clears it; Discard on the sheet doesn't undo these.
 * Already gave the bid? "Put back what I bid & lock" undoes them (back to the last save)
 * and locks the estimate; "Keep these & lock" locks it with them.
 */
export function AutoChanges({
  note,
  canPutBack,
  onDismiss,
  onLock,
}: {
  note: AutoNote;
  /** A copy of the last save is kept (changes from before this option existed have none). */
  canPutBack: boolean;
  onDismiss: () => Promise<{ ok: true }>;
  onLock: (keep: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(note.lines.length <= 3);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const lock = (keep: boolean) => {
    const ask = keep
      ? "Lock this estimate with these takeoff changes? It won't change by itself again until you unlock it.\n\nChanges on the sheet you haven't saved are thrown away."
      : "Put this estimate back exactly as you last saved it (before these takeoff changes) and lock it?\n\nChanges on the sheet you haven't saved are thrown away too.";
    if (!window.confirm(ask)) return;
    setError(null);
    start(async () => {
      const r = await onLock(keep);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };
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
          <div className="ml-5 mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-blue-900">Already gave this bid?</span>
            {canPutBack ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => lock(false)}
                title="Undo these changes — back to the estimate as you last saved it — and lock it"
                className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" /> Put back what I bid &amp; lock
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => lock(true)}
              title="Keep these changes and lock the estimate so it doesn't change again"
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" /> Keep these &amp; lock
            </button>
            {error ? <span className="text-xs font-medium text-rose-700">{error}</span> : null}
          </div>
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
