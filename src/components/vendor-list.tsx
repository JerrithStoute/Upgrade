"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronRight, Printer } from "lucide-react";
import { cn, num } from "@/lib/utils";

export type VendorItem = { key: string; name: string; sku: string | null; qty: number | null; unit: string };
export type VendorGroup = { category: string; items: VendorItem[] };

type Picks = { cats: string[]; off: string[]; vendor: string; note: string; priceColumn: boolean };
const EMPTY: Picks = { cats: [], off: [], vendor: "", note: "", priceColumn: true };

// What you picked last time (per list), so "framing package" is one click next time.
const store = new Map<string, Picks>();
const listeners = new Set<() => void>();
function read(key: string): Picks {
  if (!store.has(key)) {
    let saved = EMPTY;
    try {
      const raw = localStorage.getItem(key);
      if (raw) saved = { ...EMPTY, ...(JSON.parse(raw) as Partial<Picks>) };
    } catch {
      /* storage blocked or bad data: start fresh */
    }
    store.set(key, saved);
  }
  return store.get(key)!;
}
function write(key: string, p: Picks) {
  store.set(key, p);
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    /* storage blocked: just this visit */
  }
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Pick categories (and items within them) to send a vendor — no prices. The left
 * side picks; the right side is the sheet that prints (or saves as PDF): your
 * company, the job and delivery address, the vendor, a note, and the items with
 * quantities, plus an empty price column for the vendor to fill in.
 */
