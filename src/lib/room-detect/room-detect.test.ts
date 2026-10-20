/**
 * The room finder on a small made-up floor plan. Run with `npm test`.
 * Scale: 12 page units per foot, so 1 unit = 1 inch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findDimensions, findRoom, splitOutline } from "./index";
import type { Pt } from "../wall-detect";

const opts = { unitsPerFoot: 12 };

/**
 * A 40' × 30' house, 4½" walls (each wall its two faces): outside faces 0…480 × 0…360. A wall up the
 * middle (x 240–244½) with a 3' door in it (y 100–136) — or, with `opening`, a 10' gap instead. In the
 * left room an island (a 5' × 2½' box) and a label box; a dimension line outside.
 */
function house({ opening = false, island = true, dims = false }: { opening?: boolean; island?: boolean; dims?: boolean } = {}) {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    line(x0, y0, x1, y0);
    line(x1, y0, x1, y1);
    line(x1, y1, x0, y1);
    line(x0, y1, x0, y0);
  };
  rect(0, 0, 480, 360);
  rect(4.5, 4.5, 475.5, 355.5);
  // The middle wall, in two pieces around its opening, closed at the ends (jambs).
  const [g0, g1] = opening ? [100, 220] : [100, 136];
  for (const x of [240, 244.5]) {
    line(x, 4.5, x, g0);
    line(x, g1, x, 355.5);
  }
  line(240, g0, 244.5, g0);
  line(240, g1, 244.5, g1);
  if (island) {
    rect(90, 150, 150, 180); // the island
    rect(60, 60, 80, 66); // a label's box
  }
  line(0, 390, 480, 390); // a dimension line
  if (dims) {
    // Two dimension strings across the left room, 10" apart, broken around their numbers (label boxes
    // between the pieces), each piece ending at a tick — they'd look like a wall's two faces.
    for (const y of [30, 40]) {
      for (const [x0, x1] of [
        [4.5, 60],
        [80, 150],
        [170, 240],
      ]) {
        line(x0, y, x1, y);
        for (const x of [x0, x1]) line(x - 2, y + 2, x + 2, y - 2); // ticks
      }
      rect(61, y - 4, 79, y + 3); // the numbers' boxes
      rect(151, y - 4, 169, y + 3);
    }
  }
  return segs;
}

/**
 * The same house drawn the way some plans fill their walls (1 unit = 1 inch): every wall's stud space
 * hatched. The middle wall has a 12' cased opening (y 100–244) — too wide for a door, but its two
 * pieces line up across it. Two dimension strings with their numbers run across the left room.
 */
