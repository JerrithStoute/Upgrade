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

/**
 * A brick house with a bump-out, drawn plainly (1 unit = 1 inch): each stud wall just its two faces
 * 3½" apart, brick a hatched 6" band 2" outside (wider than the wall — it needn't match). The bump
 * (right half, 10' further up) has its left wall on the same line as the inside wall between the
 * two rooms below: outside wall for the bump's 10', inside wall from there down.
 */
function brickBumpHouse() {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  const h = (y: number, x1: number, x2: number) => line(x1, y, x2, y);
  const v = (x: number, y1: number, y2: number) => line(x, y1, x, y2);
  // Stud walls.
  v(0, 0, 360);
  v(3.5, 3.5, 356.5); // left
  h(360, 0, 480);
  h(356.5, 3.5, 476.5); // bottom
  h(0, 0, 238);
  h(3.5, 3.5, 238); // top of the left half
  v(238, -120, 356.5);
  v(241.5, -116.5, 356.5); // the bump's left wall, on down between the rooms
  h(-120, 238, 480);
  h(-116.5, 241.5, 476.5); // the bump's top
  v(480, -120, 360);
  v(476.5, -116.5, 356.5); // right
  // Brick: a 6" band, hatched every 4".
  const vBand = (a: number, y1: number, y2: number) => {
    v(a, y1, y2);
    v(a + 6, y1, y2);
    for (let y = y1; y + 6 <= y2; y += 4) line(a, y, a + 6, y + 6);
  };
  const hBand = (a: number, x1: number, x2: number) => {
    h(a, x1, x2);
    h(a + 6, x1, x2);
    for (let x = x1; x + 6 <= x2; x += 4) line(x, a, x + 6, a + 6);
  };
  vBand(-8, 0, 360); // left
  hBand(362, -8, 488); // bottom
  hBand(-8, 0, 230); // top of the left half
  vBand(230, -128, -8); // the bump's left
  hBand(-128, 230, 488); // the bump's top
  vBand(482, -128, 368); // right
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

  it("brick wider than the wall still makes it an outside wall — all the way round the bump", () => {
    const r = findWalls(brickBumpHouse(), [1.75, 200], opts);
    assert.ok(r.ok);
    assert.equal(r.kind, "exterior");
    assert.equal(r.thicknessIn, 3.5);
    // The bump's left wall is in it — but only the bump's 10', not on down between the rooms.
    const bumpLeft = r.runs.filter((run) => run.every(([x]) => Math.abs(x - 239.75) < 0.5));
    assert.equal(bumpLeft.length, 1, "the bump's left wall");
    assert.ok(bumpLeft[0].every(([, y]) => y < 4), `bump's left wall: ${JSON.stringify(bumpLeft[0])}`);
    // Round the outside on the center line: left 356½, bottom 476½, right 476½ (the bump's 10' too),
    // the bump's top 238½ and left 120, the left half's top 238 — 1906".
    assert.ok(Math.abs(r.lengthFt - 1906 / 12) < 0.1, `found ${r.lengthFt} ft`);
  });

  it("the inside wall on the bump's line stops where the bump starts", () => {
    const r = findWalls(brickBumpHouse(), [238, 200], opts);
    assert.ok(r.ok);
    assert.equal(r.kind, "interior");
    assert.ok(r.runs.every((run) => run.every(([, y]) => y > -1)), `went up into the bump: ${JSON.stringify(r.runs)}`);
  });

  it("a door between two short returns off 2x6 walls is bridged", () => {
    // A 2x4 wall (faces x 100 / 103.5) down from y 0 to 260. A 2x6 wall comes in from the left at
    // y 100…105.5; then a 6½" return, a 2'-8" door (jambs at 112 and 144), a 1' return, and a 2x6
    // wall going off to the right at 156…161.5.
    const segs: number[] = [];
    const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
    line(103.5, 0, 103.5, 112); // right face, above the door
    line(103.5, 144, 103.5, 156);
    line(103.5, 161.5, 103.5, 260); // right face below the door and the cross wall
    line(100, 0, 100, 100);
    line(100, 105.5, 100, 112);
    line(100, 144, 100, 260); // left face, around the 2x6 wall and the door
    line(0, 100, 100, 100);
    line(0, 105.5, 100, 105.5); // the 2x6 wall
    line(103.5, 156, 300, 156);
    line(103.5, 161.5, 300, 161.5); // the 2x6 wall to the right
    line(100, 112, 103.5, 112);
    line(100, 144, 103.5, 144); // jambs
    const r = findWalls(segs, [100, 50], opts);
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 3.5);
    const down = r.runs.filter((run) => run.every(([x]) => Math.abs(x - 101.75) < 0.5));
    assert.ok(
      down.some((run) => Math.min(...run.map(([, y]) => y)) < 112 && Math.max(...run.map(([, y]) => y)) > 144),
      `the door isn't bridged: ${JSON.stringify(down)}`,
    );
  });

  it("a click just past the end of a wall says there's no wall there (it used to break)", () => {
    // One face ends at x 100, the other runs on to 120; the click is just past the shorter one's end —
    // it's the nearest line, but it doesn't reach across there.
    const wall = [0, 0, 120, 0, 0, 3.5, 100, 3.5];
    assert.deepEqual(findWalls(wall, [105, 6], { ...opts, clickRadius: 10 }), { ok: false, reason: "no-wall" });
  });

  it("a wall with stone drawn 2\" off both faces is the 5½\" wall behind the stone — whichever line you click", () => {
    // Bryant's 2nd-floor porch: an 8' stone-wrapped wall (stone outline 2" off each face), drawn bold
    // (each face two lines ½" apart), closed at both ends.
    const segs: number[] = [];
    const v = (x: number) => segs.push(x, 0, x, 96);
    v(-2); // stone outline
    v(0);
    v(0.5); // face (bold)
    v(6);
    v(6.5); // other face (bold)
    v(8.5); // stone outline
    segs.push(-2, 0, 8.5, 0, -2, 96, 8.5, 96); // closed ends
    for (const x of [-2, 0.25, 6.25, 8.5]) {
      const r = findWalls(segs, [x, 48], opts);
      assert.ok(r.ok, `click at ${x}`);
      assert.equal(r.thicknessIn, 5.5, `click at ${x}`);
      assert.equal(r.kind, "exterior", `click at ${x}`);
    }
  });

  it("a thin gap beside a real wall is still a wall when nothing wider is there (Stoute's 2¾\" walls)", () => {
    const segs = [0, 0, 0, 96, 2.75, 0, 2.75, 96, 0, 0, 2.75, 0, 0, 96, 2.75, 96];
    const r = findWalls(segs, [0, 48], opts);
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 2.75);
  });

  it("says why when there's nothing to find", () => {
    assert.deepEqual(findWalls(house(), [300, 200], opts), { ok: false, reason: "no-line" });
    assert.deepEqual(findWalls(house(), [100, 384], opts), { ok: false, reason: "no-wall" });
    assert.deepEqual(findWalls(house(), [100, 0], { ...opts, unitsPerFoot: 0 }), { ok: false, reason: "no-scale" });
  });
});
