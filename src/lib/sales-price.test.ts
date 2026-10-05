import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { settleSales } from "./sales-price";

const line = (p: { quantity?: number; unitCost: number; markupPct?: number; qtyFormula?: string | null; costFormula?: string | null }) => ({
  quantity: p.quantity ?? 1,
  unitCost: p.unitCost,
  markupPct: p.markupPct ?? 0,
  isOptional: false,
  costType: "OTHER",
  qtyFormula: p.qtyFormula ?? null,
  costFormula: p.costFormula ?? null,
});

describe("sales price", () => {
  it("a 6% realtor fee is 6% of the final price — fee included — in one step", () => {
    const { sales, lines } = settleSales([line({ unitCost: 94_000 }), line({ qtyFormula: "[#sales]", unitCost: 0.06 })], {}, null, []);
    assert.equal(sales, 100_000);
    assert.equal(Math.round(lines[1].quantity * lines[1].unitCost * 100) / 100, 6_000);
  });

  it("insurance per $1,000 of the price, with profit on the rest, and the Base price when you've set one", () => {
    const rows = [line({ unitCost: 100_000, markupPct: 20 }), line({ qtyFormula: "[#sales] * 0.001", unitCost: 8 })];
    const { sales } = settleSales(rows, {}, null, []);
    // 120,000 + 0.008 × S = S
    assert.equal(sales, Math.round((120_000 / 0.992) * 100) / 100);
    assert.equal(settleSales(rows, {}, 150_000, []).sales, 150_000);
  });

  it("never loops: an impossible share of the price (100%) stops at the rest, and round-ups settle", () => {
    const { sales } = settleSales([line({ unitCost: 50_000 }), line({ qtyFormula: "[#sales]", unitCost: 1 })], {}, null, []);
    assert.equal(sales, 50_000);
    const r = settleSales([line({ unitCost: 99_500 }), line({ qtyFormula: "roundup([#sales] / 1000)", unitCost: 10 })], {}, null, []);
    assert.ok(Number.isFinite(r.sales) && r.sales > 99_500 && r.sales < 101_000);
  });
});
