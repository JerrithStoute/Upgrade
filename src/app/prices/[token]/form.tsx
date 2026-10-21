"use client";

import { useActionState, useState } from "react";
import { submitBidPrices, type PricesState } from "../actions";

type Line = { id: string; name: string; unit: string; quantity: number; ladder: boolean; price: number | null; substitute: string | null };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
const num = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/** A price box on every line (and "offering something else?"), totals as you type, then Send. */
export function PricesForm({ token, lines, company }: { token: string; lines: Line[]; company: string }) {
  const [state, action, pending] = useActionState<PricesState, FormData>(submitBidPrices, undefined);
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, l.price != null ? String(l.price) : ""])));
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(lines.filter((l) => l.substitute).map((l) => [l.id, true])));
  const items = lines.filter((l) => !l.ladder);
  const ladder = lines.filter((l) => l.ladder);
  const total = items.reduce((s, l) => s + (num(prices[l.id] ?? "") ?? 0) * l.quantity, 0);
  const priced = items.filter((l) => num(prices[l.id] ?? "") != null).length;
  const priceBox = (l: Line) => (
    <input
      name={`price_${l.id}`}
      inputMode="decimal"
      className="input !w-28 text-right"
      placeholder="$0.00"
      aria-label={`Price for ${l.name}`}
      value={prices[l.id] ?? ""}
      onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
    />
  );
  return (
    <form action={action} className="mt-5 space-y-5">
      <input type="hidden" name="t" value={token} />
      <p className="text-sm text-slate-600">Type your price per unit on each line (leave a line blank if you don&apos;t carry it), then press Send at the bottom.</p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {items.map((l) => {
          const p = num(prices[l.id] ?? "");
          return (
            <div key={l.id} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-24 shrink-0 text-sm text-slate-600 tabular-nums">
                  {qty(l.quantity)} {l.unit}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">{l.name}</span>
                <span className="flex items-center gap-2">
                  {priceBox(l)}
                  <span className="w-24 text-right text-sm text-slate-500 tabular-nums">{p != null ? money(p * l.quantity) : ""}</span>
                </span>
              </div>
              {subOpen[l.id] ? (
                <input
                  name={`sub_${l.id}`}
                  defaultValue={l.substitute ?? ""}
                  className="input mt-1.5 text-sm"
                  placeholder="What you'd send instead (the price above is for this)"
                  aria-label={`Instead of ${l.name}`}
                />
              ) : (
                <button type="button" className="mt-1 text-xs text-blue-700 hover:underline" onClick={() => setSubOpen((s) => ({ ...s, [l.id]: true }))}>
                  Offering something else?
                </button>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between bg-slate-50 px-3 py-2.5 text-sm">
          <span className="text-slate-600">
            {priced} of {items.length} priced
          </span>
          <span className="font-semibold text-slate-900 tabular-nums">Total {money(total)}</span>
        </div>
      </div>
      {ladder.length ? (
        <div>
          <p className="text-sm font-medium text-slate-900">Other lengths — a price per board</p>
          <p className="text-xs text-slate-500">So {company} can order the lengths that cost least. Optional.</p>
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {ladder.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-slate-800">{l.name}</span>
                {priceBox(l)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <label className="block">
        <span className="label">A note for {company} (optional)</span>
        <textarea name="message" rows={3} className="input" placeholder="Delivery time, prices good through…" />
      </label>
      {state?.error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p> : null}
      {state?.ok ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 sm:w-auto">
        {pending ? "Sending…" : state?.ok ? "Send again" : "Send my prices"}
      </button>
    </form>
  );
}
