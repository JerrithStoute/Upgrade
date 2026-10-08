"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { CardDef } from "@/lib/dashboard-cards";
import { saveDashboardCards } from "./actions";

const SIZE: Record<string, string> = { full: "Full width", wide: "Wide", narrow: "Narrow" };

/**
 * "Customize": a panel over the page (nothing below it moves) to pick your dashboard's cards —
 * tick them on or off, drag them into order — or go back to the default.
 */
export function CustomizeDashboard({ cards, picked }: { cards: CardDef[]; picked: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<string[]>(picked);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const byKey = new Map(cards.map((c) => [c.key, c]));
  const off = cards.filter((c) => !on.includes(c.key));
  const close = () => {
    setOpen(false);
    setOn(picked);
  };
  const save = (keys: string[] | null) =>
    start(async () => {
      await saveDashboardCards(keys);
      setOpen(false);
      router.refresh();
    });
  const moveTo = (key: string, target: string) => {
    if (key === target) return;
    setOn((cur) => {
      const rest = cur.filter((k) => k !== key);
      const at = rest.indexOf(target);
      const from = cur.indexOf(key);
      const to = cur.indexOf(target);
      // Dragged down: lands below the target; dragged up: above it.
      rest.splice(from < to ? at + 1 : at, 0, key);
      return rest;
    });
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => (setOn(picked), setOpen(true))}>
        <LayoutGrid className="h-4 w-4" /> Customize
      </Button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={close} aria-hidden />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl" aria-label="Customize dashboard">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Your dashboard</h2>
                <p className="text-xs text-slate-500">Tick the cards you want. Drag to put them in order.</p>
              </div>
              <button type="button" onClick={close} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <ul className="space-y-1.5">
                {on.map((k, i) => {
                  const c = byKey.get(k);
                  if (!c) return null;
                  return (
                    <li
                      key={k}
                      draggable
                      onDragStart={(e) => {
                        setDrag(k);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        if (!drag) return;
                        e.preventDefault();
                        setOver(k);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag) moveTo(drag, k);
                        setDrag(null);
                        setOver(null);
                      }}
                      onDragEnd={() => (setDrag(null), setOver(null))}
                      className={cn(
                        "flex cursor-grab items-start gap-2 rounded-lg border bg-white px-2 py-2 active:cursor-grabbing",
                        drag === k ? "opacity-40" : "",
                        over === k && drag !== k ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200",
                      )}
                    >
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="w-5 shrink-0 pt-0.5 text-right text-xs text-slate-400">{i + 1}</span>
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                        <input type="checkbox" checked onChange={() => setOn((cur) => cur.filter((x) => x !== k))} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-900">{c.title}</span>
                          <span className="block text-xs text-slate-500">
                            {c.description} · {SIZE[c.size]}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {on.length === 0 ? <p className="text-sm text-slate-500">No cards — tick some below.</p> : null}
              {off.length ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">More cards</p>
                  {off.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-dashed border-slate-300 px-2 py-2 pl-[2.4rem] hover:bg-slate-50">
                      <input type="checkbox" checked={false} onChange={() => setOn((cur) => [...cur, c.key])} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-700">{c.title}</span>
                        <span className="block text-xs text-slate-500">
                          {c.description} · {SIZE[c.size]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => save(null)}>
                Reset to default
              </Button>
              <Button type="button" className="ml-auto" disabled={saving} onClick={() => save(on)}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
