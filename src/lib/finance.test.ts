import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contractStanding } from "./finance";

describe("where the contract stands on an invoice", () => {
  it("is what's left to invoice after this one", () => {
    const s = contractStanding(137277.75, 70633.5, 27375, 70633.5);
    assert.deepEqual(s, { contract: 137277.75, before: 70633.5, thisOne: 27375, left: 39269.25, paid: 70633.5 });
  });
  it("goes below zero when billed past the contract", () => {
    assert.equal(contractStanding(1000, 900, 300, 0).left, -200);
  });
});
