import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT, availableCards, dashboardLayout, layoutKeys, moveCard, withCards } from "./dashboard-cards";

describe("dashboard layout", () => {
  it("uses the default until something's saved", () => {
    assert.deepEqual(dashboardLayout(null, true), DEFAULT_LAYOUT);
    assert.deepEqual(dashboardLayout("not json", true), DEFAULT_LAYOUT);
  });

  it("keeps an older saved list of cards: Key numbers on top, the rest dealt into columns", () => {
    const l = dashboardLayout(JSON.stringify(["profit", "stats", "todos", "cash", "aging"]), true);
    assert.deepEqual(l.wide, ["stats"]);
    assert.deepEqual(l.cols, [["profit", "aging"], ["todos"], ["cash"]]);
  });

  it("never shows report cards to someone who can't see Reports", () => {
    const saved = JSON.stringify({ wide: ["stats"], cols: [["profit", "todos"], ["cash"], []] });
    assert.deepEqual(layoutKeys(dashboardLayout(saved, false)), ["stats", "todos"]);
    assert.ok(!availableCards(false).some((c) => c.reports));
  });

  it("drops repeats and unknown cards, and always has three columns", () => {
    const l = dashboardLayout(JSON.stringify({ wide: ["nope"], cols: [["todos", "todos"], ["todos"]] }), true);
    assert.deepEqual(l, { wide: [], cols: [["todos"], [], []] });
  });
});

describe("moving cards", () => {
  const l = { wide: ["stats"], cols: [["a", "b", "c"], ["d"], []] };
  // Pretend every key is a card for these.
  it("moves a card down its column", () => {
    assert.deepEqual(moveCard(l, "a", { zone: 0, index: 2 }).cols[0], ["b", "a", "c"]);
    assert.deepEqual(moveCard(l, "a", { zone: 0, index: 3 }).cols[0], ["b", "c", "a"]);
  });
  it("moves a card up its column", () => {
    assert.deepEqual(moveCard(l, "c", { zone: 0, index: 0 }).cols[0], ["c", "a", "b"]);
  });
  it("moves a card to another column, or an empty one", () => {
    const m = moveCard(l, "b", { zone: 1, index: 0 });
    assert.deepEqual(m.cols, [["a", "c"], ["b", "d"], []]);
    assert.deepEqual(moveCard(l, "d", { zone: 2, index: 0 }).cols, [["a", "b", "c"], [], ["d"]]);
  });
  it("moves a card into the full-width band and back", () => {
    const m = moveCard(l, "d", { zone: "wide", index: 1 });
    assert.deepEqual(m.wide, ["stats", "d"]);
    assert.deepEqual(moveCard(m, "stats", { zone: 2, index: 0 }).cols[2], ["stats"]);
  });
});

describe("turning cards on and off", () => {
  it("keeps the others where they are and puts a new one in the shortest column", () => {
    const l = { wide: ["stats"], cols: [["projects", "attention"], ["sales"], ["todos", "activity"]] };
    const next = withCards(l, ["stats", "projects", "attention", "todos", "activity", "cash"], true);
    assert.deepEqual(next, { wide: ["stats"], cols: [["projects", "attention"], ["cash"], ["todos", "activity"]] });
  });
});
