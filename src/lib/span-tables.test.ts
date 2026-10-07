/** Span tables. Run with `npm test`. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codeSpanFt, longestUnsupported, pickSize, sizeBands, type SpanTableSpec } from "./span-tables";

const ftIn = (ft: number | null) => {
  if (ft == null) return null;
  const inches = Math.round(ft * 12);
  return `${Math.floor(inches / 12)}'-${inches % 12}"`;
};

describe("code span tables", () => {
  // The IRC tables as a building department hands them out (Douglas fir-larch #2, 16" o.c.).
  it("floor joists, 40 psf live / 10 dead, L/360 (R502.3.1(2))", () => {
    assert.deepEqual(
      ["2x6", "2x8", "2x10", "2x12"].map((s) => ftIn(codeSpanFt(s, "DFL2", "FLOOR40", 16))),
      [`9'-9"`, `12'-9"`, `15'-7"`, `18'-1"`],
    );
  });

  it("ceiling joists, 10 psf live / 5 dead, L/240 (R802.5.1(1))", () => {
    assert.deepEqual(
      ["2x4", "2x6", "2x8"].map((s) => ftIn(codeSpanFt(s, "DFL2", "CEIL10", 16))),
      [`11'-3"`, `17'-8"`, `23'-4"`],
    );
  });

  it("rafters, 20 psf live / 10 dead, ceiling attached L/240 (R802.4.1(2)) — within an inch", () => {
    const table = [8 * 12 + 11, 14 * 12 + 1, 18 * 12 + 5, 22 * 12 + 6, 26 * 12];
    ["2x4", "2x6", "2x8", "2x10", "2x12"].forEach((s, i) => {
      const ours = codeSpanFt(s, "DFL2", "ROOF20C", 16)! * 12;
      assert.ok(Math.abs(ours - table[i]) <= 1, `${s}: ${ours}" vs ${table[i]}"`);
    });
  });

  it("closer spacing spans farther; unknown sizes or species give nothing", () => {
    assert.ok(codeSpanFt("2x10", "SPF2", "FLOOR40", 12)! > codeSpanFt("2x10", "SPF2", "FLOOR40", 16)!);
    assert.equal(codeSpanFt("TJI 210", "SPF2", "FLOOR40", 16), null);
    assert.equal(codeSpanFt("2x10", "OAK", "FLOOR40", 16), null);
  });
});

describe("picking a size", () => {
  const mine: SpanTableSpec = {
    use: "FLOOR",
    source: "CUSTOM",
    species: "",
    load: "",
    rows: [
      { upToFt: 16, size: "2x8" },
      { upToFt: 12, size: "2x6" },
    ],
    overSize: "TJI 210",
  };

  it("your own table: up to 12' a 2x6, up to 16' a 2x8, past that the specialty member", () => {
    assert.equal(pickSize(mine, 11.5, 16).size, "2x6");
    assert.equal(pickSize(mine, 12, 16).size, "2x6");
    assert.equal(pickSize(mine, 12.1, 16).size, "2x8");
    const past = pickSize(mine, 19, 16);
    assert.equal(past.size, "TJI 210");
    assert.equal(past.over, true);
    assert.equal(pickSize({ ...mine, overSize: null }, 19, 16).size, null);
  });

  it("a code table: the smallest size that spans it", () => {
    const code: SpanTableSpec = { use: "FLOOR", source: "CODE", species: "DFL2", load: "FLOOR40", rows: [], overSize: "TJI 210" };
    assert.equal(pickSize(code, 9, 16).size, "2x6");
    assert.equal(pickSize(code, 15, 16).size, "2x10");
    assert.equal(pickSize(code, 22, 16).size, "TJI 210");
  });
});

describe("the span that sizes an area", () => {
  // Joists running north–south (along y), 1 unit = 1 inch.
  const joist = (x: number, y0: number, y1: number): [[number, number], [number, number]] => [
    [x, y0],
    [x, y1],
  ];
  it("no walls in the way: the whole joist", () => {
    assert.equal(longestUnsupported([joist(0, 0, 240)], []), 240);
  });

  it("the walls a joist crosses hold it up; the longest unsupported stretch of any joist wins", () => {
    // North end of the area: a closet wall 10' in. Further south, the wall behind the stove is 14' in.
    const closet: [[number, number], [number, number]] = [
      [-20, 120],
      [40, 120],
    ];
    const stove: [[number, number], [number, number]] = [
      [80, 168],
      [200, 168],
    ];
    const members = [joist(0, 0, 240), joist(100, 0, 240)];
    // x=0: 0–120–240 → 10'; x=100: 0–168–240 → 14'.
    assert.equal(longestUnsupported(members, [closet, stove]), 168);
  });

  it("walls running alongside the joists don't hold them up", () => {
    assert.equal(
      longestUnsupported(
        [joist(0, 0, 240)],
        [
          [
            [10, 0],
            [10, 240],
          ],
        ],
      ),
      240,
    );
  });
});

describe("sizes within one area", () => {
  it("joists side by side are grouped by the size their own span needs", () => {
    // Five joists 24" apart running 20' (240"); a wall at 14' crosses the first three only.
    const members = [0, 24, 48, 72, 96].map((x): [[number, number], [number, number]] => [
      [x, 0],
      [x, 240],
    ]);
    const wall: [[number, number], [number, number]] = [
      [-10, 168],
      [60, 168],
    ];
    const size = (span: number) => (span <= 192 ? "2x8" : "2x10");
    const bands = sizeBands(members, [wall], size);
    assert.deepEqual(
      bands.map((b) => [b.size, b.count, b.span]),
      [
        ["2x8", 3, 168],
        ["2x10", 2, 240],
      ],
    );
    assert.deepEqual(bands[0].middle[0], [24, 0]);
  });
});

describe("a joist lying on a wall", () => {
  it("has no span of its own and goes with the joists beside it", () => {
    const members = [0, 24, 48].map((x): [[number, number], [number, number]] => [
      [x, 0],
      [x, 240],
    ]);
    // A wall right under the first joist (2" off), running its length.
    const under: [[number, number], [number, number]] = [
      [2, -5],
      [2, 245],
    ];
    assert.equal(longestUnsupported([members[0]], [under], 4), 0);
    const bands = sizeBands(members, [under], () => "2x10", 4);
    assert.deepEqual(
      bands.map((b) => [b.size, b.count]),
      [["2x10", 3]],
    );
  });
});
