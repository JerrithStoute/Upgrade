"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { UnitInput } from "@/components/ui/unit-input";
import { cn, money } from "@/lib/utils";
import { carryToClosing, futureDrawInterest, offerMath, priceForProfit, type CarryState, type ClosingLine, type Sheet } from "@/lib/spec-math";
import { saveOffer } from "../actions";

/** The house's net sheet as the page hands it over (dates as text). */
export type SheetProps = Omit<Sheet, "hoaPaidThrough" | "repairs" | "titleQuote"> & { hoaPaidThrough: string | null; lines: ClosingLine[] };

type Props = {
  projectId: string;
  build: number;
  toFinish: number;
  loanRate: number | null;
  carrying: CarryState[];
  perDay: number;
  stop: string | null;
  listPrice: number | null;
  sheet: SheetProps;
  closingDefault: string;
  today: string;
};

const parse = (v: string) => {
  const n = Number(v.replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

/**
 * The offer calculator: type the offer and everything works out as you type — every closing
 * cost and proration, what you'd walk away with, your cost to that closing date, profit, and
 * what to counter at.
 */
export function OfferCalculator(p: Props) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [buyer, setBuyer] = useState("");
  const [closing, setClosing] = useState(p.closingDefault);
  const [concessions, setConcessions] = useState(String(p.sheet.concessions || ""));
  const [buyerPct, setBuyerPct] = useState(String(p.sheet.buyerPct));
  const [repairs, setRepairs] = useState("");
  const [titleQuote, setTitleQuote] = useState("");
  const [draws, setDraws] = useState(p.toFinish > 0 && !!p.loanRate);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [saving, start] = useTransition();
  const hasTitle = p.sheet.lines.some((l) => l.title);

  const r = useMemo(() => {
    const closeDate = closing ? new Date(`${closing}T12:00:00`) : new Date();
    const carry = carryToClosing(p.carrying, closeDate, p.stop);
    const drawInterest = draws && p.loanRate ? futureDrawInterest(p.toFinish, p.loanRate, new Date(`${p.today}T12:00:00`), closeDate) : 0;
    const cost = p.build + carry + drawInterest;
    const sheet: Sheet = {
      ...p.sheet,
      buyerPct: parse(buyerPct),
      concessions: parse(concessions),
      repairs: parse(repairs),
      hoaPaidThrough: p.sheet.hoaPaidThrough ? new Date(p.sheet.hoaPaidThrough) : null,
      titleQuote: titleQuote.trim() ? parse(titleQuote) : null,
    };
    const offer = offerMath(parse(price), sheet, closeDate, cost);
    const atList = p.listPrice ? offerMath(p.listPrice, sheet, closeDate, cost) : null;
    return {
      carry,
      drawInterest,
      cost,
      offer,
      atList,
      breakEven: priceForProfit(0, sheet, closeDate, cost),
      counter: target ? priceForProfit(parse(target), sheet, closeDate, cost) : null,
    };
  }, [price, closing, concessions, buyerPct, repairs, titleQuote, draws, target, p]);

  const has = parse(price) > 0;
  const row = (label: string, value: React.ReactNode, cls?: string) => (
    <div key={label} className={cn("flex justify-between gap-3 py-1", cls)}>
      <span className="text-slate-600">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
  const closeLabel = closing ? new Date(`${closing}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "closing";

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <UnitInput label="Offer price" prefix="$" width="w-52" big autoFocus value={price} onChange={setPrice} />
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="space-y-1">
            <span className="label">Closing date</span>
            <input type="date" className="input !w-40" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </label>
          <UnitInput label="Buyer's agent" suffix="%" width="w-20" value={buyerPct} onChange={setBuyerPct} />
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <UnitInput label="Concessions" prefix="$" width="w-28" placeholder="0" value={concessions} onChange={setConcessions} />
          <UnitInput label="Repairs" prefix="$" width="w-28" placeholder="0" value={repairs} onChange={setRepairs} />
          {hasTitle ? <UnitInput label="Title quote" prefix="$" width="w-28" placeholder="uses %" value={titleQuote} onChange={setTitleQuote} /> : null}
        </div>
        {p.toFinish > 0 && p.loanRate ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draws} onChange={(e) => setDraws(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span>
              Count interest on the draws still to come
              <span className="block text-xs text-slate-500">
                {money(p.toFinish, true)} left to finish, drawn evenly until closing at {p.loanRate}%
              </span>
            </span>
          </label>
        ) : null}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="w-40 space-y-1">
            <span className="label">Buyer (optional)</span>
            <input className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Name or agent" />
          </label>
          <label className="w-56 max-w-full space-y-1">
            <span className="label">Note (optional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. FHA, close by Dec 20" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!has || saving}
            onClick={() =>
              start(async () => {
                const res = await saveOffer(p.projectId, {
                  buyer,
                  price: parse(price),
                  closingDate: closing,
                  concessions: parse(concessions),
                  buyerPct: parse(buyerPct),
                  repairs: parse(repairs),
                  profit: r.offer.profit,
                  note,
                });
                if (!res.ok) setMsg({ text: res.error, bad: true });
                else {
                  setMsg({ text: "Saved to this house's offers." });
                  router.refresh();
                }
              })
            }
          >
            {saving ? "Saving…" : "Save offer"}
          </Button>
          <Link href={`/projects/${p.projectId}/spec#offers`} className="text-sm text-blue-700 hover:underline">
            Offers so far
          </Link>
        </div>
        <p className={cn("min-h-5 text-sm", msg?.bad ? "text-rose-700" : "text-emerald-700")}>{msg?.text ?? ""}</p>
      </div>

      <div className="space-y-4">
        <div
          className={cn("rounded-xl border p-5", !has ? "border-slate-200 bg-slate-50" : r.offer.profit >= 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")}
        >
          <p className="text-sm text-slate-600">Profit on this offer</p>
          <p className={cn("text-4xl font-bold tabular-nums", !has ? "text-slate-300" : r.offer.profit >= 0 ? "text-emerald-700" : "text-rose-700")}>
            {has ? money(r.offer.profit, true) : "$—"}
          </p>
          <p className="text-sm text-slate-600">
            {has ? `${pct(r.offer.margin)} of the price` : "Type an offer"}
            {has && r.atList ? ` · ${money(r.offer.profit - r.atList.profit, true)} vs. full list price` : ""}
          </p>
        </div>

        <div className="grid gap-4 2xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <p className="mb-1 font-semibold text-slate-900">The net sheet</p>
            {row("Offer", has ? money(parse(price)) : "—")}
            {(has ? r.offer.lines : []).map((l) => row(l.label, l.amount < 0 ? `+ ${money(-l.amount)}` : `− ${money(l.amount)}`, l.amount < 0 ? "text-emerald-700" : undefined))}
            {row("You walk away with", has ? money(r.offer.net) : "—", "border-t border-slate-100 font-semibold text-slate-900")}
            {row("The house (land, building, finish)", `− ${money(p.build)}`)}
            {row(`Carrying costs to ${closeLabel}`, `− ${money(r.carry)}`)}
            {r.drawInterest ? row("Interest on draws still to come", `− ${money(r.drawInterest)}`) : null}
            {row("Profit", has ? money(r.offer.profit) : "—", cn("border-t border-slate-100 font-semibold", has && r.offer.profit < 0 ? "text-rose-700" : "text-slate-900"))}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="mb-1 font-semibold text-slate-900">What to counter at</p>
              <UnitInput label="To make" prefix="$" width="w-32" placeholder="profit" value={target} onChange={setTarget} />
              <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">{r.counter ? `Counter at ${money(Math.ceil(r.counter / 100) * 100, true)}` : "—"}</p>
              <p className="text-xs text-slate-500">Same closing date, concessions and repairs — commissions and title grow with the price.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              {row("Break-even price", r.breakEven ? money(Math.ceil(r.breakEven), true) : "—", "font-medium")}
              {p.listPrice ? row(`Profit at list (${money(p.listPrice, true)})`, r.atList ? money(r.atList.profit, true) : "—") : null}
              {row("Carrying costs a day", money(p.perDay))}
              {row("Each 30 days it doesn't close", `− ${money(p.perDay * 30, true)}`, "text-rose-700")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
