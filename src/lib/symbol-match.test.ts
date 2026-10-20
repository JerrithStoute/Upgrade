/**
 * Symbol auto-count on synthetic "sheets": white pages with a few symbols drawn on
 * them, plus wall lines and look-alikes that shouldn't count.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MATCH,
  clutterText,
  cropGray,
  eraseClutter,
  findSymbols as findAll,
  leavingLines,
  planTiles,
  sampleWords,
  sharpSample,
  symbolBox,
  verifyMatch,
  type FindOptions,
  type Gray,
} from "./symbol-match";

/** What the user sees at the default Match setting. */
const findSymbols = (g: Gray, sample: Gray, o?: FindOptions) => findAll(g, sample, o).filter((m) => m.score >= DEFAULT_MATCH);

function sheet(w: number, h: number): Gray {
  return { w, h, data: new Uint8Array(w * h).fill(255) };
}
function ink(g: Gray, x: number, y: number) {
  if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.data[Math.round(y) * g.w + Math.round(x)] = 0;
}
function line(g: Gray, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  for (let i = 0; i <= n; i++) ink(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
}
function circle(g: Gray, cx: number, cy: number, r: number) {
  for (let a = 0; a < 360; a += 1) ink(g, cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180));
}
/** An outlet-like symbol: a circle with two prongs on one side (so it has a direction). */
function outlet(g: Gray, cx: number, cy: number, turn = 0) {
  circle(g, cx, cy, 10);
  const prong = (dx: number) => {
    const [ax, ay, bx, by] = [dx, -10, dx, -18];
    const rot = (x: number, y: number): [number, number] => {
      const t = (turn * Math.PI) / 180;
      return [cx + x * Math.cos(t) - y * Math.sin(t), cy + x * Math.sin(t) + y * Math.cos(t)];
    };
    const [x0, y0] = rot(ax, ay);
    const [x1, y1] = rot(bx, by);
    line(g, x0, y0, x1, y1);
  };
  prong(-4);
  prong(4);
}
const sampleAt = (g: Gray, cx: number, cy: number) => cropGray(g, { x: cx - 22, y: cy - 22, w: 44, h: 44 });

/** A can light: a circle with a mark inside (an "R"-ish stroke). */
function canLight(g: Gray, cx: number, cy: number) {
  circle(g, cx, cy, 10);
  line(g, cx - 4, cy + 5, cx - 4, cy - 5);
  line(g, cx - 4, cy - 5, cx + 4, cy + 5);
}
/** A hatched wall: two faces and slanted strokes packed between them. */
function hatchedWall(g: Gray, x0: number, y0: number, x1: number, t = 14) {
  line(g, x0, y0, x1, y0);
  line(g, x0, y0 + t, x1, y0 + t);
  for (let x = x0; x + t <= x1; x += 4) line(g, x, y0 + t, x + t, y0);
}