export function VendorList({
  storageKey,
  title,
  from,
  about,
  groups,
  emptyText,
  logoUrl = null,
}: {
  /** Where the picks are remembered (per job, or one for the Item List). */
  storageKey: string;
  /** "Material list" / "Price request". */
  title: string;
  /** Your company: name, then address / phone lines. */
  from: string[];
  /** The job (number, name, delivery address) — or nothing for the Item List. */
  about?: string[];
  groups: VendorGroup[];
  emptyText: string;
  /** Your logo, top right of the sheet. */
  logoUrl?: string | null;
}) {
  const picks = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => EMPTY,
  );
  const set = (p: Partial<Picks>) => write(storageKey, { ...picks, ...p });
  const [openCat, setOpenCat] = useState<string | null>(null);
  const hasQty = groups.some((g) => g.items.some((i) => i.qty != null));

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chosen = groups
    .filter((g) => picks.cats.includes(g.category))
    .map((g) => ({ ...g, items: g.items.filter((i) => !picks.off.includes(i.key)) }))
    .filter((g) => g.items.length);
  const count = chosen.reduce((n, g) => n + g.items.length, 0);
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      {/* Picking — not printed */}
      <div className="no-print space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What to send</p>
          {groups.length === 0 ? <p className="mt-2 text-sm text-slate-500">{emptyText}</p> : null}
          <div className="mt-1 flex gap-2 text-xs">
            <button type="button" className="text-blue-700 hover:underline" onClick={() => set({ cats: groups.map((g) => g.category), off: [] })}>
              All
            </button>
            <button type="button" className="text-blue-700 hover:underline" onClick={() => set({ cats: [], off: [] })}>
              None
            </button>
          </div>
          <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {groups.map((g) => {
              const on = picks.cats.includes(g.category);
              const left = g.items.filter((i) => !picks.off.includes(i.key)).length;
              return (
                <li key={g.category}>
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Send ${g.category}`}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={on}
                      onChange={() => set({ cats: toggle(picks.cats, g.category) })}
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm"
                      onClick={() => setOpenCat(openCat === g.category ? null : g.category)}
                    >
                      <span className="truncate font-medium text-slate-800">{g.category}</span>
                      <span className="shrink-0 text-xs text-slate-500">{on && left !== g.items.length ? `${left} of ${g.items.length}` : g.items.length}</span>
                      <ChevronRight className={cn("ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", openCat === g.category && "rotate-90")} />
                    </button>
                  </div>
                  {openCat === g.category ? (
                    <ul className="space-y-0.5 bg-slate-50 px-2.5 py-1.5 pl-8">
                      {g.items.map((i) => (
                        <li key={i.key}>
                          <label className={cn("flex items-center gap-2 text-xs", on ? "text-slate-700" : "text-slate-400")}>
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300"
                              disabled={!on}
                              checked={on && !picks.off.includes(i.key)}
                              onChange={() => set({ off: toggle(picks.off, i.key) })}
                            />
                            <span className="min-w-0 flex-1 truncate">{i.name}</span>
                            {i.qty != null ? (
                              <span className="shrink-0 tabular-nums">
                                {num(i.qty)} {i.unit}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
        <label className="block text-xs text-slate-600">
          Vendor
          <input className="input mt-0.5" value={picks.vendor} onChange={(e) => set({ vendor: e.target.value })} placeholder="ABC Lumber — Mike" />
        </label>
        <label className="block text-xs text-slate-600">
          Note
          <textarea className="input mt-0.5" rows={2} value={picks.note} onChange={(e) => set({ note: e.target.value })} placeholder="Please quote. Deliver Friday AM." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={picks.priceColumn} onChange={(e) => set({ priceColumn: e.target.checked })} />
          Blank price column for the vendor to fill in
        </label>
        <button
          type="button"
          disabled={!count}
          onClick={() => window.print()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF ({count} item{count === 1 ? "" : "s"})
        </button>
        <p className="text-xs text-slate-500">In the print window, choose &ldquo;Save as PDF&rdquo; to attach it to an email. Prices are never on this sheet.</p>
      </div>

      {/* The sheet — this is what prints */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">{title}</p>
            <p className="text-sm text-slate-500">{today}</p>
            {picks.vendor ? (
              <p className="mt-1 text-sm text-slate-800">
                To: <strong>{picks.vendor}</strong>
              </p>
            ) : null}
          </div>
          <div className="text-right text-sm text-slate-700">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company logo" className="mb-1 ml-auto max-h-14 max-w-[14rem] object-contain" />
            ) : null}
            {from.map((l, i) => (
              <p key={i} className={i === 0 ? "font-semibold text-slate-900" : ""}>
                {l}
              </p>
            ))}
          </div>
        </div>
        {about?.length ? (
          <div className="border-b border-slate-200 py-2 text-sm text-slate-700">
            {about.map((l, i) => (
              <p key={i} className={i === 0 ? "font-medium text-slate-900" : ""}>
                {l}
              </p>
            ))}
          </div>
        ) : null}
        {picks.note ? <p className="whitespace-pre-wrap border-b border-slate-200 py-2 text-sm text-slate-800">{picks.note}</p> : null}

        {count === 0 ? (
          <p className="no-print py-10 text-center text-sm text-slate-500">Tick a category on the left to put it on the sheet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-300">
                <th className="py-1.5 pr-2 font-medium">Item</th>
                <th className="py-1.5 pr-2 font-medium">SKU</th>
                {hasQty ? <th className="py-1.5 pr-2 text-right font-medium">Qty</th> : null}
                <th className="py-1.5 pr-2 font-medium">Unit</th>
                {picks.priceColumn ? <th className="w-28 py-1.5 font-medium">Price</th> : null}
              </tr>
            </thead>
            {chosen.map((g) => (
              // A long category flows onto the next page; only its heading stays with its first rows.
              <tbody key={g.category}>
                <tr className="break-after-avoid">
                  <td colSpan={5} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {g.category}
                  </td>
                </tr>
                {g.items.map((i) => (
                  <tr key={i.key} className="break-inside-avoid border-b border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-900">{i.name}</td>
                    <td className="py-1.5 pr-2 text-xs text-slate-500">{i.sku ?? ""}</td>
                    {hasQty ? <td className="py-1.5 pr-2 text-right tabular-nums font-medium text-slate-900">{i.qty != null ? num(i.qty) : ""}</td> : null}
                    <td className="py-1.5 pr-2 text-slate-600">{i.unit}</td>
                    {picks.priceColumn ? (
                      <td className="py-1.5">
                        <span className="block border-b border-slate-300">&nbsp;</span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
        {count ? (
          <p className="mt-3 text-xs text-slate-500">
            {count} item{count === 1 ? "" : "s"}
            {hasQty ? " · quantities include waste" : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
