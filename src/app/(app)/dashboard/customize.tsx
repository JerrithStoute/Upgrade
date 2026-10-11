"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { CardDef } from "@/lib/dashboard-cards";
import { saveDashboardCards } from "./actions";

/**
 * "Customize": a panel over the page (nothing below it moves) to turn cards on and off — or go
 * back to the default. Moving them is done on the Dashboard itself, by dragging.
 */
export function CustomizeDashboard({ cards, picked }: { cards: CardDef[]; picked: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState<string[]>(picked);
  const [saving, start] = useTransition();
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
                <p className="text-xs text-slate-500">Tick the cards you want. To move one, drag it by its grip on the Dashboard.</p>
              </div>
              <button type="button" onClick={close} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="flex-1 space-y-1.5 overflow-y-auto px-5 py-4">
              {cards.map((c) => {
                const checked = on.includes(c.key);
                return (
                  <li key={c.key}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setOn((cur) => (checked ? cur.filter((x) => x !== c.key) : [...cur, c.key]))}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">{c.title}</span>
                        <span className="block text-xs text-slate-500">{c.description}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
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
