import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detailChanges, mergeNote, toSnapshot } from "./takeoff-changes";

const snap = (rows: [string, number, string, number][]) => toSnapshot(rows.map(([description, quantity, unit, unitCost]) => ({ description, quantity, unit, unitCost })));

describe("what changed", () => {
  it("says which prices and quantities moved, and what was added or removed", () => {
    const before = snap([
      ['5/8" Rebar', 75, "ea", 0],
      ["Concrete", 28, "cy", 147],
      ["Wire mesh", 32, "ea", 12],
    ]);
    const after = snap([
      ['5/8" Rebar', 75, "ea", 11.05],
      ["Concrete", 31, "cy", 147],
      ["Vapor barrier", 2, "roll", 80],
    ]);
    assert.deepEqual(detailChanges(before, after), ['5/8" Rebar: $0.00 → $11.05 / ea', "Concrete: 28 → 31 cy", "Added Vapor barrier (2 roll)", "Removed Wire mesh"]);
    assert.deepEqual(detailChanges(null, after), []); // no snapshot yet: just the totals
  });

  it("keeps where a line started until you save, and drops lines that went back", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    let note = mergeNote(null, [{ key: "a", name: "Foundation Material", from: 12464, to: 13293, details: ["rebar"] }], now);
    note = mergeNote(note, [{ key: "a", name: "Foundation Material", from: 13293, to: 13400, details: ["concrete"] }], now);
    assert.equal(note?.lines[0].from, 12464);
    assert.equal(note?.lines[0].to, 13400);
    assert.deepEqual(note?.lines[0].details, ["rebar", "concrete"]);
    const back = mergeNote(null, [{ key: "b", name: "Drywall", from: 100, to: 100, details: [] }], now);
    assert.equal(back, null);
  });
});
