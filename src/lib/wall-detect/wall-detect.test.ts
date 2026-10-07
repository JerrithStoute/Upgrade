/**
 * The wall finder on a small made-up floor plan. Run with `npm test`.
 * Scale: 12 page units per foot, so 1 unit = 1 inch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findWalls, type Pt } from "./index";

const UPF = 12;
const opts = { unitsPerFoot: UPF, clickRadius: 3 };

/** A 40' × 30' house: 6" exterior walls (a 3' door in the bottom wall), a 4½" interior wall, a dimension line. */
function house(splitTop = false) {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  // Exterior, outside face — the top drawn in pieces when asked (CAD exports often do).
  if (splitTop) {
    line(0, 0, 150, 0);
    line(150, 0, 320, 0);
    line(320, 0, 480, 0);
  } else line(0, 0, 480, 0);
  line(480, 0, 480, 360);
  line(480, 360, 236, 360); // bottom, right of the door
  line(200, 360, 0, 360); // bottom, left of the door
  line(0, 360, 0, 0);
  // Exterior, inside face.
  line(6, 6, 474, 6);
  line(474, 6, 474, 354);
  line(474, 354, 236, 354);
  line(200, 354, 6, 354);
  line(6, 354, 6, 6);
  // Door jambs.
  line(200, 354, 200, 360);
  line(236, 354, 236, 360);
  // A 4½" interior wall, face to face.
  line(240, 6, 240, 354);
  line(244.5, 6, 244.5, 354);
  // A dimension line 2' below the house, and its ticks.
  line(0, 384, 480, 384);
  line(0, 380, 0, 388);
  line(480, 380, 480, 388);
  return segs;
}

/**
 * A 40' × 30' house drawn the way CAD plans layer walls (1 unit = 1 inch):
 *  - outside walls: 3½" stud space, sheathing and siding lines outside, drywall inside — but the
 *    right wall has brick veneer (a hatched 3½" band) instead of siding;
 *  - inside walls: 3½" stud space with drywall both sides — one up the middle, one across the
 *    left half with a 3' door next to the corner (a 4" return, then the opening);
 *  - a counter off the middle wall: a solid edge and a dashed line 3½" apart.
 */
function layeredHouse() {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  const h = (y: number, x1: number, x2: number) => line(x1, y, x2, y);
  const v = (x: number, y1: number, y2: number) => line(x, y1, x, y2);
  // Outside walls: stud faces on 0…480 × 0…360, drywall ½" in.
  const across: [number, number, number][] = [
    [0, 0, 480],
    [3.5, 3.5, 476.5],
    [4, 4, 476], // top
    [360, 0, 480],
    [356.5, 3.5, 476.5],
    [356, 4, 476], // bottom
    // Sheathing and siding outside the top and bottom.
    [-1, -1, 481],
    [-1.5, -1.5, 481],
    [361, -1, 481],
    [361.5, -1.5, 481],
  ];
  const upDown: [number, number, number][] = [
    [0, 0, 360],
    [3.5, 3.5, 356.5],
    [4, 4, 356], // left
    [480, 0, 360],
    [476.5, 3.5, 356.5],
    [476, 4, 356], // right
    [-1, -1, 361],
    [-1.5, -1.5, 361.5], // sheathing and siding outside the left
    [480.5, -1, 361],
    [481.5, -1, 361],
    [485, -1, 361], // brick on the right: sheathing, an air space, a 3½" band…
    [238, 4, 356],
    [238.5, 4, 356],
    [242, 4, 356],
    [242.5, 4, 356], // the middle wall, drywall both sides
    [8, 180, 184.5],
    [44, 180, 184.5], // jambs: the cross wall closed at the door
  ];
  // The wall across the left half at y 180…184.5: a 4" return off the outside wall, a 3' door, the rest.
  for (const y of [180, 180.5, 184, 184.5]) across.push([y, 4, 8], [y, 44, 238]);
  for (const [y, x1, x2] of across) h(y, x1, x2);
  for (const [x, y1, y2] of upDown) v(x, y1, y2);
  // …hatched.
  for (let y = 0; y + 3.5 <= 360; y += 4) line(481.5, y, 485, y + 3.5);
  // The counter: a solid edge, and a dashed line (upper cabinets) 3½" off it.
  h(28, 242.5, 400);
  for (let x = 242.5; x < 400; x += 4) h(31.5, x, x + 2);
  return segs;
}

