/**
 * Stale prices: each cost code can say how often its prices need a recheck (lumber every 3 weeks,
 * concrete every 3 months, windows every 6 months). An Item List item whose price was last set or
 * confirmed longer ago than that is flagged — a reminder only; nothing changes a price by itself.
 */

export const RECHECK_UNITS = ["days", "weeks", "months"] as const;
export type RecheckUnit = (typeof RECHECK_UNITS)[number];

export type Recheck = { every: number; unit: RecheckUnit };

/** A cost code's recheck time, or null (blank = its prices never go stale). */
export function recheckOf(code: { priceRecheckEvery: number | null; priceRecheckUnit: string | null } | null | undefined): Recheck | null {
  const every = code?.priceRecheckEvery ?? 0;
  const unit = code?.priceRecheckUnit as RecheckUnit;
  return every > 0 && RECHECK_UNITS.includes(unit) ? { every, unit } : null;
}

/** "3 weeks", "1 month". */
export function recheckText(r: Recheck) {
  return `${r.every} ${r.every === 1 ? r.unit.slice(0, -1) : r.unit}`;
}

/** When a price checked on `checkedAt` goes stale. */
export function staleOn(checkedAt: Date, r: Recheck) {
  const d = new Date(checkedAt);
  if (r.unit === "days") d.setDate(d.getDate() + r.every);
  else if (r.unit === "weeks") d.setDate(d.getDate() + r.every * 7);
  else d.setMonth(d.getMonth() + r.every);
  return d;
}

/** Past its recheck time? ($0 items aren't stale — they have no price yet, flagged as that.) */
export function isStale(item: { unitCost: number; priceCheckedAt: Date }, r: Recheck | null, now = new Date()) {
  return !!r && item.unitCost > 0 && staleOn(item.priceCheckedAt, r) <= now;
}

/** "Price checked Mar 3, 2025 — 06-100 Framing prices are rechecked every 3 weeks." */
export function staleNote(checkedAt: Date, r: Recheck, codeLabel: string) {
  const on = checkedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `Price checked ${on} — ${codeLabel} prices are rechecked every ${recheckText(r)}.`;
}

/** Fields that stamp an item's price as checked now, when the price is set. */
export const PRICE_CHECKED = () => ({ priceCheckedAt: new Date() });

/** Reads the recheck fields from a cost code form (blank number = never). */
export function recheckFields(fd: FormData) {
  const n = Math.round(Number(String(fd.get("priceRecheckEvery") ?? "").trim()));
  const unit = String(fd.get("priceRecheckUnit") ?? "");
  return n > 0 && (RECHECK_UNITS as readonly string[]).includes(unit)
    ? { priceRecheckEvery: n, priceRecheckUnit: unit }
    : { priceRecheckEvery: null, priceRecheckUnit: null };
}
