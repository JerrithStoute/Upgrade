import { test } from "node:test";
import assert from "node:assert/strict";
import { withLengthSubstitutions } from "./length-subs";
import { DEFAULT_WALL_OPTIONS, packBoards, parseOptions, parseStockLengths } from "./takeoff";

const wall = (o: Partial<typeof DEFAULT_WALL_OPTIONS>) => ({
  type: "WALL",
  memberSize: "2x4",
  stockLengths: null,
  packLength: null,
  options: JSON.stringify({ ...DEFAULT_WALL_OPTIONS, ...o }),
});

test("a length substitution reaches the walls' own plates (\"2x4 treated × 18'\" → 20')", () => {
  const [c] = withLengthSubstitutions(
    [wall({ treatedBottom: true, bottomPlateStock: "16, 18", topPlateStock: "16, 18" })],
    [{ size: "2x4 treated", fromLen: 18, toLen: 20 }],
  );
  const o = parseOptions(c.options, DEFAULT_WALL_OPTIONS);
  assert.equal(o.bottomPlateStock, "16,20", "the treated bottom plate");
  assert.equal(o.topPlateStock, "16, 18", "the top plate is untreated 2x4 — left alone");
  // A 17' wall's bottom plate is now cut from a 20'.
  assert.deepEqual(packBoards([17], parseStockLengths(o.bottomPlateStock)).cutList, [[20, 1]]);
});

test("studs cut from stock follow it too; precut studs and other sizes don't", () => {
  const subs = [{ size: "2x4", fromLen: 10, toLen: 12 }];
  const cut = parseOptions(withLengthSubstitutions([wall({ studPrecut: false, studLengthIn: 120 })], subs)[0].options, DEFAULT_WALL_OPTIONS);
  assert.equal(cut.studLengthIn, 144);
  const precut = withLengthSubstitutions([wall({ studPrecut: true, studLengthIn: 120 })], subs)[0];
  assert.equal(parseOptions(precut.options, DEFAULT_WALL_OPTIONS).studLengthIn, 120);
  const other = withLengthSubstitutions([wall({ treatedBottom: true, bottomPlateStock: "18" })], [{ size: "2x6 treated", fromLen: 18, toLen: 20 }])[0];
  assert.equal(parseOptions(other.options, DEFAULT_WALL_OPTIONS).bottomPlateStock, "18");
});
