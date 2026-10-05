import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowanceExtras, asMarkup, followTable, parseMarkupTable, startingTable, tableExtras, tableProfitPct, type MarkupRow } from "./markup";

const row = (p: Partial<MarkupRow>): MarkupRow => ({ id: "x", name: "", kind: "PROFIT", pct: 0, basis: "MARKUP", appliesTo: "ALL", costCodeId: null, inAllowance: false, ...p });
const lines = [
  { quantity: 1, unitCost: 10000, costType: "MATERIAL" },
  { quantity: 1, unitCost: 6000, costType: "LABOR" },
  { quantity: 1, unitCost: 999, costType: "MATERIAL", isOptional: true },
];

describe("markup, margin & tax table", () => {
  it("gives each cost type its profit %", () => {
    const rows = [row({ pct: 18, appliesTo: "MATERIAL" }), row({ pct: 25, appliesTo: "LABOR" }), row({ kind: "OVERHEAD", pct: 5 })];
    assert.equal(tableProfitPct(rows, "MATERIAL"), 18);
    assert.equal(tableProfitPct(rows, "LABOR"), 25);
    assert.equal(tableProfitPct(rows, "EQUIPMENT"), null);
    assert.equal(asMarkup({ pct: 20, basis: "MARGIN" }), 25);
    assert.equal(tableProfitPct([row({ pct: 20, basis: "MARGIN" })], "LABOR"), 25);
  });

  it("adds overhead and tax on the cost of the lines they apply to (optional lines left out)", () => {
    const x = tableExtras([row({ kind: "OVERHEAD", pct: 5 }), row({ kind: "TAX", pct: 8.25, appliesTo: "MATERIAL" }), row({ pct: 20 })], lines);
    assert.equal(x.overheadTotal, 800);
    assert.equal(x.taxTotal, 825);
    assert.equal(x.total, 1625);
  });

  it("counts only the rows marked for allowances", () => {
    const rows = [row({ kind: "OVERHEAD", pct: 5, inAllowance: true }), row({ kind: "TAX", pct: 10, appliesTo: "MATERIAL" })];
    assert.equal(allowanceExtras(rows, lines), 800);
  });

  it("moves lines still at the table % and leaves the ones you changed", () => {
    const before = [row({ pct: 20 })];
    const after = [row({ pct: 22 })];
    assert.equal(followTable(before, after, { costType: "LABOR", markupPct: 20 }), 22);
    assert.equal(followTable(before, after, { costType: "LABOR", markupPct: 30 }), null);
  });

  it("starts from your profit % when nothing is saved", () => {
    assert.deepEqual(parseMarkupTable(null, 18), startingTable(18));
    assert.deepEqual(parseMarkupTable("garbage", 18), startingTable(18));
  });
});
