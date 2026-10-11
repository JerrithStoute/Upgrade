/**
 * Spec house arithmetic (no database, tested on its own): carrying costs by the day (a
 * construction loan's interest follows its draws), what a month comes to, and the seller's
 * net sheet on an offer — commissions, closing costs line by line, prorations.
 */

export type LoanMove = { kind: string; date: Date; amount: number; ratePct: number | null };

export type Carry = {
  kind: string; // INTEREST | AMOUNT
  amount: number;
  frequency: string; // MONTHLY | YEARLY | ONCE
  loanBalance: number | null; // interest: the balance before any logged draws
  ratePct: number | null;
  startDate: Date;
  endDate: Date | null;
  /** Interest: draws, paydowns and rate changes, by date. */
  moves?: LoanMove[];
};

/** A calendar day as a number (local date, no time-of-day or daylight-saving drift). */
export const dayNo = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);

/** A loan's balance and rate on a day: the starting balance plus draws less paydowns so far; the latest rate. */
export function loanOn(c: Carry, day: number) {
  let balance = c.loanBalance ?? 0;
  let rate = c.ratePct ?? 0;
  let rateDay = -Infinity;
  for (const m of c.moves ?? []) {
    const d = dayNo(m.date);
    if (d > day) continue;
    if (m.kind === "DRAW") balance += m.amount;
    else if (m.kind === "PAYDOWN") balance -= m.amount;
    else if (m.kind === "RATE" && m.ratePct != null && d >= rateDay) {
      rate = m.ratePct;
      rateDay = d;
    }
  }
  return { balance: Math.max(0, balance), rate };
}

/** What it costs a day — today, or on a given day (one-time costs: nothing a day). */
export function dailyRate(c: Carry, on: Date = new Date()) {
  if (c.kind === "INTEREST") {
    const { balance, rate } = loanOn(c, dayNo(on));
    return (balance * rate) / 100 / 365;
  }
  if (c.frequency === "MONTHLY") return (c.amount * 12) / 365;
  if (c.frequency === "YEARLY") return c.amount / 365;
  return 0;
}

/**
 * What it comes to over the days from `from` up to (not including) `to` — only the days it
 * runs (start to end, or until `stop`, e.g. sold). Interest is worked day by day on that day's
 * balance and rate. A one-time cost counts on its start day.
 */
export function accrued(c: Carry, from: Date, to: Date, stop?: Date | null) {
  const start = dayNo(c.startDate);
  const ends = [c.endDate ? dayNo(c.endDate) + 1 : Infinity, stop ? dayNo(stop) : Infinity];
  if (c.kind !== "INTEREST" && c.frequency === "ONCE") return start >= dayNo(from) && start < Math.min(dayNo(to), ...ends) ? c.amount : 0;
  const a = Math.max(start, dayNo(from));
  const b = Math.min(dayNo(to), ...ends);
  if (b <= a) return 0;
  if (c.kind !== "INTEREST" || !c.moves?.length) return (b - a) * dailyRate(c, c.startDate);
  let sum = 0;
  for (let d = a; d < b; d++) {
    const { balance, rate } = loanOn(c, d);
    sum += (balance * rate) / 100 / 365;
  }
  return sum;
}

/** "2026-10" */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Every month that's over (ended before `today`) from the cost's start — each charged once. */
export function closedMonths(c: Carry, today: Date, stop?: Date | null) {
  const out: { key: string; from: Date; to: Date }[] = [];
  const last = new Date(today.getFullYear(), today.getMonth(), 1); // months before this one are over
  const stopDay = stop ? dayNo(stop) : Infinity;
  for (let m = new Date(c.startDate.getFullYear(), c.startDate.getMonth(), 1); m < last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    if (dayNo(m) >= stopDay) break;
    if (c.endDate && m > c.endDate) break;
    out.push({ key: monthKey(m), from: m, to: new Date(m.getFullYear(), m.getMonth() + 1, 1) });
  }
  return out;
}

// --- The seller's net sheet ------------------------------------------------------------------

export type ClosingLine = { name: string; kind: "PCT" | "FLAT"; value: number; title?: boolean };

/** Closing costs a spec house starts with — typical amounts, to set to your title company's. */
export const DEFAULT_CLOSING_LINES: ClosingLine[] = [
  { name: "Owner's title policy", kind: "PCT", value: 0.6, title: true },
  { name: "Escrow / closing fee", kind: "FLAT", value: 600 },
  { name: "Document prep / attorney", kind: "FLAT", value: 250 },
  { name: "Recording & courier", kind: "FLAT", value: 100 },
  { name: "Home warranty", kind: "FLAT", value: 550 },
  { name: "Survey", kind: "FLAT", value: 0 },
  { name: "HOA transfer & resale certificate", kind: "FLAT", value: 0 },
];

export type Sheet = {
  listPct: number;
  buyerPct: number;
  lines: ClosingLine[];
  concessions: number;
  repairs: number;
  /** The year's property taxes (paid in arrears: the seller credits Jan 1 → closing). */
  annualTax: number | null;
  /** HOA dues paid ahead: yearly amount, and the day they're paid through. */
  hoaAnnual: number | null;
  hoaPaidThrough: Date | null;
  /** The title company's quote for the policy, instead of the % (this offer only). */
  titleQuote?: number | null;
};