function filledHouse() {
  const segs: number[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => segs.push(x1, y1, x2, y2);
  // A wall from (x0, y0) to (x1, y1), axis-aligned, `t` thick, hatched every 1½".
  const wall = (x0: number, y0: number, x1: number, y1: number, t = 4.5) => {
    if (y0 === y1) {
      line(x0, y0, x1, y0);
      line(x0, y0 + t, x1, y1 + t);
      for (let x = x0; x + t <= x1; x += 1.5) line(x, y0 + t, x + t, y0);
    } else {
      line(x0, y0, x0, y1);
      line(x0 + t, y0, x1 + t, y1);
      for (let y = y0; y + t <= y1; y += 1.5) line(x0, y, x0 + t, y + t);
    }
  };
  wall(0, 0, 480, 0);
  wall(0, 355.5, 480, 355.5);
  wall(0, 0, 0, 360);
  wall(475.5, 0, 475.5, 360);
  wall(240, 4.5, 240, 100);
  wall(240, 244, 240, 355.5);
  for (const y of [30, 40]) {
    for (const [x0, x1] of [
      [4.5, 60],
      [80, 150],
      [170, 240],
    ]) {
      line(x0, y, x1, y);
      for (const x of [x0, x1]) line(x - 2, y + 2, x + 2, y - 2);
    }
    for (const [bx0, bx1] of [
      [61, 79],
      [151, 169],
    ]) {
      line(bx0, y - 4, bx1, y - 4);
      line(bx1, y - 4, bx1, y + 3);
      line(bx1, y + 3, bx0, y + 3);
      line(bx0, y + 3, bx0, y - 4);
    }
  }
  return segs;
}

const area = (pts: Pt[]) => Math.abs(pts.reduce((a, [x1, y1], i) => a + x1 * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y1, 0)) / 2 / 144;

describe("room finder", () => {
  it("a click in a room gives its floor to the inside faces of the walls, closed across the door", () => {
    const left = findRoom(house(), [120, 300], opts);
    assert.ok(left.ok);
    // 19'-7½" × 29'-3" — the island and the label are part of the floor.
    const want = (235.5 * 351) / 144;
    assert.ok(Math.abs(left.areaSf - want) < 0.5, `left room ${left.areaSf} sf, want ${want}`);
    assert.ok(Math.abs(area(left.outline) - left.areaSf) < 1e-6);
    assert.equal(left.outline.length, 4, `outline ${JSON.stringify(left.outline)}`);
    const right = findRoom(house(), [400, 200], opts);
    assert.ok(right.ok);
    const wantRight = (231 * 351) / 144;
    assert.ok(Math.abs(right.areaSf - wantRight) < 0.5, `right room ${right.areaSf} sf, want ${wantRight}`);
  });

  it("the same room whichever spot in it is clicked — even on the island", () => {
    for (const click of [
      [20, 20],
      [230, 340],
      [120, 165],
    ] as Pt[]) {
      const r = findRoom(house(), click, opts);
      assert.ok(r.ok, `click ${click}`);
      assert.ok(Math.abs(r.areaSf - (235.5 * 351) / 144) < 0.5, `click ${click}: ${r.areaSf} sf`);
    }
  });

  it("dimension strings and their numbers drawn across a room don't cut it off", () => {
    const r = findRoom(house({ dims: true }), [120, 300], opts);
    assert.ok(r.ok);
    assert.ok(Math.abs(r.areaSf - (235.5 * 351) / 144) < 1, `${r.areaSf} sf`);
  });

  it("on a plan that fills its walls, only the filled walls count — and lined-up walls close a wide opening", () => {
    const r = findRoom(filledHouse(), [120, 300], opts);
    assert.ok(r.ok);
    // The left room alone, wall to wall, dimensions and all: 19'-7½" × 29'-3".
    assert.ok(Math.abs(r.areaSf - (235.5 * 351) / 144) < 1, `${r.areaSf} sf`);
    assert.equal(r.outline.length, 4, JSON.stringify(r.outline));
  });

  it("words drawn as lines and an outlet against a wall don't cut a room up", () => {
    const segs = house();
    const rect = (x0: number, y0: number, x1: number, y1: number) => segs.push(x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0);
    // An outlet: two short lines, 2½" apart, standing off the left wall's face...
    segs.push(4.5, 300, 12, 300, 4.5, 302.5, 12, 302.5);
    // ...and a big "E" (a 30" spine, three 8" arms, strokes 3" thick) 5' out from it.
    rect(66, 285, 69, 315);
    for (const y of [285, 299, 312]) rect(69, y, 77, y + 3);
    const r = findRoom(segs, [120, 300], opts);
    assert.ok(r.ok);
    assert.ok(Math.abs(r.areaSf - (235.5 * 351) / 144) < 1, `${r.areaSf} sf`);
    assert.ok(r.outline.length <= 6, `outline ${JSON.stringify(r.outline)}`);
  });

  it("on a plan that fills its walls solid, only the filled ones are walls — a counter's edge isn't", () => {
    const segs = house({ island: false });
    // A counter's front edge drawn double (4" apart), right across the left room, wall to wall.
    segs.push(4.5, 200, 240, 200, 4.5, 204, 240, 204);
    const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
    const fills = [
      // The walls, in their gray, piece by piece: the four outside walls and the middle one.
      { color: "#efefef", rings: [rect(0, 0, 480, 4.5)] },
      { color: "#efefef", rings: [rect(0, 355.5, 480, 360)] },
      { color: "#efefef", rings: [rect(0, 4.5, 4.5, 355.5)] },
      { color: "#efefef", rings: [rect(475.5, 4.5, 480, 355.5)] },
      { color: "#efefef", rings: [rect(240, 4.5, 244.5, 100)] },
      { color: "#efefef", rings: [rect(240, 136, 244.5, 355.5)] },
      // A counter in its own shade, and a heavy border line drawn as a thin black strip.
      { color: "#eeeeee", rings: [rect(4.5, 204, 240, 230)] },
      { color: "#000000", rings: [rect(-20, -20, 500, -18.5)] },
    ];
    const lined = findRoom(segs, [120, 300], opts);
    assert.ok(lined.ok && lined.areaSf < 300, `without the fills the counter's edge cuts the room: ${lined.ok && lined.areaSf}`);
    const r = findRoom(segs, [120, 300], { ...opts, fills });
    assert.ok(r.ok);
    assert.ok(Math.abs(r.areaSf - (235.5 * 351) / 144) < 1, `${r.areaSf} sf`);
  });

  it("a wide opening (10') isn't closed: the two rooms come back as one, to split", () => {
    const r = findRoom(house({ opening: true }), [120, 300], opts);
    assert.ok(r.ok);
    // Both rooms and the opening between them.
    const want = (471 * 351 - 4.5 * (351 - 120)) / 144;
    assert.ok(Math.abs(r.areaSf - want) < 1, `${r.areaSf} sf, want ${want}`);
  });

  it("an area splits in two along a line drawn across it", () => {
    const sq: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 50],
      [0, 50],
    ];
    const r = splitOutline(sq, [40, -10], [40, 60]);
    assert.ok(r);
    const sizes = r.map((p) => area(p) * 144).sort((a, b) => a - b);
    assert.deepEqual(sizes.map((v) => Math.round(v)), [2000, 3000]);
    // An L: split across its short leg only, not through the rest.
    const L: Pt[] = [
      [0, 0],
      [100, 0],
      [100, 40],
      [40, 40],
      [40, 100],
      [0, 100],
    ];
    const l = splitOutline(L, [-5, 70], [45, 70]);
    assert.ok(l);
    assert.deepEqual(l.map((p) => Math.round(area(p) * 144)).sort((a, b) => a - b), [1200, 5200]);
    // Not across it: no split.
    assert.equal(splitOutline(sq, [200, 0], [200, 50]), null);
  });

  it("finds the dimension lines and their ticks (for auto-count to leave out), not the walls", () => {
    const segs = house({ dims: true });
    // A mark partway along the first string, crossing it.
    segs.push(100, 32, 104, 28);
    const { lines, ticks } = findDimensions(segs, 12);
    const ys = new Set<number>();
    for (let i = 0; i < lines.length; i += 4) {
      assert.equal(lines[i + 1], lines[i + 3], "dimension lines run across");
      ys.add(lines[i + 1]);
    }
    assert.deepEqual([...ys].sort((a, b) => a - b), [30, 40], `dimension lines at ${[...ys]}`);
    assert.ok(ticks.length / 4 >= 7, `${ticks.length / 4} ticks`);
    let mid = false;
    for (let i = 0; i < ticks.length; i += 4) if (ticks[i] === 100 && ticks[i + 1] === 32) mid = true;
    assert.ok(mid, "the mark partway along");
    // Given the sheet's text, only a string with its measurement written along it counts: the one at
    // y 30 is labeled (in two pieces, either side of its number), the one at y 40 isn't.
    const text: { str: string; box: [number, number, number, number] }[] = [
      { str: "4'-6\"", box: [61, 26, 79, 33] },
      { str: "ROOM", box: [151, 36, 169, 43] },
    ];
    const labeled = findDimensions(segs, 12, text);
    const at = new Set<number>();
    for (let i = 0; i < labeled.lines.length; i += 4) at.add(labeled.lines[i + 1]);
    assert.deepEqual([...at], [30], `labeled strings at ${[...at]}`);
    assert.equal(labeled.lines.length / 4, 3, "all three pieces of the labeled string");
  });

  it("says why when there's no room there", () => {
    assert.deepEqual(findRoom(house(), [-60, 100], opts), { ok: false, reason: "open" });
    assert.deepEqual(findRoom(house(), [242, 300], opts), { ok: false, reason: "in-wall" });
    assert.deepEqual(findRoom(house(), [100, 100], { unitsPerFoot: 0 }), { ok: false, reason: "no-scale" });
  });
});
