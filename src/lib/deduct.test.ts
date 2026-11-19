import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cutArea, cutLine, withoutExisting } from "./deduct";
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
