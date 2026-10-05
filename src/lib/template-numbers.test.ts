/** Saving an estimate as a template without this job's numbers. Run with `npm test`. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearJobNumbers } from "./template-numbers";

describe("clearing a job's numbers for a template", () => {
  it("a typed price stays; its quantity goes to 0", () => {
    assert.deepEqual(clearJobNumbers({ quantity: 12, unitCost: 450 }), { quantity: 0, unitCost: 450 });
  });

  it("formulas stay, and a share of a formula price keeps its quantity (Plumbing Rough In 0.2)", () => {
    assert.deepEqual(clearJobNumbers({ quantity: 2400, unitCost: 0.65, qtyFormula: "[#sqft]" }), { quantity: 2400, unitCost: 0.65 });
    assert.deepEqual(clearJobNumbers({ quantity: 0.2, unitCost: 9800, costFormula: "[#plumbing]" }), { quantity: 0.2, unitCost: 9800 });
  });

  it("a line the takeoff filled starts at $0 (the next takeoff fills it)", () => {
    assert.deepEqual(clearJobNumbers({ quantity: 1, unitCost: 15473.25, fromTakeoff: true }), { quantity: 0, unitCost: 0 });
  });

  it("allowances are zeroed", () => {
    assert.deepEqual(clearJobNumbers({ quantity: 1, unitCost: 3057.32, isAllowance: true }), { quantity: 0, unitCost: 0 });
  });
});
