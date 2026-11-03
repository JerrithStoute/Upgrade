import { z } from "zod";
import type { EscalationLine } from "./escalation";

/**
 * The price change sheet the client gets: what material prices did since their proposal (or
 * contract), from the bid snapshot. Everything on it is the builder's to choose — the words, which
 * columns, item lines or category totals only, which categories — saved for one estimate or as
 * the company's default, like a proposal's options. The totals always count every item in the
 * categories shown (unchanged ones too), so the % is never inflated by what's hidden.
 */

const bool = (d: boolean) => z.boolean().catch(d);
const text = (d: string, max: number) => z.string().max(max).catch(d);

export const priceSheetSchema = z.object({
  heading: text("Material price change", 120),
  /** Your words at the top, and at the end. */
  intro: text("", 4000),
  closing: text("", 4000),
  /** The sentence with the numbers: "Your proposal of Aug 1 priced these materials at …". */
  summary: bool(true),
  /** "Your contract allows … when prices rise more than 10%." */
  trigger: bool(true),
  /** Item lines under each category (off: category totals only). */
  items: bool(true),
  qty: bool(true),
  /** Each item's price then and now. */
  prices: bool(true),
  /** Items whose price didn't move. */
  unchanged: bool(false),
  /** Lines for the client to sign that they've seen it. */
  signature: bool(false),
  /** Categories left off the sheet (and out of its totals). */
  leaveOut: z.array(z.string().max(200)).max(200).catch([]),
});

export type PriceSheetOptions = z.infer<typeof priceSheetSchema>;
export const DEFAULT_PRICE_SHEET: PriceSheetOptions = priceSheetSchema.parse({});

export function parsePriceSheet(json: string | null | undefined): PriceSheetOptions {
  if (!json) return DEFAULT_PRICE_SHEET;
  try {
    return priceSheetSchema.parse(JSON.parse(json));
  } catch {
    return DEFAULT_PRICE_SHEET;
  }
}

export type SheetCategory = { name: string; then: number; now: number; change: number; lines: EscalationLine[]; unchanged: number; unchangedTotal: number };

const cents = (n: number) => Math.round(n * 100) / 100;
const moved = (l: EscalationLine) => Math.abs(l.change) >= 0.005;

/** The lines by category, with each category's totals; `leaveOut` categories are dropped. */
export function sheetCategories(lines: EscalationLine[], leaveOut: string[] = []) {
  const by = new Map<string, EscalationLine[]>();
  for (const l of lines) if (!leaveOut.includes(l.category)) by.set(l.category, [...(by.get(l.category) ?? []), l]);
  const cats: SheetCategory[] = [...by].map(([name, ls]) => {
    const then = cents(ls.reduce((s, l) => s + l.qty * l.price, 0));
    const now = cents(ls.reduce((s, l) => s + l.qty * l.today, 0));
    const still = ls.filter((l) => !moved(l));
    return { name, then, now, change: cents(now - then), lines: ls, unchanged: still.length, unchangedTotal: cents(still.reduce((s, l) => s + l.qty * l.price, 0)) };
  });
  const then = cents(cats.reduce((s, c) => s + c.then, 0));
  const now = cents(cats.reduce((s, c) => s + c.now, 0));
  const change = cents(now - then);
  return { categories: cats, then, now, change, pct: then > 0 ? Math.round((change / then) * 1000) / 10 : 0 };
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The sentence with the numbers, in the client's words. */
export function sheetSummary(kind: "SENT" | "SIGNED", since: string, s: { then: number; now: number; change: number; pct: number }) {
  const start = kind === "SENT" ? `Your proposal of ${since} priced the materials for your home at ${usd(s.then)}.` : `When your contract was signed on ${since}, the materials for your home were priced at ${usd(s.then)}.`;
  const end = s.change > 0.005 ? `: up ${usd(s.change)} (${s.pct}%).` : s.change < -0.005 ? `: down ${usd(-s.change)} (${Math.abs(s.pct)}%).` : ", the same.";
  return `${start} At today's prices they come to ${usd(s.now)}${end}`;
}

export const sheetTrigger = (pct: number) => `Your contract allows the price to be adjusted when material prices rise more than ${pct}%.`;

/** The lines a sheet lists for a category: the ones that moved (biggest change first), and the rest when asked. */
export function shownLines(c: SheetCategory, unchanged: boolean) {
  const changed = c.lines.filter(moved).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return unchanged ? [...changed, ...c.lines.filter((l) => !moved(l))] : changed;
}
