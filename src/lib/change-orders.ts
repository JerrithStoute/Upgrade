/**
 * Change order math, shared by every page that shows or counts a change order
 * (the change order itself, the portal, contract value, budget, invoices).
 *
 * Each line's amount is quantity × unit cost × (1 + markup) — for a client choice
 * that's its difference (client price − allowance), for an extra charge its amount.
 * Profit is your call each time: none, a %, or a $ amount — shown as its own line or
 * folded into the line prices. Each line can also have its own profit (none, a %, or a
 * $ amount); lines that don't follow the change order's %. A change order's $ amount is
 * added once.
 *
 * Sales tax works like the estimate's: it's what you pay on each taxed line (the change
 * order's rate on its amount), part of the line's amount, so profit is figured on it too.
 * The client sees it as its own line or built into the prices — the total is the same.
 */

/** A line's own profit: CO (the change order's — the default), NONE, PCT or AMOUNT. */
export type CoLine = { quantity: number; unitCost: number; markupPct: number; profitMode?: string | null; profitValue?: number | null; taxed?: boolean | null };
export type CoProfit = { profitMode: string; profitValue: number; profitShown: string; taxPct: number; taxShown?: string | null };

export const LINE_PROFIT_MODES = [
  { value: "CO", label: "Change order's" },
  { value: "NONE", label: "None" },
  { value: "PCT", label: "%" },
  { value: "AMOUNT", label: "$" },
] as const;

const cents = (n: number) => Math.round(n * 100) / 100;

/** The sales tax you pay on a line: the change order's rate on its amount, when it's taxed. */
export function lineTax(co: { taxPct: number }, l: CoLine) {
  return l.taxed && co.taxPct > 0 ? (l.quantity * l.unitCost * co.taxPct) / 100 : 0;
}

/** A line's amount, its tax in: (quantity × unit cost + tax) × (1 + markup). */
export function lineAmount(l: CoLine, co?: { taxPct: number }) {
  return (l.quantity * l.unitCost + (co ? lineTax(co, l) : 0)) * (1 + l.markupPct / 100);
}

/** One line's profit (on its amount, tax in): its own, or (when it follows the change order) the change order's %. */
export function lineProfit(co: CoProfit, l: CoLine) {
  const base = lineAmount(l, co);
  const mode = l.profitMode ?? "CO";
  if (mode === "NONE") return 0;
  if (mode === "PCT") return (base * (l.profitValue ?? 0)) / 100;
  if (mode === "AMOUNT") return l.profitValue ?? 0;
  return co.profitMode === "PCT" ? (base * co.profitValue) / 100 : 0;
}

export function changeOrderTotals(co: CoProfit, lines: CoLine[]) {
  const subtotal = lines.reduce((n, l) => n + lineAmount(l, co), 0);
  // Each line's profit, plus the change order's $ amount (added once).
  const flat = co.profitMode === "AMOUNT" ? co.profitValue : 0;
  const profit = lines.reduce((n, l) => n + lineProfit(co, l), 0) + flat;
  const total = subtotal + profit;
  // The tax in the lines: its own line (the other amounts before tax), or left in the prices.
  const taxIn = lines.reduce((n, l) => n + lineTax(co, l), 0);
  const taxLine = co.taxShown !== "FOLDED" && Math.abs(taxIn) >= 0.005;
  const out = (l: CoLine) => (taxLine ? lineTax(co, l) : 0);
  const folded = co.profitShown === "FOLDED";
  // "Builder's fee (10%)" only when every line follows the change order's %.
  const uniform = lines.every((l) => (l.profitMode ?? "CO") === "CO");
  return {
    subtotal: cents(subtotal),
    profit: cents(profit),
    /** Profit gets its own line (not folded, and there is some). */
    profitLine: !folded && Math.abs(profit) >= 0.005,
    /** The % for the fee line's label, when one % covers it all. */
    feePct: uniform && co.profitMode === "PCT" ? co.profitValue : null,
    /** The tax line (0 when it's built into the prices). */
    tax: taxLine ? cents(taxIn) : 0,
    /** The tax you pay on it, shown or not. */
    taxIn: cents(taxIn),
    total: cents(total),
    /** What a line shows: folded, its own profit and its share of the change order's $ amount; less its tax when tax has its own line. */
    shown: (l: CoLine) => {
      const base = lineAmount(l, co);
      if (!folded) return cents(base - out(l));
      return cents(base + lineProfit(co, l) + (subtotal !== 0 ? (flat * base) / subtotal : 0) - out(l));
    },
    /** The subtotal as shown (folded profit included, a tax line's tax not). */
    shownSubtotal: cents((folded && (subtotal !== 0 || flat === 0) ? total : subtotal) - (taxLine ? taxIn : 0)),
  };
}

/** Effect on contract: base price, previously approved change orders, this one, the new total. */
export function effectOnContract(basePrice: number, previous: number, thisOne: number) {
  return { basePrice: cents(basePrice), previous: cents(previous), thisOne: cents(thisOne), total: cents(basePrice + previous + thisOne) };
}

/** "Use as default" values for new change orders. */
export type CoDefaults = { introText?: string; closingText?: string; terms?: string; ifDeclined?: string; profitMode?: string; profitValue?: number; profitShown?: string };

export function parseCoDefaults(json: string | null | undefined): CoDefaults {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return typeof v === "object" && v ? (v as CoDefaults) : {};
  } catch {
    return {};
  }
}

/** JSON list / map fields on a change order, read safely. */
export function parseIds(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function parseApprovals(json: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(json ?? "{}");
    return typeof v === "object" && v && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Approved once the client has (if they must) and every listed team member has. */
export function isFullyApproved(co: { clientApproval: boolean; clientApprovedAt: Date | null; approverIds: string | null; teamApprovals: string | null }) {
  const done = parseApprovals(co.teamApprovals);
  return (!co.clientApproval || !!co.clientApprovedAt) && parseIds(co.approverIds).every((id) => !!done[id]);
}