const daysInYear = (y: number) => (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366 : 365);

/** Property taxes from Jan 1 up to the closing day — what the seller credits the buyer. */
export function taxProration(annual: number | null, closing: Date) {
  if (!annual) return 0;
  const days = dayNo(closing) - dayNo(new Date(closing.getFullYear(), 0, 1));
  return (annual * days) / daysInYear(closing.getFullYear());
}

/** HOA dues paid ahead past closing — what the buyer pays the seller back. */
export function hoaCredit(annual: number | null, paidThrough: Date | null, closing: Date) {
  if (!annual || !paidThrough) return 0;
  const days = dayNo(paidThrough) - dayNo(closing) + 1;
  return days > 0 ? (annual * days) / 365 : 0;
}

/** The parts of the sheet that grow with the price (as a fraction) and the parts that don't. */
function sheetParts(s: Sheet, closing: Date) {
  let pct = (s.listPct + s.buyerPct) / 100;
  let fixed = s.concessions + s.repairs + taxProration(s.annualTax, closing) - hoaCredit(s.hoaAnnual, s.hoaPaidThrough, closing);
  for (const l of s.lines) {
    if (l.title && s.titleQuote != null) fixed += s.titleQuote;
    else if (l.kind === "PCT") pct += l.value / 100;
    else fixed += l.value;
  }
  return { pct, fixed };
}

/** Every line off the price, and what you walk away with. */
export function netSheet(price: number, s: Sheet, closing: Date) {
  const lines: { label: string; amount: number }[] = [];
  const add = (label: string, amount: number) => {
    if (Math.abs(amount) > 0.004) lines.push({ label, amount });
  };
  add(`Listing commission (${s.listPct}%)`, (price * s.listPct) / 100);
  add(`Buyer's agent (${s.buyerPct}%)`, (price * s.buyerPct) / 100);
  for (const l of s.lines) {
    if (l.title && s.titleQuote != null) add(`${l.name} (quote)`, s.titleQuote);
    else add(l.kind === "PCT" ? `${l.name} (${l.value}%)` : l.name, l.kind === "PCT" ? (price * l.value) / 100 : l.value);
  }
  add("Concessions / closing help", s.concessions);
  add("Repairs", s.repairs);
  add("Property taxes, Jan 1 – closing (credit to buyer)", taxProration(s.annualTax, closing));
  add("HOA dues paid ahead (buyer pays back)", -hoaCredit(s.hoaAnnual, s.hoaPaidThrough, closing));
  const selling = lines.reduce((n, l) => n + l.amount, 0);
  return { lines, selling, net: price - selling };
}

/** An offer: what selling costs, what you walk away with, and profit against the house's cost. */
export function offerMath(price: number, s: Sheet, closing: Date, cost: number) {
  const n = netSheet(price, s, closing);
  const profit = n.net - cost;
  return { ...n, profit, margin: price > 0 ? profit / price : null };
}

/** The price that leaves `target` profit after the whole sheet (break-even: target 0). */
export function priceForProfit(target: number, s: Sheet, closing: Date, cost: number) {
  const { pct, fixed } = sheetParts(s, closing);
  if (pct >= 1) return null;
  return (target + cost + fixed) / (1 - pct);
}

// --- Carrying to a closing date ----------------------------------------------------------

/** A carrying cost as the screens get it: its terms, what's been charged, and the first day not charged yet. */
export type CarryState = Omit<Carry, "startDate" | "endDate" | "moves"> & {
  startDate: string;
  endDate: string | null;
  moves: { kind: string; date: string; amount: number; ratePct: number | null }[];
  posted: number;
  nextFrom: string | null;
};

export const toCarry = (c: CarryState): Carry => ({
  ...c,
  startDate: new Date(c.startDate),
  endDate: c.endDate ? new Date(c.endDate) : null,
  moves: c.moves.map((m) => ({ ...m, date: new Date(m.date) })),
});

/** All carrying costs up to (and including) a closing date: charged so far + what's still to come. */
export function carryToClosing(costs: CarryState[], closing: Date, stop: string | null) {
  const end = new Date(closing.getFullYear(), closing.getMonth(), closing.getDate() + 1);
  const stopAt = stop ? new Date(stop) : null;
  return costs.reduce((n, c) => (c.nextFrom ? n + c.posted + accrued(toCarry(c), new Date(c.nextFrom), end, stopAt) : n + c.posted), 0);
}

/**
 * Interest on draws still to come: the money left to finish, drawn evenly from today to
 * closing — so on average half of it is out half the time.
 */
export function futureDrawInterest(remaining: number, ratePct: number, today: Date, closing: Date) {
  const days = dayNo(closing) - dayNo(today);
  if (remaining <= 0 || days <= 0) return 0;
  return ((remaining * ratePct) / 100 / 365) * (days / 2);
}

/** Days on the market: listed to today (or sold). */
export const daysOnMarket = (listed: Date, until: Date) => Math.max(0, dayNo(until) - dayNo(listed));
