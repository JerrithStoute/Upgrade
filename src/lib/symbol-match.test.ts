/**
 * Symbol auto-count on synthetic "sheets": white pages with a few symbols drawn on
 * them, plus wall lines and look-alikes that shouldn't count.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MATCH, cropGray, findSymbols as findAll, type FindOptions, type Gray } from "./symbol-match";

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

describe("symbol auto-count", () => {
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
});
