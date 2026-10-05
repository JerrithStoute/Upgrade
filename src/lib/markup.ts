import { z } from "zod";

/**
 * The Markup, Margin & Tax table (one per estimate / template, plus your default).
 *
 *  - PROFIT rows fill each line's profit % (by cost type); a line can still be changed by hand.
 *  - OVERHEAD / OTHER rows add an amount on top of the lines.
 *  - TAX rows add tax on top (a real amount: estimate total, contract, budget).
 *
 * Each row is a % "markup" (of cost) or "margin" (of the selling price), applies to
 * all costs or one cost type, can carry a cost code (budget), and can count toward
 * the client's allowance amounts.
 */

export const MARKUP_KINDS = [
  { value: "PROFIT", label: "Profit" },
  { value: "OVERHEAD", label: "Overhead" },
  { value: "TAX", label: "Tax" },
  { value: "OTHER", label: "Other" },
] as const;

export const markupRowSchema = z.object({
  id: z.string().max(40),
  name: z.string().trim().max(80),
  kind: z.enum(["PROFIT", "OVERHEAD", "TAX", "OTHER"]),
  pct: z.number().finite().min(0).max(1000),
  basis: z.enum(["MARKUP", "MARGIN"]),
  /** "ALL" or a cost type (MATERIAL, LABOR…). */
  appliesTo: z.string().max(20),
  costCodeId: z.string().nullable(),
  inAllowance: z.boolean(),
});
export type MarkupRow = z.infer<typeof markupRowSchema>;
export const markupTableSchema = z.array(markupRowSchema).max(50);

let seq = 0;
export const newRowId = () => `r${Date.now().toString(36)}${++seq}`;

/** The table you start with: one profit row at your starting profit %. */
export function startingTable(profitPct: number): MarkupRow[] {
  return [{ id: "profit", name: "Builder profit", kind: "PROFIT", pct: profitPct, basis: "MARKUP", appliesTo: "ALL", costCodeId: null, inAllowance: false }];
}

export function parseMarkupTable(json: string | null | undefined, fallbackProfit: number): MarkupRow[] {
  if (!json) return startingTable(fallbackProfit);
  try {
    const parsed = markupTableSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : startingTable(fallbackProfit);
  } catch {
    return startingTable(fallbackProfit);
  }
}

const applies = (r: MarkupRow, costType: string) => r.appliesTo === "ALL" || r.appliesTo === costType;
/** A row's % as a markup on cost (a 20% margin is a 25% markup). */
export const asMarkup = (r: { pct: number; basis: string }) => (r.basis === "MARGIN" ? (r.pct >= 100 ? 0 : (r.pct / (100 - r.pct)) * 100) : r.pct);
const round = (n: number) => Math.round(n * 10000) / 10000;

/** The profit % a line of this cost type gets from the table (the profit rows that apply to it), or null when none do. */
export function tableProfitPct(rows: MarkupRow[], costType: string): number | null {
  const hits = rows.filter((r) => r.kind === "PROFIT" && applies(r, costType));
  return hits.length ? round(hits.reduce((n, r) => n + asMarkup(r), 0)) : null;
}

type Line = { quantity: number; unitCost: number; costType: string; isOptional?: boolean };

/**
 * The amounts the overhead / other / tax rows add on top of the lines. Each is % of
 * the cost of the lines it applies to (markup), or that share of the selling price (margin).
 */
export function tableExtras(rows: MarkupRow[], lines: Line[]) {
  const included = lines.filter((l) => !l.isOptional);
  const out = rows
    .filter((r) => r.kind !== "PROFIT" && r.pct > 0)
    .map((r) => {
      const base = included.filter((l) => applies(r, l.costType)).reduce((n, l) => n + l.quantity * l.unitCost, 0);
      return { row: r, amount: Math.round(((base * asMarkup(r)) / 100) * 100) / 100 };
    });
  const overhead = out.filter((x) => x.row.kind !== "TAX");
  const taxes = out.filter((x) => x.row.kind === "TAX");
  const sum = (xs: typeof out) => Math.round(xs.reduce((n, x) => n + x.amount, 0) * 100) / 100;
  return { rows: out, overhead, taxes, overheadTotal: sum(overhead), taxTotal: sum(taxes), total: sum(out) };
}

/** What the rows marked "include in client allowance amounts" add to an allowance (its lines' share). */
export function allowanceExtras(rows: MarkupRow[], lines: Line[]) {
  return tableExtras(
    rows.filter((r) => r.inAllowance && r.kind !== "PROFIT"),
    lines,
  ).total;
}

/**
 * When the table's profit changes: lines still at the old table % for their cost
 * type follow it; lines you set by hand keep theirs. Returns the new % or null (no change).
 */
export function followTable(oldRows: MarkupRow[], newRows: MarkupRow[], line: { costType: string; markupPct: number }) {
  const before = tableProfitPct(oldRows, line.costType);
  const after = tableProfitPct(newRows, line.costType);
  if (after === null || before === after) return null;
  return before !== null && Math.abs(line.markupPct - before) < 1e-6 ? after : null;
}
