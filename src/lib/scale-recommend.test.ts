import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommendScale, scalesInText } from "./scale-recommend";
import { quarterCircleRadius } from "../app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";

/** Door swings of these widths (inches), drawn at paper inches per foot → radii in page units. */
const doors = (ipf: number, widths: number[]) => widths.map((w) => (w / 12) * ipf * 72);
const many = (n: number, xs: number[]) => Array.from({ length: n }, () => xs).flat();
/** Lettering: lots of little curves, at every scale. */
const lettering = many(100, [3.5, 4, 4.5]);

describe("recommended scale", () => {
  it("reads a scale note in the sheet's text — however it's written", () => {
    assert.deepEqual(scalesInText(`MAIN FLOOR  SCALE: 3/16" = 1'-0"`), [3 / 16]);
    assert.deepEqual(scalesInText(`1/4"=1'`), [1 / 4]);
    assert.deepEqual(scalesInText(`1-1/2" = 1'-0"`), [1.5]);
    assert.deepEqual(scalesInText(`SITE PLAN 1" = 20'`), [1 / 20]);
    // Billot's elevations: the 1 over the 4, no slash in the text.
    assert.deepEqual(scalesInText(`FRONT ELEVATION  SC:   1  4 " = 1'-0"`), [1 / 4]);
    assert.deepEqual(scalesInText(`12'-6" x 14'-0" BEDROOM`), []);
  });

  it("goes by the door swings when there's no note: they land on real door widths at one scale", () => {
    // Bryant: 24", 28" and 32" doors drawn at 3/16".
    const r = recommendScale({ arcRadii: [...lettering, ...many(8, doors(3 / 16, [24, 28, 32]))], text: "" });
    assert.equal(r?.label, `3/16" = 1'-0"`);
    assert.match(r!.why, /24 door swings/);
    // Stoute: 24", 32" and 28" at 1/4".
    assert.equal(recommendScale({ arcRadii: [...lettering, ...many(5, doors(1 / 4, [24, 32, 28]))], text: "" })?.label, `1/4" = 1'-0"`);
  });

  it("recommends nothing unless it's clear", () => {
    assert.equal(recommendScale({ arcRadii: lettering, text: "" }), null, "no doors, no note");
    assert.equal(recommendScale({ arcRadii: doors(3 / 16, [24, 32, 36, 28]), text: "" }), null, "only a few doors (an elevation's arches can fake that many)");
    assert.equal(recommendScale({ arcRadii: [], text: `PLAN 1/4" = 1'-0"  DETAIL 1/2" = 1'-0"` }), null, "two drawings at two scales");
    assert.equal(
      recommendScale({ arcRadii: many(8, doors(3 / 16, [24, 28, 32])), text: `SCALE: 1/4" = 1'-0"` }),
      null,
      "the note and the doors disagree",
    );
  });

  it("says why, and agrees when both clues do", () => {
    const r = recommendScale({ arcRadii: many(8, doors(1 / 4, [24, 30, 36])), text: `SCALE 1/4" = 1'-0"` });
    assert.equal(r?.label, `1/4" = 1'-0"`);
    assert.equal(r?.why, `The sheet says 1/4" = 1'-0", and its door swings match.`);
  });
});

describe("door swing radius", () => {
  it("finds a quarter circle's radius from the curve, and skips anything else", () => {
    // A quarter circle of radius 30 around (100, 100), from (130, 100) to (100, 130): control points at k·r.
    const k = 0.5523 * 30;
    assert.ok(Math.abs(quarterCircleRadius([130, 100], [130, 100 + k], [100 + k, 130], [100, 130])! - 30) < 0.01);
    // A half circle's worth of turn, or a wobbly S-curve: not a door swing.
    assert.equal(quarterCircleRadius([0, 0], [10, 20], [20, -20], [30, 0]), null);
  });
});
