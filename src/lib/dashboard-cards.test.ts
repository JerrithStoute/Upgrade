import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CARDS, availableCards, pickedCards } from "./dashboard-cards";

describe("dashboard cards", () => {
  it("uses the default until you pick", () => {
    assert.deepEqual(pickedCards(null, true), DEFAULT_CARDS);
    assert.deepEqual(pickedCards("not json", true), DEFAULT_CARDS);
  });

  it("keeps your order, drops unknown cards and repeats", () => {
    assert.deepEqual(pickedCards(JSON.stringify(["profit", "todos", "nope", "todos"]), true), ["profit", "todos"]);
    assert.deepEqual(pickedCards("[]", true), []);
  });

  it("never shows report cards to someone who can't see Reports", () => {
    assert.deepEqual(pickedCards(JSON.stringify(["profit", "cash", "todos"]), false), ["todos"]);
    assert.ok(!availableCards(false).some((c) => c.reports));
    assert.equal(availableCards(true).filter((c) => c.reports).length, 4);
  });
});
