import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guessPlan, parseEstimate, planTotals, splitCategory } from "./estimate";
import type { Row } from "./xlsx";

// A made-up CoConstruct export: a plain category, an allowance with a choice made (its own
// profit in K), a change order folded in, a declined one, and loose "Other Line Items".
const head = { C: "Item Description", D: "Qty.", E: "Units", F: "Unit Cost", G: "Ext. Cost", H: "Cost Type", I: "Acct. Code", J: "Profit", L: "Line Item Total Price", M: "Selection Total Price", N: "Category Total Price" };
const rows: Row[] = [
  head,
  { A: "3000 Rough Structure", N: "13340" },
  { B: "3100 Framing", M: "11400" },
  { C: "Framing labor", D: "1000", E: "s.f.", F: "10", G: "10000", H: "Labor", I: "3160 - Framing Labor", J: "0.14", K: "1400", L: "11400" },
  { B: "Roof pitch changes : 1. Main roof 9/12 to 10/12", M: "1800" },
  { C: "Roof pitch", D: "1", E: "each", F: "1800", G: "1800", H: "Other", I: "4010 - Roofing material", J: "0", L: "1800" },
  { B: "Dig to pond : Declined", M: "0" },
  { B: "5500 Appliances (Allowance): 1. Appliances selected 01-29-26.", K: "1120", M: "7859.57" },
  { C: "Appliances", D: "1", E: "each", F: "6739.57", G: "6739.57", H: "Materials", I: "5500 - Appliances" },
  { A: "Other Line Items", N: "18240" },
  { C: "Shop slab", D: "1", E: "each", F: "16000", G: "16000", H: "Subcontract", I: "1999 - whole house", J: "0.14", K: "2240", L: "18240" },
  {},
  { A: "Totals", G: "34539.57", N: "39299.57" },
];

describe("a CoConstruct estimate export", () => {
  it("splits a category into its name, choice and allowance", () => {
    assert.deepEqual(splitCategory("4120 Fireplace (Allowance): 1. LUNAR 36\""), { name: "4120 Fireplace", choice: 'LUNAR 36"', isSelection: true, isAllowance: true });
    assert.deepEqual(splitCategory("5100 Flooring (Allowance): Original Budget"), { name: "5100 Flooring", choice: null, isSelection: true, isAllowance: true });
    assert.deepEqual(splitCategory("3800 HVAC"), { name: "3800 HVAC", choice: null, isSelection: false, isAllowance: false });
  });

  it("reads the divisions, categories and lines, and its totals", () => {
    const est = parseEstimate(rows);
    assert.deepEqual(
      est.categories.map((c) => [c.division, c.name, c.items.length, c.price]),
      [
        ["3000 Rough Structure", "3100 Framing", 1, 11400],
        ["3000 Rough Structure", "Roof pitch changes", 1, 1800],
        ["3000 Rough Structure", "Dig to pond", 0, 0],
        ["3000 Rough Structure", "5500 Appliances", 1, 7859.57],
        ["Other Line Items", "Other Line Items", 1, 18240],
      ],
    );
    const framing = est.categories[0].items[0];
    assert.deepEqual([framing.unit, framing.costType, framing.code, framing.codeName, framing.markupPct], ["sf", "LABOR", "3160", "Framing Labor", 14]);
    assert.deepEqual([est.cost, est.price], [34539.57, 39299.57]);
  });

  it("guesses what each category is, and adds it up to the contract", () => {
    const est = parseEstimate(rows);
    const plan = { categories: est.categories.map((c) => guessPlan(c, 14)), basePrice: null as number | null };
    assert.deepEqual(
      plan.categories.map((p) => [p.role, p.selection, p.status, p.allowance]),
      [
        ["ESTIMATE", false, "OPEN", null],
        ["CO", false, "OPEN", null],
        ["SKIP", false, "OPEN", null],
        // The allowance its profit was figured on: 1,120 ÷ 14%.
        ["ESTIMATE", true, "CHOSEN", 8000],
        ["ESTIMATE", false, "OPEN", null],
      ],
    );
    // The appliances come in at their allowance (8,000 + 1,120 profit); the choice is 1,260.43 under.
    let t = planTotals(est, plan);
    assert.deepEqual([t.lines, t.coTotal, t.finalChoices, t.chosenChoices], [38760, 1800, 0, -1260.43]);
    assert.equal(t.contract, 38760 + 1800);
    // Final, and the price quoted set by hand: the credit counts in the contract.
    plan.categories[3].status = "FINAL";
    plan.basePrice = 38000;
    t = planTotals(est, plan);
    assert.deepEqual([t.basePrice, t.finalChoices, t.contract], [38000, -1260.43, 38539.57]);
  });
});
