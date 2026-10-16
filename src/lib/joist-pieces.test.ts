import { test } from "node:test";
import assert from "node:assert/strict";
import { bayKeys, boardCost, joistPieces, sizePieces, wholeIsCheaper } from "./joist-pieces";
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
  assert.deepEqual(whole, [{ a: 0, b: 1, spanFt: 30, lengthFt: 30, from: "edge", to: "edge" }]);
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
  // The joist on the wall takes the size of the piece beside it at the same spot: 2x8, then 2x10.
  assert.deepEqual(sizePieces(pieces, sizeFor), [
    ["2x8", "2x10"],
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

test("each piece knows its bay — the walls on its two sides — and a wall you run through doesn't cut it", () => {
  const walls: [Pt, Pt][] = [wallAt(10), wallAt(20)];
  const keys = ["wall-a", "wall-b"];
  const broken = joistPieces(cond(), shape(floor()), UPF, walls, { keys }).pieces[0];
  assert.deepEqual(
    broken.map((p) => [p.from, p.to]),
    [
      ["edge", "wall-a"],
      ["wall-a", "wall-b"],
      ["wall-b", "edge"],
    ],
  );
  // Run through wall-a: one board from the edge to wall-b — still held up at wall-a (10' span, not 20').
  const through = joistPieces(cond(), shape(floor()), UPF, walls, { keys, through: ["wall-a"] }).pieces[0];
  assert.deepEqual(
    through.map((p) => [p.from, p.to]),
    [
      ["edge", "wall-b"],
      ["wall-b", "edge"],
    ],
  );
  assert.ok(Math.abs(through[0].spanFt - 10) < 1e-6, "its span is still 10' — the wall holds it up");
  assert.ok(Math.abs(through[0].lengthFt - (20 + 1.5 / 12)) < 1e-6, "one 20' board (plus its half lap at wall-b)");
});

test("a bay is a run of joists between the same walls at the same size — runs edge to edge each get their own", () => {
  const e = { from: "edge", to: "edge", a: 0, b: 1 };
  const split = [[e], [e], [{ from: "edge", to: "w", a: 0, b: 0.5 }, { from: "w", to: "edge", a: 0.5, b: 1 }], [e], [e]];
  const sizes = [["2x6"], ["2x6"], ["2x8", "2x8"], ["2x8"], ["2x8"]];
  assert.deepEqual(bayKeys(split, sizes), [["edge|edge|1"], ["edge|edge|1"], ["edge|w|1", "w|edge|1"], ["edge|edge|2"], ["edge|edge|2"]]);
  // Same walls but the table size changes partway: two bays.
  assert.deepEqual(bayKeys([[e], [e], [e]], [["2x6"], ["2x6"], ["2x8"]]), [["edge|edge|1"], ["edge|edge|1"], ["edge|edge|2"]]);
});

test("joists side by side between the same walls but not lined up (another room on the same long wall) are different bays", () => {
  // The office joist runs the left part, the pantry joist the right part — both edge to the same wall.
  const split = [[{ from: "edge", to: "w", a: 0, b: 0.3 }], [{ from: "edge", to: "w", a: 0.6, b: 1 }]];
  assert.deepEqual(bayKeys(split, [["2x8"], ["2x8"]]), [["edge|w|1"], ["edge|w|2"]]);
});

test("joists ending on different stretches of one jogging wall are different bays (Bryant's pantry)", () => {
  const split = [
    [{ from: "edge", to: "w", a: 0, b: 0.68 }],
    [{ from: "edge", to: "w", a: 0, b: 0.54 }],
    [{ from: "edge", to: "w", a: 0, b: 0.54 }],
  ];
  assert.deepEqual(bayKeys(split, [["2x6"], ["2x6"], ["2x6"]]), [["edge|w|1"], ["edge|w|2"], ["edge|w|2"]]);
});

test("a joist lying on a wall is still broken where walls cross it, and each piece takes the size beside it", () => {
  // A wall along the floor at 4' in (where a joist lies on it) and walls across it at 10' and 20'.
  const along: [Pt, Pt] = [
    [-12, 48],
    [372, 48],
  ];
  const { members, pieces } = joistPieces(cond(), shape(floor()), UPF, [along, wallAt(10), wallAt(20)], { keys: ["along", "a", "b"] });
  const i = members.findIndex(([p]) => Math.abs(p[1] - 48) < 4);
  assert.ok(i >= 0, "a joist lies on the wall");
  assert.deepEqual(
    pieces[i].map((p) => [p.from, p.to, p.spanFt]),
    [
      ["edge", "a", 0],
      ["a", "b", 0],
      ["b", "edge", 0],
    ],
    "broken at the cross walls, no span of its own",
  );
  const sizes = sizePieces(pieces, (span) => (span > 9.5 ? "2x8" : "2x6"));
  const next = i > 0 ? i - 1 : i + 1;
  assert.deepEqual(sizes[i], sizes[next], "each piece the size of the joist beside it there");
});
