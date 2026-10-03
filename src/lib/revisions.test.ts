import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NO_ALIGN, alignAngle, alignFromPairs, alignScale, applyAlign, composeAlign, pairSheets, parseAlign, type Pt } from "./revisions";

const near = (a: Pt, b: Pt) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${a} ≠ ${b}`);

describe("lining up revisions", () => {
  it("one pair of points is a shift", () => {
    const al = alignFromPairs([[10, 20]], [[15, 18]]);
    near(applyAlign(al, [100, 100]), [105, 98]);
    assert.equal(alignScale(al), 1);
  });

  it("two pairs catch a turn and a size change", () => {
    // New sheet: turned 90°, drawn 2× bigger, moved.
    const map = ([x, y]: Pt): Pt => [-2 * y + 50, 2 * x + 10];
    const old: Pt[] = [
      [0, 0],
      [100, 30],
    ];
    const al = alignFromPairs(old, old.map(map));
    near(applyAlign(al, [37, -12]), map([37, -12]));
    assert.ok(Math.abs(alignScale(al) - 2) < 1e-9);
    assert.ok(Math.abs(alignAngle(al) - Math.PI / 2) < 1e-9);
  });

  it("a fine-tune stacks on the first lining-up", () => {
    const first = alignFromPairs(
      [
        [0, 0],
        [10, 0],
      ],
      [
        [5, 5],
        [5, 15],
      ],
    );
    const then = alignFromPairs([[0, 0]], [[3, -2]]);
    near(applyAlign(composeAlign(first, then), [7, 4]), applyAlign(then, applyAlign(first, [7, 4])));
  });

  it("bad or missing alignment means no change", () => {
    assert.deepEqual(parseAlign(null), NO_ALIGN);
    assert.deepEqual(parseAlign("{oops"), NO_ALIGN);
    assert.deepEqual(parseAlign('{"a":1}'), NO_ALIGN);
  });
});

describe("pairing sheets between revisions", () => {
  it("matches by sheet name first, then by page", () => {
    const old = [
      { id: "o1", pageNumber: 1, name: "A-101 Floor Plan" },
      { id: "o2", pageNumber: 2, name: "A-201 Elevations" },
      { id: "o3", pageNumber: 3, name: "Sheet 3" },
    ];
    const now = [
      { id: "n1", pageNumber: 1, name: "Cover" },
      { id: "n2", pageNumber: 2, name: "A-101 floor plan" },
      { id: "n3", pageNumber: 3, name: "A-201 Elevations" },
      { id: "n4", pageNumber: 4, name: "Sheet 4" },
    ];
    const pairs = pairSheets(old, now);
    assert.equal(pairs.get("o1"), "n2");
    assert.equal(pairs.get("o2"), "n3");
    assert.equal(pairs.get("o3"), "n3"); // default name → same page number
  });
});
