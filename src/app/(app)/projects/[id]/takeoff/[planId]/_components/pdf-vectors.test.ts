/** Door swings drawn as runs of short lines. Run with `npm test`. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { polylineArcs } from "./pdf-vectors";

/** Points on a circle (center cx, cy, radius r) from a0° to a1°, in n steps. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

describe("door swings drawn as short lines", () => {
  it("a quarter circle of short pieces is a swing: hinge at its center, its radius the door's width", () => {
    const [s] = polylineArcs(arc(100, 200, 36, 0, 90, 15));
    assert.ok(s, "found");
    assert.ok(Math.hypot(s.x - 100, s.y - 200) < 0.5 && Math.abs(s.r - 36) < 0.5, JSON.stringify(s));
    // A door drawn open 45° swings half as far.
    assert.equal(polylineArcs(arc(0, 0, 30, 90, 135, 8)).length, 1);
  });

  it("straight runs, zigzags, a near-full circle and a few pieces aren't", () => {
    assert.equal(polylineArcs(Array.from({ length: 10 }, (_, i) => [i * 5, 0] as [number, number])).length, 0);
    assert.equal(polylineArcs(Array.from({ length: 10 }, (_, i) => [i * 5, i % 2 ? 3 : 0] as [number, number])).length, 0);
    assert.equal(polylineArcs(arc(0, 0, 30, 0, 300, 40)).length, 0);
    assert.equal(polylineArcs(arc(0, 0, 30, 0, 90, 3)).length, 0);
  });
});
