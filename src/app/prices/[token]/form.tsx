"use client";

import { useActionState, useState } from "react";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitBidPrices, type PricesState } from "../actions";

type Line = { id: string; name: string; unit: string; quantity: number; ladder: boolean; price: number | null; substitute: string | null };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
const num = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Their note first; then one short row per item — quantity, item, price box, line total — like a price
 * sheet, with "Sub" on the row to offer something else; the total and Send pinned to the bottom of the screen.
 */
export function PricesForm({ token, lines, company, attached }: { token: string; lines: Line[]; company: string; attached: boolean }) {
  const [state, action, pending] = useActionState<PricesState, FormData>(submitBidPrices, undefined);
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, l.price != null ? String(l.price) : ""])));
  const [quote, setQuote] = useState<string | null>(null);
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(lines.filter((l) => l.substitute).map((l) => [l.id, true])));
  const items = lines.filter((l) => !l.ladder);
  const ladder = lines.filter((l) => l.ladder);
  const total = items.reduce((s, l) => s + (num(prices[l.id] ?? "") ?? 0) * l.quantity, 0);
  const priced = items.filter((l) => num(prices[l.id] ?? "") != null).length;
  const priceBox = (l: Line) => (
    <input
      name={`price_${l.id}`}
      inputMode="decimal"
      className="h-8 w-20 shrink-0 rounded-md border border-slate-300 px-2 text-right text-sm tabular-nums focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
      placeholder="$"
      aria-label={`Price for ${l.name}`}
      value={prices[l.id] ?? ""}
      onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
    />
  );
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="t" value={token} />
      {/* Their note first, where it's seen. */}
      <label className="mb-3 block">
        <span className="text-xs font-medium text-slate-700">A note for {company} (optional)</span>
        <textarea name="message" rows={2} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Delivery time, prices good through, anything they should know…" />
      </label>
      <p className="mb-2 text-xs text-slate-500">Price per unit on each line — leave it blank if you don&apos;t carry it.</p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
        {items.map((l) => {
          const p = num(prices[l.id] ?? "");
          return (
            <div key={l.id} className="px-2 py-1">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                  {qty(l.quantity)} {l.unit}
                </span>
                <span className="min-w-0 flex-1 leading-tight text-slate-900">{l.name}</span>
                {priceBox(l)}
                <span className="hidden w-20 shrink-0 text-right text-xs text-slate-500 tabular-nums sm:block">{p != null ? money(p * l.quantity) : ""}</span>
                <button
                  type="button"
                  className={cn(
                    "shrink-0 rounded px-1.5 py-1 text-xs font-medium ring-1 ring-inset",
                    subOpen[l.id] ? "bg-amber-50 text-amber-800 ring-amber-300" : "text-slate-600 ring-slate-300 hover:bg-slate-50",
                  )}
                  title="Substitute: offer something else for this line"
                  aria-label={`Substitute something else for ${l.name}`}
                  onClick={() => setSubOpen((s) => ({ ...s, [l.id]: !s[l.id] }))}
                >
                  Sub
                </button>
              </div>
              {subOpen[l.id] ? (
                <input
                  name={`sub_${l.id}`}
                  defaultValue={l.substitute ?? ""}
                  className="mb-1 ml-[4.5rem] mt-1 h-8 w-[calc(100%-4.5rem)] rounded-md border border-amber-300 px-2 text-sm"
                  placeholder="Substitute: what you'd send instead (the price is for this)"
                  aria-label={`Instead of ${l.name}`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {ladder.length ? (
        <div className="mt-3">
          <p className="text-xs text-slate-500">Other lengths — a price per board (optional), so {company} can order the lengths that cost least.</p>
          <div className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {ladder.map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-2 py-1">
                <span className="min-w-0 flex-1 text-slate-800">{l.name}</span>
                {priceBox(l)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {/* Their own paperwork, sent along with the prices (or instead of typing them). */}
      <label className="mt-3 flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
        <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="font-medium text-slate-800">{quote ? quote : attached ? "Your quote is attached — attach another to replace it" : "Attach your quote (optional)"}</span>
        <span className="text-xs text-slate-500">PDF, photo or Excel · goes with your prices</span>
        <input
          type="file"
          name="quote"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,application/pdf,image/*"
          className="sr-only"
          onChange={(e) => setQuote(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      {/* The total and Send, always on screen. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-slate-500">
            {priced} of {items.length} priced
          </span>
          <span className="text-sm font-semibold text-slate-900 tabular-nums">Total {money(total)}</span>
          <button type="submit" disabled={pending} className="ml-auto rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
            {pending ? "Sending…" : state?.ok ? "Send again" : "Send my prices"}
          </button>
          {state?.error ? <p className="w-full text-sm text-rose-700">{state.error}</p> : null}
          {state?.ok ? <p className="w-full text-sm text-emerald-700">{state.ok}</p> : null}
        </div>
      </div>
    </form>
  );
}
