import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findOpening } from "./index";

// 1/4" = 1' (18 units a foot): a 4" wall along y = 100 (faces at 97 and 103), 20' long, with a 3' opening from
// x = 200 to x = 254, capped at each jamb.
const upf = 18;
const wall = (gapFrom: number, gapTo: number, extra: number[] = []) => [
  // faces, left of the opening and right of it
  0, 97, gapFrom, 97, 0, 103, gapFrom, 103,
  gapTo, 97, 360, 97, gapTo, 103, 360, 103,
  // jamb caps
  gapFrom, 97, gapFrom, 103, gapTo, 97, gapTo, 103,
  ...extra,
];

describe("findOpening", () => {
  it("finds an opening jamb to jamb from a click inside it", () => {
    const r = findOpening(wall(200, 254), [220, 101], { unitsPerFoot: upf });
    assert.ok(r);
    assert.ok(Math.abs(r.widthIn - 36) < 0.1);
    const xs = [r.a[0], r.b[0]].sort((p, q) => p - q);
    assert.deepEqual(xs.map(Math.round), [200, 254]);
    assert.ok(Math.abs(r.a[1] - 100) < 0.1 && Math.abs(r.b[1] - 100) < 0.1);
  });

  it("reads through a window drawn in the opening", () => {
    // the window's lines run jamb to jamb, on the faces and down the middle
    const r = findOpening(wall(200, 254, [200, 97, 254, 97, 200, 100, 254, 100, 200, 103, 254, 103]), [230, 99], { unitsPerFoot: upf });
    assert.ok(r);
    assert.ok(Math.abs(r.widthIn - 36) < 0.1);
  });

  it("finds nothing on a plain stretch of wall", () => {
    const solid = [0, 97, 360, 97, 0, 103, 360, 103];
    assert.equal(findOpening(solid, [220, 100], { unitsPerFoot: upf }), null);
  });

  it("finds nothing in the middle of a room", () => {
    assert.equal(findOpening(wall(200, 254), [220, 300], { unitsPerFoot: upf }), null);
  });
});
