import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAlign, type Pt } from "./revisions";
import { middleOf, parseUpperFloor, pickFloor, placedWalls, placement, snapPlacement } from "./upper-floor";

// Two floors drawn side by side on one page: a 40×30 box at the left (the 1st floor) and a 30×30
// box at the right (the floor above), with an interior wall inside it that doesn't touch the outside.
const box = (x: number, y: number, w: number, h: number): Pt[][] => [
  [
    [x, y],
    [x + w, y],
  ],
  [
    [x + w, y],
    [x + w, y + h],
  ],
  [
    [x + w, y + h],
    [x, y + h],
  ],
  [
    [x, y + h],
    [x, y],
  ],
];
const first = box(0, 0, 40, 30);
const upperOuter = box(100, 0, 30, 30);
const upperInner: Pt[] = [
  [115, 2],
  [115, 28],
];
const page = [...first, ...upperOuter, upperInner];

test("clicking one wall of the floor above picks that floor — its outside walls and the walls inside it", () => {
  const floor = pickFloor(page, [130, 15], 1, 0.75)!;
  assert.equal(floor.length, 5);
  assert.ok(floor.includes(upperInner));
  assert.ok(!floor.some((w) => first.includes(w)));
  assert.equal(pickFloor(page, [70, 15], 1, 0.75), null); // no wall there
});

test("placing puts its middle where the pointer is, at the other sheet's scale, turned in quarter turns", () => {
  const walls = upperOuter;
  const al = placement(walls, 2, 0, [10, 10]);
  const mid = applyAlign(al, middleOf(walls));
  assert.ok(Math.abs(mid[0] - 10) < 1e-9 && Math.abs(mid[1] - 10) < 1e-9);
  const placed = placedWalls(walls, al).flat();
  assert.equal(Math.max(...placed.map((p) => p[0])) - Math.min(...placed.map((p) => p[0])), 60); // twice as big
  const turned = placement(walls, 1, 1, [0, 0]);
  assert.deepEqual([turned.a, turned.b], [0, 1]);
});

test("it snaps when a corner comes close to this floor's corner", () => {
  // The 30×30 floor above, its corner 0.4 off the 1st floor's corner at (40, 0).
  const al = placement(upperOuter, 1, 0, [55.4, 15.3]); // middle → corners at (40.4, 0.3)…
  const s = snapPlacement(al, upperOuter, first, 1);
  assert.deepEqual(s.snapped, [40, 0]);
  const corners = placedWalls(upperOuter, s.align).flat();
  assert.ok(corners.some((p) => Math.abs(p[0] - 40) < 1e-9 && Math.abs(p[1]) < 1e-9));
  // Far away: left where it is.
  const far = placement(upperOuter, 1, 0, [200, 200]);
  assert.equal(snapPlacement(far, upperOuter, first, 1).snapped, null);
});

test("a saved floor above is read back, and anything broken is ignored", () => {
  const saved = { sourceSheetId: "s1", walls: upperOuter, align: { a: 1, b: 0, tx: -60, ty: 0 } };
  assert.deepEqual(parseUpperFloor(JSON.stringify(saved)), saved);
  assert.equal(parseUpperFloor("nope"), null);
  assert.equal(parseUpperFloor(JSON.stringify({ ...saved, walls: [] })), null);
});
