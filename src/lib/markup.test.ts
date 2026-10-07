import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowanceExtras, asMarkup, followTable, followTax, parseMarkupTable, startingTable, tableExtras, tableProfitPct, tableTaxPct, taxRateFor, type MarkupRow } from "./markup";

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

  it("adds overhead on the cost of the lines it applies to; tax is in the taxed lines, not on top (optional lines left out)", () => {
    const taxed = lines.map((l) => (l.costType === "MATERIAL" ? { ...l, taxPct: 8.25 } : l));
    const x = tableExtras([row({ kind: "OVERHEAD", pct: 5 }), row({ kind: "TAX", pct: 8.25, appliesTo: "MATERIAL" }), row({ pct: 20 })], taxed);
    assert.equal(x.overheadTotal, 800);
    assert.equal(x.taxTotal, 825);
    assert.equal(x.total, 800);
  });

  it("gives a cost type its tax rate, and taxed lines follow a new rate", () => {
    const rows = [row({ kind: "TAX", name: "Sales tax", pct: 8.25, appliesTo: "MATERIAL" })];
    assert.equal(tableTaxPct(rows, "MATERIAL"), 8.25);
    assert.equal(tableTaxPct(rows, "LABOR"), 0);
    // Ticking a labor line taxed by hand takes the table's rate.
    assert.equal(taxRateFor(rows, "LABOR"), 8.25);
    const after = [row({ kind: "TAX", pct: 8.5, appliesTo: "MATERIAL" })];
    assert.equal(followTax(rows, after, { costType: "MATERIAL", taxPct: 8.25 }), 8.5);
    assert.equal(followTax(rows, after, { costType: "MATERIAL", taxPct: 0 }), null); // you unticked it: stays untaxed
    // A table that had no tax: adding it taxes the lines it covers.
    assert.equal(followTax([], rows, { costType: "MATERIAL", taxPct: 0 }), 8.25);
    assert.equal(followTax([], rows, { costType: "LABOR", taxPct: 0 }), null);
    // Taking the tax row out: no tax.
    assert.equal(followTax(rows, [], { costType: "MATERIAL", taxPct: 8.25 }), 0);
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