describe("symbol auto-count", () => {
  it("doesn't count hatched walls or a solid block as a symbol (a can light on a hatched plan)", () => {
    const g = sheet(700, 400);
    const lights = [
      [80, 80],
      [300, 90],
      [520, 300],
    ];
    for (const [x, y] of lights) canLight(g, x, y);
    hatchedWall(g, 20, 180, 680);
    hatchedWall(g, 20, 360, 680, 20);
    for (let y = 230; y < 270; y++) for (let x = 600; x < 640; x++) ink(g, x, y);
    const found = findSymbols(g, sampleAt(g, 80, 80));
    assert.equal(found.length, lights.length, JSON.stringify(found));
    for (const [x, y] of lights) assert.ok(found.some((m) => Math.abs(m.x + m.w / 2 - x) < 6 && Math.abs(m.y + m.h / 2 - y) < 8));
  });

  it("finds every copy, including the sample, and nothing on blank paper", () => {
    const g = sheet(600, 400);
    const spots = [
      [80, 80],
      [300, 90],
      [500, 300],
      [150, 320],
    ];
    for (const [x, y] of spots) outlet(g, x, y);
    const found = findSymbols(g, sampleAt(g, 80, 80));
    assert.equal(found.length, 4);
    for (const [x, y] of spots) assert.ok(found.some((m) => Math.abs(m.x + m.w / 2 - x) < 6 && Math.abs(m.y + m.h / 2 - y) < 8));
  });

  it("finds turned copies, and only straight ones when rotations are off", () => {
    const g = sheet(600, 400);
    outlet(g, 80, 80);
    outlet(g, 300, 120, 90);
    outlet(g, 480, 300, 180);
    assert.equal(findSymbols(g, sampleAt(g, 80, 80)).length, 3);
    assert.equal(findSymbols(g, sampleAt(g, 80, 80), { rotations: false, mirrored: false }).length, 1);
  });

  it("still finds a symbol sitting on a wall line, and skips different symbols", () => {
    const g = sheet(600, 400);
    outlet(g, 80, 80);
    line(g, 0, 250, 599, 250);
    outlet(g, 300, 250); // on the wall
    // Look-alikes that aren't the symbol: a bare circle, a square.
    circle(g, 450, 100, 10);
    line(g, 500, 300, 520, 300);
    line(g, 520, 300, 520, 320);
    line(g, 520, 320, 500, 320);
    line(g, 500, 320, 500, 300);
    const found = findSymbols(g, sampleAt(g, 80, 80), { rotations: false, mirrored: false });
    assert.equal(found.length, 2);
    assert.ok(found.some((m) => Math.abs(m.x + m.w / 2 - 300) < 6));
  });

  it("returns nothing for an empty sample", () => {
    const g = sheet(200, 200);
    outlet(g, 100, 100);
    assert.deepEqual(findSymbols(g, cropGray(g, { x: 0, y: 0, w: 30, h: 30 })), []);
  });

  describe("the sharp second look", () => {
    // Drawn close up, as the second look sees it: strokes 3 pixels wide.
    const thick = (g: Gray, x0: number, y0: number, x1: number, y1: number) => {
      for (let d = -1; d <= 1; d++) {
        line(g, x0 + d, y0, x1 + d, y1);
        line(g, x0, y0 + d, x1, y1 + d);
      }
    };
    const ring = (g: Gray, cx: number, cy: number, r: number, skip?: (a: number) => boolean) => {
      for (let a = 0; a < 360; a += 0.5) {
        if (skip?.(a)) continue;
        for (const rr of [r - 1, r, r + 1]) ink(g, cx + rr * Math.cos((a * Math.PI) / 180), cy + rr * Math.sin((a * Math.PI) / 180));
      }
    };
    /** An 8 (two rings stacked) — or a 6: the top ring open on its right. */
    const digit = (g: Gray, cx: number, cy: number, six = false) => {
      ring(g, cx, cy - 9, 8, six ? (a) => a > 270 || a < 60 : undefined);
      ring(g, cx, cy + 9, 9);
    };
    /** A door tag: "88" (or "68") in a box. */
    const tag = (g: Gray, cx: number, cy: number, six = false) => {
      digit(g, cx - 12, cy, six);
      digit(g, cx + 12, cy);
      thick(g, cx - 30, cy - 24, cx + 30, cy - 24);
      thick(g, cx - 30, cy + 24, cx + 30, cy + 24);
      thick(g, cx - 30, cy - 24, cx - 30, cy + 24);
      thick(g, cx + 30, cy - 24, cx + 30, cy + 24);
    };
    const around = (g: Gray, cx: number, cy: number, dx = 0, dy = 0) => cropGray(g, { x: cx - 40 + dx, y: cy - 34 + dy, w: 80, h: 68 });

    it("tells a 68 from an 88, and still knows an 88 with a dimension line through it", () => {
      const g = sheet(500, 120);
      tag(g, 60, 60);
      tag(g, 180, 60);
      tag(g, 300, 60, true);
      tag(g, 420, 60);
      // A dimension line right through the last one, with its tick.
      thick(g, 360, 62, 490, 62);
      thick(g, 400, 70, 410, 54);
      const sample = sharpSample(cropGray(g, { x: 26, y: 32, w: 68, h: 56 }));
      const copy = verifyMatch(sample, around(g, 180, 60, 3, -2)).score;
      const six = verifyMatch(sample, around(g, 300, 60)).score;
      const crossed = verifyMatch(sample, around(g, 420, 60, -2, 2)).score;
      assert.ok(copy >= DEFAULT_MATCH, `copy ${copy}`);
      assert.ok(crossed >= DEFAULT_MATCH, `crossed by a dimension line ${crossed}`);
      assert.ok(six < 0.5, `a 68 ${six}`);
      assert.equal(verifyMatch(sample, sheet(80, 68)).score, 0);
    });

    it("a ring-shaped symbol with a wire running off it stays a ring — and is found turned", () => {
      const g = sheet(300, 100);
      ring(g, 50, 50, 14);
      thick(g, 40, 44, 58, 58);
      thick(g, 50, 64, 50, 92); // the wire, off the bottom of the sample box
      ring(g, 200, 50, 14);
      thick(g, 210, 44, 192, 58); // the same symbol flipped
      thick(g, 214, 50, 260, 50); // its wire, the other way
      const sample = sharpSample(cropGray(g, { x: 30, y: 30, w: 40, h: 40 }));
      // The ring is still there after the wire comes off.
      let dark = 0;
      for (const v of sample.data) if (v < 128) dark++;
      assert.ok(dark > 200, `${dark} dark pixels left`);
      const v = verifyMatch(sample, cropGray(g, { x: 172, y: 22, w: 56, h: 56 }), { turn: 1 }).score;
      assert.ok(v >= DEFAULT_MATCH, `flipped copy ${v}`);
    });

    it("shrinks a loose box to the symbol: the frame and what's in it, not a wall across or bits beside", () => {
      const g = sheet(160, 120);
      tag(g, 80, 60);
      thick(g, 0, 10, 159, 10); // a wall right across the box
      thick(g, 130, 90, 138, 98); // a tick off to the side
      thick(g, 20, 100, 26, 100);
      const b = symbolBox(g);
      assert.ok(b.x >= 46 && b.x <= 50 && b.x + b.w >= 110 && b.x + b.w <= 114, `across ${b.x}–${b.x + b.w}`);
      assert.ok(b.y >= 32 && b.y <= 36 && b.y + b.h >= 84 && b.y + b.h <= 88, `down ${b.y}–${b.y + b.h}`);
    });

    it("leaves out what's in the way: other words, dimension lines, lines running off past the sample", () => {
      const items: { str: string; box: [number, number, number, number] }[] = [
        { str: "2880", box: [10, 10, 30, 16] },
        { str: "2880", box: [110, 10, 130, 16] },
        { str: "3080", box: [210, 10, 230, 16] },
        { str: "12'-6\"", box: [60, 40, 80, 46] },
      ];
      const keep = sampleWords(items, { x: 5, y: 5, w: 30, h: 15 });
      assert.deepEqual([...keep], ["2880"]);
      assert.deepEqual(clutterText(items, keep), [items[2].box, items[3].box]);
      // A leader running into the sample and on past it goes; the tag's own frame stays.
      const segs = [5, 5, 35, 5, /* frame */ 35, 12, 90, 12 /* leader */];
      assert.deepEqual(leavingLines(segs, { x: 5, y: 5, w: 30, h: 15 }), [35, 12, 90, 12]);
      // Painted over: a line and a word.
      const g = sheet(100, 50);
      line(g, 0, 20, 99, 20);
      for (let y = 40; y < 46; y++) line(g, 60, y, 80, y);
      const e = eraseClutter(g, 1, { segments: [0, 20, 99, 20], text: [[60, 40, 80, 46]] });
      assert.ok(e.data.every((v) => v === 255), "all paper again");
      assert.equal(eraseClutter(g, 1, { segments: [0, 20, 99, 20], text: [] }, 200).data[20 * 100 + 50], 200);
    });

    it("groups nearby spots into one tile to draw, far ones into their own", () => {
      const p = (x: number, y: number) => ({ x, y, w: 10, h: 10 });
      const tiles = planTiles([p(0, 0), p(30, 20), p(900, 900), p(910, 905)], 10, 4096);
      assert.equal(tiles.length, 2);
      assert.deepEqual(
        tiles.map((t) => t.items),
        [
          [0, 1],
          [2, 3],
        ],
      );
      assert.deepEqual(tiles[0].tile, { x: 0, y: 0, w: 40, h: 30 });
    });
  });
});
