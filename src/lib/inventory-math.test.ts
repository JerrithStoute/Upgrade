import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { averageIn, averageOut, suggestedPull, toOrder } from "./inventory-math";

describe("inventory math", () => {
  it("averages what's paid as stock comes in", () => {
    assert.equal(averageIn(0, 0, 50, 8), 8);
    assert.equal(averageIn(50, 8, 50, 10), 9);
    assert.equal(averageIn(-2, 8, 10, 10), 10); // a negative count never drags the average
  });

  it("takes an average back when stock is undone", () => {
    assert.equal(averageOut(100, 9, 50, 10), 8);
    assert.equal(averageOut(50, 8, 50, 8), 8); // nothing left: keeps the last average
  });

  it("suggests what the job still needs, as much as there is", () => {
    assert.equal(suggestedPull(140, 0, 60), 60);
    assert.equal(suggestedPull(140, 100, 60), 40);
    assert.equal(suggestedPull(140, 150, 60), 0);
  });

  it("never orders below zero", () => {
    assert.equal(toOrder(140, 60), 80);
    assert.equal(toOrder(10, 12), 0);
  });
});