const runLength = (runs: Pt[][]) => runs.reduce((sum, r) => sum + r.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - r[i][0], p[1] - r[i][1]), 0), 0);

describe("wall finder", () => {
  it("one click on the outside wall finds all four, center line, across the door", () => {
    const r = findWalls(house(), [100, 0.5], opts);
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 6);
    // Center line of a 40' × 30' house with 6" walls: 2 × (39'-6" + 29'-6") = 138'.
    assert.ok(Math.abs(r.lengthFt - 138) < 0.1, `found ${r.lengthFt} ft`);
    assert.ok(Math.abs(runLength(r.runs) / UPF - 138) < 0.1);
    // It doesn't pick up the interior wall (thinner) or the dimension line.
    assert.ok(r.runs.every((run) => run.every(([x]) => Math.abs(x - 242.25) > 1)));
  });

  it("finds the walls even when a face is drawn in pieces", () => {
    const r = findWalls(house(true), [100, 0.5], opts);
    assert.ok(r.ok);
    assert.ok(Math.abs(r.lengthFt - 138) < 0.1, `found ${r.lengthFt} ft`);
  });

  it("a click on the interior wall finds just it, face to face (29')", () => {
    const r = findWalls(house(), [240.5, 100], opts);
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 4.5);
    assert.equal(r.runs.length, 1);
    assert.ok(Math.abs(r.lengthFt - 29) < 0.1, `found ${r.lengthFt} ft`);
  });

  it("outside walls (siding or brick alongside) come by themselves; brick isn't a wall", () => {
    // Clicked on the siding, the drywall, the brick: the same answer.
    for (const click of [
      [100, -1.5],
      [100, 4],
      [485, 100],
      [478, 200],
    ] as Pt[]) {
      const r = findWalls(layeredHouse(), click, opts);
      assert.ok(r.ok, `click ${click}`);
      assert.equal(r.kind, "exterior");
      assert.equal(r.thicknessIn, 3.5);
      // Four walls, each its own line, on the stud space's center line: 2 × (39'-8½" + 29'-8½").
      assert.equal(r.runs.length, 4);
      assert.ok(r.runs.every((run) => run.length === 2));
      assert.ok(Math.abs(r.lengthFt - 1666 / 12) < 0.1, `click ${click}: found ${r.lengthFt} ft`);
      // Nothing out at the brick, nothing inside.
      assert.ok(r.runs.every((run) => run.every(([x, y]) => x < 480 && y < 360 && (x < 4 || x > 476 || y < 4 || y > 356))));
    }
  });

  it("inside walls come by themselves, across the door by the corner, without the counter", () => {
    const r = findWalls(layeredHouse(), [238, 100], opts);
    assert.ok(r.ok);
    assert.equal(r.kind, "interior");
    assert.equal(r.openings, 1);
    // The middle wall face to face with the outside walls (353"), the cross wall from the outside
    // wall's face to the middle wall's center, door and all (236¾").
    assert.ok(Math.abs(r.lengthFt - (353 + 236.75) / 12) < 0.1, `found ${r.lengthFt} ft`);
    assert.ok(r.runs.every((run) => run.every(([, y]) => y > 3 && y < 357)));
    assert.ok(
      r.runs.every((run) => run.every(([x, y]) => !(x > 243 && y > 20 && y < 40))),
      "the counter isn't a wall",
    );
  });

  it("says why when there's nothing to find", () => {
    assert.deepEqual(findWalls(house(), [300, 200], opts), { ok: false, reason: "no-line" });
    assert.deepEqual(findWalls(house(), [100, 384], opts), { ok: false, reason: "no-wall" });
    assert.deepEqual(findWalls(house(), [100, 0], { ...opts, unitsPerFoot: 0 }), { ok: false, reason: "no-scale" });
  });
});
