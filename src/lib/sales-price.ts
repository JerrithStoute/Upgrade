import { evaluateFormula, formulaRefs } from "./formula";
import { lineMath } from "./estimate-sheet";
import { tableExtras, type MarkupRow } from "./markup";

/**
 * "Sales price" in a quantity or unit cost — realtor fees (6% of the price), general
 * liability (so much per $1,000 of the price). The catch: those lines are part of the
 * price they're figured from. So the price is solved, not chased:
 *
 *   price = everything else + 6% × price   →   price = everything else ÷ 0.94
 *
 * worked out in one step (a fee of 6% is exactly 6% of the final price, fee included),
 * then checked at most 3 more times for round-ups. It can never loop.
 *
 * The sales price is the Base price when you've set one (what the client signs for),
 * else the estimate's price before tax: lines with profit, plus the table's overhead.
 */

export const SALES_ID = "sales";
export const SALES_PARAM = { id: SALES_ID, name: "Sales price", unit: "$" };

type Line = { quantity: number; unitCost: number; markupPct: number; isOptional: boolean; costType: string; qtyFormula: string | null; costFormula?: string | null };

const uses = (f: string | null | undefined) => !!f && formulaRefs(f).includes(SALES_ID);
export const usesSales = (l: { qtyFormula: string | null; costFormula?: string | null }) => uses(l.qtyFormula) || uses(l.costFormula);

const evalAt = (formula: string, values: Record<string, number>) =>
  evaluateFormula(
    formula,
    values,
    Object.keys(values).map((id) => ({ id, name: id })),
  ).value;

const cents = (n: number) => Math.round(n * 100) / 100;
/** A share of the price this big (or more) can't be solved — 95%+ of the price going to fees. */
const MAX_SHARE = 0.95;

export function settleSales<L extends Line>(lines: L[], values: Record<string, number>, basePrice: number | null, markup: MarkupRow[]): { sales: number; lines: L[] } {
  const at = (sales: number): L[] => {
    const v = { ...values, [SALES_ID]: sales };
    return lines.map((l) =>
      usesSales(l) ? { ...l, ...(uses(l.qtyFormula) ? { quantity: evalAt(l.qtyFormula!, v) } : {}), ...(uses(l.costFormula) ? { unitCost: evalAt(l.costFormula!, v) } : {}) } : l,
    );
  };
  const price = (ls: L[]) => ls.filter((l) => !l.isOptional).reduce((n, l) => n + lineMath(l).price, 0) + tableExtras(markup, ls).overheadTotal;

  if (!lines.some(usesSales)) return { sales: cents(basePrice ?? price(lines)), lines };
  let sales: number;
  if (basePrice !== null && basePrice > 0) sales = basePrice;
  else {
    // price(S) = rest + share × S: two looks tell us both, then solve.
    const rest = price(at(0));
    const share = (price(at(1_000_000)) - rest) / 1_000_000;
    sales = share < MAX_SHARE ? rest / (1 - share) : rest;
    // Round-ups (roundup(), whole units) can nudge it — check a few times, never more
    // (and not at all when the share can't be solved: that would only climb).
    for (let i = 0; share < MAX_SHARE && i < 3; i++) {
      const next = price(at(sales));
      if (Math.abs(next - sales) < 0.005) break;
      sales = next;
    }
  }
  sales = cents(sales);
  return { sales, lines: at(sales) };
}
