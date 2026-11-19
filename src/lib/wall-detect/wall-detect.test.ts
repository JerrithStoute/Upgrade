/**
 * The wall finder on a small made-up floor plan. Run with `npm test`.
 * Scale: 12 page units per foot, so 1 unit = 1 inch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findWalls, type Pt } from "./index";
import { houseOutsideMap } from "../room-detect";

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

/**
 * A 40' × 30' house drawn the way some CAD plans hatch their walls (1 unit = 1 inch): the stud space
 * itself is filled with slanted hatching, like brick. Outside walls: drywall ½" in, a hatched stud
 * space (`stud` deep: 3½" for 2x4, 5½" for 2x6…), sheathing (two lines) outside, an air space, then a
 * hatched 3½" brick band with a bare outer face. An inside wall up the middle: a hatched 3½" stud space
 * with drywall both sides.
 */
function hatchedHouse(stud = 3.5) {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  // A rectangle d outside the stud faces (0…480 × 0…360); negative = inside.
  const rect = (d: number) => {
    line(-d, -d, 480 + d, -d);
    line(480 + d, -d, 480 + d, 360 + d);
    line(480 + d, 360 + d, -d, 360 + d);
    line(-d, 360 + d, -d, -d);
  };
  // Hatching between two rectangles (outer > inner offsets), a stroke every 1½".
  const hatch = (inner: number, outer: number) => {
    const w = outer - inner;
    for (let x = -inner; x + w <= 480 + inner; x += 1.5) {
      line(x, -inner, x + w, -outer);
      line(x, 360 + inner, x + w, 360 + outer);
    }
    for (let y = -inner; y + w <= 360 + inner; y += 1.5) {
      line(-inner, y, -outer, y + w);
      line(480 + inner, y, 480 + outer, y + w);
    }
  };
  for (const d of [-stud - 0.5, -stud, 0, 0.5, 1, 2.25, 5.75]) rect(d);
  hatch(-stud, 0); // the stud space
  hatch(2.25, 5.75); // the brick
  // The inside wall up the middle: drywall, a hatched stud space, drywall.
  const [top, bottom] = [stud + 0.5, 360 - stud - 0.5];
  for (const x of [237.5, 238, 241.5, 242]) line(x, top, x, bottom);
  for (let y = top; y + 3.5 <= bottom; y += 1.5) line(238, y, 241.5, y + 3.5);
  return segs;
}

/**
 * A 40' × 30' 2x4 house (sheathing and siding outside, 1 unit = 1 inch) with two corners framed 2x6 (a
 * plumbing wall round the corner — bottom left and top right, 5' each way): the outside faces run straight
 * on, the inside faces step in 2" there. One click on either size: that size all round, the other left out.
 */
function twoBySixCornersHouse() {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  const h = (y: number, x1: number, x2: number) => line(x1, y, x2, y);
  const v = (x: number, y1: number, y2: number) => line(x, y1, x, y2);
  // Outside faces, sheathing, siding all round.
  for (const o of [0, 0.8, 1]) {
    h(-o, -o, 480 + o);
    h(360 + o, -o, 480 + o);
    v(-o, -o, 360 + o);
    v(480 + o, -o, 360 + o);
  }
  // Inside faces: 2x4, stepping in to 2x6 for the two corners.
  h(3.5, 3.5, 420); // top, 2x4
  h(5.5, 420, 474.5); // top, 2x6 at the right corner
  v(474.5, 5.5, 60); // right, 2x6
  v(476.5, 60, 356.5); // right, 2x4
  h(356.5, 60, 476.5); // bottom, 2x4
  h(354.5, 5.5, 60); // bottom, 2x6 at the left corner
  v(5.5, 300, 354.5); // left, 2x6
  v(3.5, 3.5, 300); // left, 2x4
  // The steps.
  v(420, 3.5, 6);
  h(60, 474, 476.5);
  v(60, 354, 356.5);
  h(300, 3.5, 6);
  return segs;
}

/**
 * A 40' × 30' 2x4 house (1 unit = 1 inch) with a 16' × 10' covered porch cut into its bottom-right corner:
 * sheathing and siding drawn outside every wall but the porch's two (plain both sides, as plans draw them
 * under a porch roof). A plain 2x4 inside wall up the left side.
 */
