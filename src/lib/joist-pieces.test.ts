import { test } from "node:test";
import assert from "node:assert/strict";
import { boardCost, joistPieces, sizePieces, wholeIsCheaper } from "./joist-pieces";
import type { Pt } from "./takeoff";

// 1 page unit = 1 inch (12 per foot). A floor 30' long (joists run along it), 8' wide, 16" o.c.
const UPF = 12;
const floor = (lengthFt = 30): Pt[] => [
  [0, 0],
  [lengthFt * 12, 0],
  [lengthFt * 12, 96],
  [0, 96],
];
const cond = (more: Partial<{ overhang: number; pitch: number; options: string | null }> = {}) => ({ type: "FRAMING", spacing: 16, overhang: 0, pitch: 0, memberSize: "2x10", memberWidthIn: 1.5, options: null, ...more });
const shape = (pts: Pt[]) => ({ points: pts, arcs: [], angle: 0, pitch: null });
const wallAt = (xFt: number): [Pt, Pt] => [
  [xFt * 12, -12],
  [xFt * 12, 108],
];

test("a 30' run with a wall at 14' is a 14' piece and a 16' piece, lapped 3\" over the wall", () => {
  const { members, pieces } = joistPieces(cond(), shape(floor()), UPF, [wallAt(14)]);
  assert.ok(members.length > 3);
  for (const row of pieces) {
    assert.equal(row.length, 2);
    assert.ok(Math.abs(row[0].spanFt - 14) < 1e-6 && Math.abs(row[1].spanFt - 16) < 1e-6, JSON.stringify(row));
    // Each runs 1-1/2" past the wall's center: 14' 1-1/2" and 16' 1-1/2".
    assert.ok(Math.abs(row[0].lengthFt - (14 + 1.5 / 12)) < 1e-6);
    assert.ok(Math.abs(row[1].lengthFt - (16 + 1.5 / 12)) < 1e-6);
    assert.ok(Math.abs(row[0].b - 14 / 30) < 1e-6 && row[0].a === 0 && row[1].b === 1);
  }
});

test("the lap is yours to set; no walls, no break", () => {
  const six = joistPieces(cond({ options: JSON.stringify({ lapIn: 6 }) }), shape(floor()), UPF, [wallAt(14)]).pieces[0];
  assert.ok(Math.abs(six[0].lengthFt - 14.25) < 1e-6 && Math.abs(six[1].lengthFt - 16.25) < 1e-6);
  const whole = joistPieces(cond(), shape(floor()), UPF, []).pieces[0];
  assert.deepEqual(whole, [{ a: 0, b: 1, spanFt: 30, lengthFt: 30 }]);
});

test("a wall near the end doesn't make a short piece — the joist runs on past it", () => {
  // The area drawn to the outside of the walls: the wall's center is 2" in from each end, and a
  // bearing wall 2' in (a cantilever).
  const row = joistPieces(cond(), shape(floor()), UPF, [
    [
      [2, -12],
      [2, 108],
    ],
    wallAt(2),
    wallAt(14),
  ]).pieces[0];
  assert.equal(row.length, 2);
  assert.ok(Math.abs(row[0].b - 14 / 30) < 1e-6, "breaks only at the 14' wall");
  assert.ok(Math.abs(row[0].spanFt - 12) < 1e-6, "its span is 2' to 14' — the cantilevered end isn't span");
});

test("overhang goes on the outside ends; pitch makes each piece longer", () => {
  const row = joistPieces(cond({ overhang: 24, pitch: 12 }), shape(floor()), UPF, [wallAt(14)]).pieces[0];
  const f = Math.SQRT2; // 12/12
  assert.ok(Math.abs(row[0].lengthFt - (14 + 1.5 / 12 + 1) * f) < 1e-6);
  assert.ok(Math.abs(row[1].lengthFt - (16 + 1.5 / 12 + 1) * f) < 1e-6);
});

test("each piece sized for its own span; a joist on a wall takes its neighbor's size", () => {
  const sizeFor = (span: number) => (span <= 14 ? "2x8" : "2x10");
  const pieces = [
    [
      { a: 0, b: 0.5, spanFt: 0, lengthFt: 1 },
      { a: 0.5, b: 1, spanFt: 0, lengthFt: 1 },
    ],
    [
      { a: 0, b: 0.47, spanFt: 14, lengthFt: 14 },
      { a: 0.47, b: 1, spanFt: 16, lengthFt: 16 },
    ],
  ];
  assert.deepEqual(sizePieces(pieces, sizeFor), [
    ["2x8", "2x8"],
    ["2x8", "2x10"],
  ]);
});

test("a board's cost: the cheapest priced length that holds it — never a guess", () => {
  const f = { stockLengths: "8-24", soldAs: "STOCK", lengthPrices: { 10: 9, 16: 14, 18: 17, 20: 18 } };
  assert.equal(boardCost(9.5, f), 9, "10' holds it");
  assert.equal(boardCost(14.1, f), 14, "16' is the shortest priced length that holds it");
  assert.equal(boardCost(18.1, f), 18, "the 20'");
  assert.equal(boardCost(20.5, f), null, "22' and 24' aren't priced: no guess");
  assert.equal(boardCost(28, f), null, "longer than you buy: no one board");
  assert.equal(boardCost(10, { ...f, soldAs: "EXACT_LF" }), null);
  assert.equal(boardCost(10, { stockLengths: "8-24", lengthPrices: null }), null);
});

test("one continuous board over the wall only when it costs less than the pieces — and every board is priced", () => {
  // A 28' run with a wall at 18': 2x10 18' $17 + 10' $9 = $26, against a 28' at $40 or $24.
  assert.equal(wholeIsCheaper([17, 9], 40), false);
  assert.equal(wholeIsCheaper([17, 9], 24), true);
  assert.equal(wholeIsCheaper([17, null], 24), false, "a piece isn't priced: stays broken at the wall");
  assert.equal(wholeIsCheaper([17, 9], null), false, "the long board isn't priced (or not sold that long)");
});
