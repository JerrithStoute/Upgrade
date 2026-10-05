/**
 * Change order math, shared by every page that shows or counts a change order
 * (the change order itself, the portal, contract value, budget, invoices).
 *
 * Each line's amount is quantity × unit cost × (1 + markup) — for a client choice
 * that's its difference (client price − allowance), for an extra charge its amount.
 * Profit is your call each time: none, a %, or a $ amount — shown as its own line or
 * folded into the line prices. Each line can also have its own profit (none, a %, or a
 * $ amount); lines that don't follow the change order's %. A change order's $ amount is
 * added once. Tax goes on top.
 */

/** A line's own profit: CO (the change order's — the default), NONE, PCT or AMOUNT. */
export type CoLine = { quantity: number; unitCost: number; markupPct: number; profitMode?: string | null; profitValue?: number | null };
export type CoProfit = { profitMode: string; profitValue: number; profitShown: string; taxPct: number };

export const LINE_PROFIT_MODES = [
  { value: "CO", label: "Change order's" },
  { value: "NONE", label: "None" },
  { value: "PCT", label: "%" },
  { value: "AMOUNT", label: "$" },
] as const;

const cents = (n: number) => Math.round(n * 100) / 100;

export function lineAmount(l: CoLine) {
  return l.quantity * l.unitCost * (1 + l.markupPct / 100);
}

/** One line's profit: its own, or (when it follows the change order) the change order's %. */
export function lineProfit(co: CoProfit, l: CoLine) {
  const base = lineAmount(l);
  const mode = l.profitMode ?? "CO";
  if (mode === "NONE") return 0;
  if (mode === "PCT") return (base * (l.profitValue ?? 0)) / 100;
  if (mode === "AMOUNT") return l.profitValue ?? 0;
  return co.profitMode === "PCT" ? (base * co.profitValue) / 100 : 0;
}

export function changeOrderTotals(co: CoProfit, lines: CoLine[]) {
  const subtotal = lines.reduce((n, l) => n + lineAmount(l), 0);
  // Each line's profit, plus the change order's $ amount (added once).
  const flat = co.profitMode === "AMOUNT" ? co.profitValue : 0;
  const profit = lines.reduce((n, l) => n + lineProfit(co, l), 0) + flat;
  const beforeTax = subtotal + profit;
  const tax = co.taxPct > 0 ? (beforeTax * co.taxPct) / 100 : 0;
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
    tax: cents(tax),
    total: cents(beforeTax + tax),
    /** What a line shows: folded, its own profit and its share of the change order's $ amount. */
    shown: (l: CoLine) => {
      const base = lineAmount(l);
      if (!folded) return cents(base);
      return cents(base + lineProfit(co, l) + (subtotal !== 0 ? (flat * base) / subtotal : 0));
    },
    /** The subtotal as shown (folded profit included). */
    shownSubtotal: cents(folded && (subtotal !== 0 || flat === 0) ? beforeTax : subtotal),
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
