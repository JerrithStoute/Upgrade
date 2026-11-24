import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cutArea, cutLine, mergeAreas, withoutExisting } from "./deduct";
import type { Pt } from "./takeoff";

const sq: Pt[] = [
  [0, 0],
  [100, 0],
  [100, 60],
  [0, 60],
];

describe("deducting", () => {
  it("cuts a hole, a bite off the edge, or the area in two — nothing when it doesn't overlap", () => {
    const hole = cutArea(sq, [], [
      [40, 20],
      [60, 20],
      [60, 40],
      [40, 40],
    ]);
    assert.equal(hole?.length, 1);
    assert.equal(hole![0].points.length, 4);
    assert.equal(hole![0].holes.length, 1);
    const bite = cutArea(sq, [], [
      [80, -10],
      [120, -10],
      [120, 30],
      [80, 30],
    ]);
    assert.equal(bite?.length, 1);
    assert.equal(bite![0].points.length, 6);
    assert.equal(
      cutArea(sq, [], [
        [40, -10],
        [60, -10],
        [60, 70],
        [40, 70],
      ])?.length,
      2,
    );
    assert.deepEqual(
      cutArea(sq, [], [
        [-1, -1],
        [101, -1],
        [101, 61],
        [-1, 61],
      ]),
      [],
    );
    // Only touching along an edge: not deducted from.
    assert.equal(
      cutArea(sq, [], [
        [100, 0],
        [150, 0],
        [150, 60],
        [100, 60],
      ]),
      null,
    );
  });

  it("takes the stretch a deduction runs along out of a wall line", () => {
    const wall: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 60],
    ];
    assert.deepEqual(
      cutLine(
        wall,
        [
          [30, 1],
          [60, 1],
        ],
        3,
      ),
      [
        [
          [0, 0],
          [30, 0],
        ],
        [
          [60, 0],
          [100, 0],
          [100, 60],
        ],
      ],
    );
    assert.equal(
      cutLine(
        wall,
        [
          [30, 20],
          [60, 20],
        ],
        3,
      ),
      null,
    );
  });
});

describe("withoutExisting", () => {
  it("leaves out walls already measured, keeps the new ones", () => {
    const existing: Pt[][] = [[[0, 0], [100, 0]]];
    // Same wall again + a new wall off its end.
    assert.deepEqual(withoutExisting([[[0, 0], [100, 0], [100, 50]]], existing, 3, 2), [[[100, 0], [100, 50]]]);
    assert.deepEqual(withoutExisting([[[0, 0], [100, 0]]], existing, 3, 2), []);
  });
});

describe("merging two areas", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const sq = (pts: [number, number][]) => Math.abs(pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2;
  it("joins two rooms that share an edge into one, the shared edge gone", () => {
    const m = mergeAreas({ points: box(0, 0, 10, 10) }, { points: box(10, 0, 20, 10) }, 0.5);
    assert.ok(m);
    assert.equal(Math.round(sq(m!.points)), 200);
  });
  it("joins at a doorway, the wall beside it left out", () => {
    // A room 0–10 and one 10.5–20 (a wall 0.5 thick between), joined by a doorway strip from y 4 to 6.
    const b2: [number, number][] = [[10, 4], [10.5, 4], [10.5, 0], [20, 0], [20, 10], [10.5, 10], [10.5, 6], [10, 6]];
    const m = mergeAreas({ points: box(0, 0, 10, 10) }, { points: b2 }, 0.5);
    assert.equal(Math.round(sq(m!.points) * 10) / 10, 196);
  });
  it("fills a hair's gap between them", () => {
    const m = mergeAreas({ points: box(0, 0, 10, 10) }, { points: box(10.1, 0, 20, 10) }, 0.5);
    assert.ok(m);
    assert.equal(Math.round(sq(m!.points)), 200);
  });
  it("won't merge areas farther apart than the gap", () => {
    assert.equal(mergeAreas({ points: box(0, 0, 10, 10) }, { points: box(12, 0, 20, 10) }, 0.5), null);
  });
  it("keeps a deduction (hole) in either", () => {
    const m = mergeAreas({ points: box(0, 0, 10, 10), holes: [box(2, 2, 4, 4)] }, { points: box(10, 0, 20, 10) }, 0.5);
    assert.equal(m!.holes.length, 1);
  });
  // A wall 0.5 thick between two rooms (faces at x 10 and 10.5), 1 unit = 10" (inch 0.1).
  const faces = (gapFrom: number, gapTo: number) => [
    ...[10, 10.5].flatMap((x) => (gapFrom < gapTo ? [x, 0, x, gapFrom, x, gapTo, x, 10] : [x, 0, x, 10])),
  ];
  it("doesn't touch: joins through the doorway in the wall between, jamb to jamb", () => {
    const m = mergeAreas({ points: box(0, 0, 10, 10) }, { points: box(10.5, 0, 20, 10) }, 0.1, { segments: faces(4, 6.5), wallGap: 1.2, inch: 0.1 });
    assert.ok(m);
    // 100 + 95 + the doorway's strip, 0.5 x 2.5
    assert.equal(Math.round(sq(m!.points) * 100) / 100, 195 + 0.5 * 2.5);
  });
  it("doesn't touch: a wide opening with a dashed header line across both faces still joins", () => {
    // Opening 2 to 8 (a 6' opening at 1 unit = 10"... wide), dashes 0.5 long with 0.25 gaps on both faces.
    const dashes = [10, 10.5].flatMap((x) => { const d: number[] = []; for (let y = 2; y < 8; y += 0.75) d.push(x, y, x, Math.min(8, y + 0.5)); return d; });
    const m = mergeAreas({ points: box(0, 0, 10, 10) }, { points: box(10.5, 0, 20, 10) }, 0.1, { segments: [...faces(2, 8), ...dashes], wallGap: 1.2, inch: 0.1 });
    assert.ok(m);
    assert.equal(Math.round(sq(m!.points) * 100) / 100, 195 + 0.5 * 6);
  });
  it("doesn't touch and only wall between: not merged (never through a wall)", () => {
    assert.equal(mergeAreas({ points: box(0, 0, 10, 10) }, { points: box(10.5, 0, 20, 10) }, 0.1, { segments: faces(0, 0), wallGap: 1.2, inch: 0.1 }), null);
  });
});