function porchHouse() {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  const h = (y: number, x1: number, x2: number) => line(x1, y, x2, y);
  const v = (x: number, y1: number, y2: number) => line(x, y1, x, y2);
  // Outside faces, then inside faces.
  h(0, 0, 480);
  v(480, 0, 240);
  h(240, 288, 480);
  v(288, 240, 360);
  h(360, 0, 288);
  v(0, 0, 360);
  h(3.5, 3.5, 476.5);
  v(476.5, 3.5, 236.5);
  h(236.5, 284.5, 476.5);
  v(284.5, 236.5, 356.5);
  h(356.5, 3.5, 284.5);
  v(3.5, 3.5, 356.5);
  // Sheathing and siding — not on the porch's walls.
  for (const o of [0.8, 1]) {
    h(-o, -o, 480 + o);
    v(480 + o, -o, 240);
    h(360 + o, -o, 288);
    v(-o, -o, 360 + o);
  }
  // The inside wall.
  v(150, 3.5, 356.5);
  v(153.5, 3.5, 356.5);
  // The sheet's border, well out.
  h(-240, -240, 720);
  h(600, -240, 720);
  v(-240, -240, 600);
  v(720, -240, 600);
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

  it("the outside wall carries on past 2x6 framed into it — the 2x6 left out, one click all the way round", () => {
    const segs = twoBySixCornersHouse();
    // The 2x6 corners: their own size, both of them (stepping over the 2x4 between), nothing else.
    const six = findWalls(segs, [3, 330], opts);
    assert.ok(six.ok);
    assert.equal(six.thicknessIn, 5.5);
    assert.ok(Math.abs(six.lengthFt - 19.1) < 0.2, `2x6: found ${six.lengthFt} ft`);
    for (const click of [[200, 0.2], [200, 359.8], [0.2, 150], [479.8, 200]] as Pt[]) {
      const r = findWalls(segs, click, opts);
      assert.ok(r.ok, `click ${click}`);
      assert.equal(r.kind, "exterior");
      assert.equal(r.thicknessIn, 3.5);
      // All four 2x4 stretches, each from its 2x4 corner to where the 2x6 starts.
      const along = (x0: number, y0: number, x1: number, y1: number) =>
        r.runs.some((run) => run.every(([x, y]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1) && Math.hypot(run[1][0] - run[0][0], run[1][1] - run[0][1]) >= Math.max(x1 - x0, y1 - y0) - 6);
      assert.ok(along(1, 1, 420, 2.5), `click ${click}: top`);
      assert.ok(along(1, 1, 2.5, 300), `click ${click}: left`);
      assert.ok(along(477.5, 60, 479, 359), `click ${click}: right`);
      assert.ok(along(60, 357.5, 479, 359), `click ${click}: bottom`);
      // Nothing along the 2x6.
      assert.ok(r.runs.every((run) => run.every(([x, y]) => !(x < 58 && y > 302) && !(x > 422 && y < 58))), `click ${click}: nothing along the 2x6`);
    }
  });

  it("a porch's back walls (no siding drawn under the roof) are outside walls once the sheet's outside is known", () => {
    const segs = porchHouse();
    const onPorch = (r: { runs: Pt[][] }) => r.runs.some((run) => run.every(([x, y]) => x > 280 && y > 230));
    // Without it, they read as inside walls: the outside wall stops at the porch.
    const before = findWalls(segs, [200, 0.2], opts);
    assert.ok(before.ok && before.kind === "exterior");
    assert.ok(!onPorch(before));
    const outside = houseOutsideMap(segs, { unitsPerFoot: UPF });
    assert.ok(outside);
    for (const click of [[200, 0.2], [479.9, 100], [286, 300], [380, 238]] as Pt[]) {
      const r = findWalls(segs, click, { ...opts, outside });
      assert.ok(r.ok, `click ${click}`);
      assert.equal(r.kind, "exterior", `click ${click}`);
      assert.ok(onPorch(r), `click ${click}: the porch's walls`);
      // All the way round: 2 × (40' + 30') less the corners, center line.
      assert.ok(Math.abs(r.lengthFt - 138.8) < 1, `click ${click}: found ${r.lengthFt} ft`);
    }
    // The inside wall is still an inside wall, on its own.
    const inner = findWalls(segs, [150, 100], { ...opts, outside });
    assert.ok(inner.ok);
    assert.equal(inner.kind, "interior");
    assert.ok(Math.abs(inner.lengthFt - 29.4) < 0.5, `inside wall: ${inner.lengthFt} ft`);
  });

  it("an outside wall brings the house's outside walls along its outline — never another drawing's on the sheet", () => {
    // The porch house drawn twice side by side (the floor plan and the electrical plan), 20' apart; the left
    // one's right wall in two pieces with a 10' chimney between, 12" thick.
    const one = porchHouse().slice(0, -16);
    const segs: number[] = [];
    for (let i = 0; i < one.length; i += 4) {
      const [x1, y1, x2, y2] = one.slice(i, i + 4);
      // (The left house's right wall: split for the chimney.)
      if (x1 === x2 && (x1 === 480 || x1 === 476.5 || x1 === 480.8 || x1 === 481) && Math.min(y1, y2) <= 0 + 4 && Math.max(y1, y2) >= 236) {
        const lo = Math.min(y1, y2);
        const hi = Math.max(y1, y2);
        segs.push(x1, lo, x1, 60, x1, 180, x1, hi);
      } else segs.push(x1, y1, x2, y2);
      // (In the gap, a 12"-thick stretch — a chimney's masonry: the outside face carries on, the inside one steps in.)
      if (i === 0) segs.push(480, 60, 480, 180, 468, 60, 468, 180, 468, 60, 476.5, 60, 468, 180, 476.5, 180);
      segs.push(x1 + 720, y1, x2 + 720, y2);
    }
    for (const [x1, y1, x2, y2] of [[-240, -240, 1440, -240], [-240, 600, 1440, 600], [-240, -240, -240, 600], [1440, -240, 1440, 600]]) segs.push(x1, y1, x2, y2);
    const outside = houseOutsideMap(segs, { unitsPerFoot: UPF });
    assert.ok(outside);
    const r = findWalls(segs, [200, 0.2], { ...opts, outside });
    assert.ok(r.ok && r.kind === "exterior");
    // Nothing from the other drawing.
    assert.ok(r.runs.every((run) => run.every(([x]) => x < 600)), "only this drawing's walls");
    // The right wall's far piece, past the gap, comes too.
    assert.ok(r.runs.some((run) => run.every(([x]) => Math.abs(x - 478.25) < 3) && run.some(([, y]) => y > 200)), "the piece past the chimney");
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

  it("stone 2\" off the sheathed face makes it an outside wall; a tub drawn tight to an inside wall doesn't", () => {
    // Bryant's 1st-floor front: drywall alone inside (x 0), the stud face and sheathing ½" apart outside
    // (3.5, 4.1), stone outline 2" past that (6.4). A tub has the same lines up close — and its far edge
    // 20" on, boxed back to the wall. A dimension line out there (not boxed) changes nothing.
    const segs: number[] = [];
    for (const x of [0, 3.5, 4.1, 6.4]) segs.push(x, 0, x, 96);
    const dimension = [26.4, -20, 26.4, 120];
    for (const extra of [[], dimension]) {
      const outside = findWalls([...segs, ...extra], [0, 48], opts);
      assert.ok(outside.ok);
      assert.equal(outside.thicknessIn, 3.5);
      assert.equal(outside.kind, "exterior");
    }
    const tub = findWalls([...segs, 26.4, 10, 26.4, 86, 4.1, 10, 26.4, 10, 4.1, 86, 26.4, 86], [0, 48], opts);
    assert.ok(tub.ok);
    assert.equal(tub.kind, "interior");
  });

  it("slanted lines drawn twice over in a wall (a post at a column) aren't brick hatching", () => {
    // Bryant's dining wall: a 6' 2x6 with three slanted post lines, each drawn twice — it was
    // thrown out as six hatch strokes of brick.
    const segs = [0, 0, 72, 0, 0, 5.5, 72, 5.5];
    for (const x of [30, 40, 50]) segs.push(x, 0, x + 3, 5.5, x + 3, 5.5, x, 0);
    const r = findWalls(segs, [10, 0], opts);
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 5.5);
    assert.ok(Math.abs(r.lengthFt - 6) < 0.1, `length ${r.lengthFt}`);
  });

  it("on a plan that hatches its walls, the hatched stud space is the wall and the brick isn't — 2x4 to 2x10 (O'Quinn)", () => {
    for (const stud of [3.5, 5.5, 7.25, 9.25]) {
      // Clicked on the brick's outer face, the sheathing, the drywall, or right in the hatched band
      // (where the wall shows — among the strokes): the same four outside walls.
      for (const click of [
        [100, -5.75],
        [100, -1],
        [100, stud + 0.5],
        [480.5, 200],
        [100, stud / 2],
        [-stud / 2, 200],
      ] as Pt[]) {
        const r = findWalls(hatchedHouse(stud), click, opts);
        assert.ok(r.ok, `${stud}" stud, click ${click}`);
        assert.equal(r.kind, "exterior", `${stud}" stud, click ${click}`);
        assert.equal(r.thicknessIn, stud);
        assert.equal(r.runs.length, 4);
        // On the stud space's center line: 2 × ((40' − stud) + (30' − stud)).
        const want = (2 * (480 - stud + 360 - stud)) / 12;
        assert.ok(Math.abs(r.lengthFt - want) < 0.1, `${stud}" stud, click ${click}: found ${r.lengthFt} ft, want ${want}`);
        assert.ok(r.runs.every((run) => run.every(([x, y]) => x > 0 && y > 0 && x < 480 && y < 360)));
      }
    }
    // The inside wall is a wall too — by itself, clicked on its drywall or in its hatching.
    for (const click of [
      [242, 100],
      [239.75, 150],
    ] as Pt[]) {
      const r = findWalls(hatchedHouse(), click, opts);
      assert.ok(r.ok, `click ${click}`);
      assert.equal(r.kind, "interior");
      assert.equal(r.thicknessIn, 3.5);
      assert.equal(r.runs.length, 1);
    }
  });

  it("bare hatched walls with a thin hatched band against the outside face (siding, stone): outside walls (Winnie)", () => {
    const segs: number[] = [];
    const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
    const rect = (d: number) => {
      line(-d, -d, 480 + d, -d);
      line(480 + d, -d, 480 + d, 360 + d);
      line(480 + d, 360 + d, -d, 360 + d);
      line(-d, 360 + d, -d, -d);
    };
    const hatch = (inner: number, outer: number) => {
      const w = outer - inner;
      for (let x = -inner; x + w <= 480 + inner; x += 1.5) {
        line(x, -inner, x + w, -outer);
        line(x, 360 + inner, x + w, 360 + outer);
      }
      for (let y = -inner; y + w <= 360 + inner; y += 1.5) {
        line(-inner, y, -outer, y + w);
        line(480 + inner, y, 480 + outer, y + w);
      }
    };
    for (const d of [-3.5, 0, 1.5]) rect(d);
    hatch(-3.5, 0); // the stud space
    hatch(0, 1.5); // the thin band outside
    for (const x of [238, 241.5]) line(x, 3.5, x, 356.5);
    for (let y = 3.5; y + 3.5 <= 356.5; y += 1.5) line(238, y, 241.5, y + 3.5);
    const r = findWalls(segs, [100, 3.5], opts);
    assert.ok(r.ok);
    assert.equal(r.kind, "exterior");
    assert.equal(r.thicknessIn, 3.5);
    assert.equal(r.runs.length, 4);
    const i = findWalls(segs, [241.5, 100], opts);
    assert.ok(i.ok);
    assert.equal(i.kind, "interior");
  });

  it("a plan that only hatches its brick isn't read as hatching its walls", () => {
    // The brick band near the click has a bare outer face: the walls are found the usual way.
    // (Clicked in the brick's hatching: the wall behind it, as always.)
    const r = findWalls(layeredHouse(), [483, 200], opts);
    assert.ok(r.ok);
    assert.equal(r.kind, "exterior");
    assert.equal(r.thicknessIn, 3.5);
    assert.equal(r.runs.length, 4);
    assert.ok(Math.abs(r.lengthFt - 1666 / 12) < 0.1, `found ${r.lengthFt} ft`);
  });

  it("says why when there's nothing to find", () => {
    assert.deepEqual(findWalls(house(), [300, 200], opts), { ok: false, reason: "no-line" });
    assert.deepEqual(findWalls(house(), [100, 384], opts), { ok: false, reason: "no-wall" });
    assert.deepEqual(findWalls(house(), [100, 0], { ...opts, unitsPerFoot: 0 }), { ok: false, reason: "no-scale" });
  });
});

/**
 * A 40' × 30' house drawn the way some plans stipple their walls (1 unit = 1 inch): 4" walls, each a band
 * of dots between two face lines — the outside walls, and one inside wall up the middle. Outside, a brick
 * ladder along the left wall (two lines 4" apart, rungs across) and a dimension's two lines 4" apart: two
 * lines a wall's thickness apart with nothing between them — not walls.
 */
function stippledHouse() {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  const dots = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = x0 + 0.5; x < x1; x += 0.8) for (let y = y0 + 0.5; y < y1; y += 0.8) segs.push(x, y, x, y);
  };
  // Outside walls: faces on 0…480 × 0…360 and 4" in.
  line(0, 0, 480, 0);
  line(480, 0, 480, 360);
  line(480, 360, 0, 360);
  line(0, 360, 0, 0);
  line(4, 4, 476, 4);
  line(476, 4, 476, 356);
  line(476, 356, 4, 356);
  line(4, 356, 4, 4);
  dots(0, 0, 480, 4);
  dots(0, 356, 480, 360);
  dots(0, 4, 4, 356);
  dots(476, 4, 480, 356);
  // An inside wall up the middle.
  line(238, 4, 238, 356);
  line(242, 4, 242, 356);
  dots(238, 4, 242, 356);
  // A brick ladder off the left wall.
  line(-4, 0, -4, 360);
  for (let y = 6; y < 360; y += 6) line(-4, y, 0, y);
  // A dimension 3' below the house, drawn with two lines 4" apart.
  line(0, 396, 480, 396);
  line(0, 400, 480, 400);
  return segs;
}

describe("findWalls on a plan that stipples its walls", () => {
  const segs = stippledHouse();
  const near = (runs: Pt[][], y: number) => runs.some(([a, b]) => Math.abs(a[1] - y) < 3 && Math.abs(b[1] - y) < 3);

  it("an outside wall clicked: the outside walls around, not the dimension or the brick ladder", () => {
    const r = findWalls(segs, [2, 180], opts);
    assert.ok(r.ok);
    assert.equal(r.kind, "exterior");
    assert.equal(r.runs.length, 4);
    assert.ok(!near(r.runs, 398), "the dimension's lines aren't a wall");
    assert.ok(r.runs.every(([a, b]) => a[0] >= 0 && b[0] >= 0), "the brick ladder isn't a wall");
  });

  it("the inside wall clicked: just it", () => {
    const r = findWalls(segs, [240, 180], opts);
    assert.ok(r.ok);
    assert.equal(r.kind, "interior");
    assert.equal(r.runs.length, 1);
  });
});

describe("2x6 and 2x4 don't mix", () => {
  // 1 unit = 1 inch. A brick outside 2x4 wall up the left (drywall x=10, sheathing 6½, brick 1–4½ hatched)
  // with a window in it (y 60–96, drawn as its own lines 6" apart), and a 2x6 inside wall running into it.
  // Brick's back face to the drywall is 5½" — a 2x6's thickness — with the sheathing line between (Pipkins).
  const brickHouse = () => {
    const segs: number[] = [];
    const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
    for (const [a, b] of [
      [0, 60],
      [96, 240],
    ]) {
      for (const x of [10, 6.5, 4.5, 1]) line(x, a, x, b);
      for (let y = a; y + 3.5 <= b; y += 4) line(1, y, 4.5, y + 3.5);
    }
    line(4, 60, 4, 96);
    line(10, 60, 10, 96);
    line(4, 60, 10, 60);
    line(4, 96, 10, 96);
    line(10, 120, 240, 120);
    line(10, 125.5, 240, 125.5);
    line(240, 120, 240, 125.5);
    line(10, 0, 300, 0);
    line(10, 3.5, 296.5, 3.5);
    line(300, 0, 300, 240);
    line(296.5, 3.5, 296.5, 240);
    return segs;
  };

  it("a 2x6 inside wall clicked doesn't bring in the brick 2x4 outside wall it runs into", () => {
    const r = findWalls(brickHouse(), [100, 120], { unitsPerFoot: 12, clickRadius: 2 });
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 5.5);
    assert.equal(r.runs.length, 1);
    assert.ok(r.runs[0].every(([, y]) => Math.abs(y - 122.75) < 0.1));
  });

  it("the brick 2x4 outside wall clicked is still a 2x4", () => {
    const r = findWalls(brickHouse(), [10, 150], { unitsPerFoot: 12, clickRadius: 2 });
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 3.5);
    assert.equal(r.kind, "exterior");
  });

  it("a click on a window's line reads the wall it's in, not the window's label box", () => {
    // A 2x4 wall (faces y=0, 3½) with a 3' window x 100–136: frame lines 0 and 5, sash 1¾ and 3½, label boxed 6" out.
    const segs: number[] = [];
    const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
    for (const [a, b] of [
      [0, 100],
      [136, 240],
    ]) {
      line(a, 0, b, 0);
      line(a, 3.5, b, 3.5);
    }
    for (const y of [0, 1.75, 3.5, 5]) line(100, y, 136, y);
    line(100, 0, 100, 5);
    line(136, 0, 136, 5);
    line(96, -6, 140, -6);
    line(96, -6, 96, 0);
    line(140, -6, 140, 0);
    line(0, 0, 0, 120);
    line(3.5, 3.5, 3.5, 120);
    line(240, 0, 240, 120);
    line(236.5, 3.5, 236.5, 120);
    const r = findWalls(segs, [118, 5], { unitsPerFoot: 12, clickRadius: 1 });
    assert.ok(r.ok);
    assert.equal(r.thicknessIn, 3.5);
    assert.ok(r.lengthFt > 30);
  });
});
