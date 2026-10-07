/**
 * Checks for the takeoff math. Run with `npm test`. Every number here was worked
 * out by hand (and most were confirmed on real plans) — if a change moves one,
 * the test says which and by how much.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assemblyQuantity,
  feetInches,
  framingBoards,
  framingLengths,
  hipFactor,
  hipOverhangPlan,
  itemNameKey,
  measurementMetrics,
  packBoards,
  roundOncePerItem,
  beamOptions,
  memberLengths,
  boardPrice,
  wasteBoards,
  emptyMetrics,
  parseMemberSize,
  parseStockLengths,
  polygonArea,
  polygonPerimeter,
  slopeFactor,
  stockLength,
  stockPieces,
  inchesText,
  precutStudLength,
  wallRun,
  wallNetworks,
  wallTakeoff,
  arcPath,
  parseArcs,
  parsePoints,
  pointsJson,
  polylineLength,
  compareMaterialNames,
  withSheetSize,
  sheetSizeInName,
  defaultStudLength,
  doorTakeoff,
  doorSizeCode,
  feetInchesIn,
  DEFAULT_DOOR_OPTIONS,
  DEFAULT_WINDOW_OPTIONS,
  windowTakeoff,
  openingTakeoff,
  parseOptions,
  studItemName,
  DEFAULT_WALL_OPTIONS,
  DEFAULT_OPENING_OPTIONS,
  type ConditionCalc,
  type WallOptions,
  type MeasurementShape,
  type Pt,
} from "./takeoff";

const near = (actual: number, expected: number, tolerance = 0.001, what = "") => assert.ok(Math.abs(actual - expected) <= tolerance, `${what} expected ${expected}, got ${actual}`);

// 12 page units per foot keeps the arithmetic readable: a 20' × 12' room is 240 × 144.
const UPF = 12;
const ROOM: Pt[] = [
  [0, 0],
  [240, 0],
  [240, 144],
  [0, 144],
];
const shape = (points: Pt[], extra: Partial<MeasurementShape> = {}): MeasurementShape => ({ points, isDeduction: false, angle: 0, ...extra });
const cond = (extra: Partial<ConditionCalc>): ConditionCalc => ({
  type: "AREA",
  pitch: 0,
  pitchMode: "COMMON",
  height: 0,
  depth: 0,
  spacing: 16,
  overhang: 0,
  ...extra,
});

describe("geometry", () => {
  it("measures a 20' × 12' room", () => {
    assert.equal(polygonArea(ROOM) / UPF ** 2, 240);
    assert.equal(polygonPerimeter(ROOM) / UPF, 64);
  });

  it("formats feet and inches", () => {
    assert.equal(feetInches(12.5), "12'-6\"");
    assert.equal(feetInches(22.713), "22'-9\"");
  });
});

describe("areas, lines and counts", () => {
  it("area, volume and squares", () => {
    const m = measurementMetrics(cond({ type: "AREA", depth: 4 }), shape(ROOM), UPF);
    assert.equal(m.area, 240);
    assert.equal(m.squares, 2.4);
    near(m.volume, 2.963, 0.001, '4" slab cy');
  });

  it("deductions subtract", () => {
    assert.equal(measurementMetrics(cond({ type: "AREA" }), shape(ROOM, { isDeduction: true }), UPF).area, -240);
  });

  it("pitched area", () => {
    near(measurementMetrics(cond({ type: "AREA", pitch: 6 }), shape(ROOM), UPF).area, 268.328, 0.001, "6/12 roof area");
  });

  it("linear length and wall area", () => {
    const m = measurementMetrics(cond({ type: "LINEAR", height: 8 }), shape(ROOM.slice(0, 3)), UPF);
    assert.equal(m.length, 32);
    assert.equal(m.wall_area, 256);
  });

  it("a line's own wall height wins over the takeoff's", () => {
    const m = measurementMetrics(cond({ type: "LINEAR", height: 8 }), shape(ROOM.slice(0, 3), { height: 10 }), UPF);
    assert.equal(m.length, 32);
    assert.equal(m.wall_area, 320);
    assert.equal(measurementMetrics(cond({ type: "LINEAR", height: 8 }), shape(ROOM.slice(0, 3), { height: null }), UPF).wall_area, 256);
  });
});

describe("pitch factors", () => {
  it("common rafter slope", () => near(slopeFactor(6), 1.118, 0.001));
  it("hip with equal pitches", () => {
    near(hipFactor(6), 1.0607, 0.0001, "6/12 hip");
    near(hipFactor(12), 1.2247, 0.0001, "12/12 hip");
  });
  it("hip with two different pitches", () => near(hipFactor(8, 12), 1.1435, 0.0001, "8/12 meets 12/12"));
  it("level when either side is 0 (ridges)", () => {
    assert.equal(hipFactor(0, 0), 1);
    assert.equal(hipFactor(6, 0), 1);
  });
  it("hip overhang runs through the soffit corner", () => {
    near(hipOverhangPlan(1, 6, 6), Math.SQRT2, 1e-9, "equal pitches");
    near(hipOverhangPlan(1, 8, 12), 1.2019, 0.0001, "steeper fascia first");
    assert.equal(hipOverhangPlan(1, 0, 0), 1);
  });
});

describe("joists and rafters", () => {
  const joists = cond({ type: "FRAMING" });

  it("20' × 12' room at 16\" o.c. along the long wall: 10 joists of 20'", () => {
    const m = measurementMetrics(joists, shape(ROOM), UPF);
    assert.equal(m.members, 10);
    assert.equal(m.member_lf, 200);
  });

  it("same room turned 90°: 16 joists of 12'", () => {
    const m = measurementMetrics(joists, shape(ROOM, { angle: Math.PI / 2 }), UPF);
    assert.equal(m.members, 16);
    assert.equal(m.member_lf, 192);
  });

  it("L-shaped room", () => {
    const L: Pt[] = [
      [0, 0],
      [240, 0],
      [240, 72],
      [120, 72],
      [120, 144],
      [0, 144],
    ];
    const m = measurementMetrics(joists, shape(L), UPF);
    assert.equal(m.members, 10);
    near(m.member_lf, 150, 0.001);
  });

  it("an outline drawn slightly out of square has no sliver member at the far wall", () => {
    // The 16' sliver bug on the Stoute House: far wall a few inches off square.
    const skewed: Pt[] = [
      [0, 0],
      [240, 0],
      [244, 144],
      [0, 144],
    ];
    const lengths = framingLengths(joists, shape(skewed, { angle: Math.PI / 2 }), UPF);
    assert.equal(lengths.length, 17);
    assert.ok(Math.min(...lengths) > 11.5, `shortest member ${Math.min(...lengths)}`);
  });

  it('6/12 rafters with a 12" overhang', () => {
    const rafters = cond({ type: "FRAMING", pitch: 6, overhang: 12 });
    const lengths = framingLengths(rafters, shape(ROOM), UPF);
    near(lengths[0], 21 * slopeFactor(6), 0.001, "rafter length");
  });

  it("an outline's own pitch overrides the condition's", () => {
    const flat = cond({ type: "FRAMING" });
    const at6 = framingLengths(flat, shape(ROOM, { angle: Math.PI / 2, pitch: 6 }), UPF);
    const at10 = framingLengths(flat, shape(ROOM, { angle: Math.PI / 2, pitch: 10 }), UPF);
    near(at6[0], 13.416, 0.001, "6/12");
    near(at10[0], 15.62, 0.001, "10/12");
  });
});

describe("hips, valleys and ridges", () => {
  const line: Pt[] = [
    [0, 0],
    [240, 0],
  ]; // 20' on plan
  const hips = cond({ type: "HIP_VALLEY", pitch: 6, overhang: 12, memberSize: "2x10", stockLengths: "8-24" });

  it('6/12 hip with 12" overhang', () => {
    const m = measurementMetrics(hips, shape(line), UPF);
    near(m.plan_length, 21.414, 0.001, "plan");
    near(m.member_lf, 22.713, 0.001, "true length");
    assert.equal(m.members, 1);
    assert.equal(m.stock_lf, 24);
    near(m.board_feet, 40, 0.001, "2x10 bf");
  });

  it("a line's own pitches override the condition's", () => {
    near(measurementMetrics(hips, shape(line, { pitch: 8, pitch2: 12 }), UPF).member_lf, 24.245, 0.001);
  });

  it("ridge at 0 & 0 adds the overhang straight", () => {
    near(measurementMetrics({ ...hips, pitch: 0 }, shape(line), UPF).member_lf, 21, 1e-9);
  });

  it("hips and valleys are never packed together", () => {
    const r = framingBoards(hips, [
      { m: shape(line), unitsPerFoot: UPF },
      {
        m: shape([
          [0, 0],
          [36, 0],
        ]),
        unitsPerFoot: UPF,
      },
    ]);
    assert.equal(r.boards.length, 0);
    assert.deepEqual(r.cutList, [
      [8, 1],
      [24, 1],
    ]);
  });
});

describe("stock lengths and cut packing", () => {
  it("parses stock length lists and ranges", () => {
    assert.deepEqual(parseStockLengths("16-24"), [16, 18, 20, 22, 24]);
    assert.deepEqual(parseStockLengths("12, 14,16 20"), [12, 14, 16, 20]);
    assert.equal(parseStockLengths(""), null);
  });

  it("rounds a member up to stock, splicing past the longest", () => {
    assert.equal(stockLength(15.2), 16);
    assert.equal(stockLength(3), 8);
    assert.deepEqual(stockPieces(15.2, [12, 14, 16]), [16]);
    assert.deepEqual(stockPieces(30, [12, 14, 16]), [16, 14]);
  });

  it("4' + 8' + 2' on 16-24 stock is one 16' board", () => {
    assert.deepEqual(packBoards([4, 8, 2], parseStockLengths("16-24")).cutList, [[16, 1]]);
  });

  it("full-length members still get a board each", () => {
    assert.deepEqual(packBoards(Array(18).fill(19.6), parseStockLengths("16-24")).cutList, [[20, 18]]);
  });

  it("short jacks share boards and order far fewer lineal feet", () => {
    const jacks = Array.from({ length: 19 }, (_, i) => 1.75 + i * 0.735);
    const cuts = [...jacks, ...jacks];
    const { cutList } = packBoards(cuts, parseStockLengths("16-32"));
    const ordered = cutList.reduce((s, [len, n]) => s + len * n, 0);
    const needed = cuts.reduce((a, b) => a + b, 0);
    assert.ok(ordered >= needed, "never orders less than the cuts need");
    assert.ok(ordered <= needed * 1.1, `ordered ${ordered} lf for ${needed.toFixed(1)} lf of cuts`);
  });
});

describe("beams", () => {
  // An 18' span (UPF = 12 units per foot), 3" bearing each end.
  const span: Pt[] = [
    [0, 0],
    [216, 0],
  ];
  const opts = (bearingIn: number, plies: number) => JSON.stringify({ bearingIn, plies });

  it("a glulam is the span plus bearing at both ends: 18' + 6\" = 18'-6\"", () => {
    const c = cond({ type: "BEAM", memberSize: "GLB 5-1/8x12", options: opts(3, 1), soldAs: "EXACT_LF" });
    assert.deepEqual(memberLengths(c, shape(span), UPF), [18.5]);
    const m = measurementMetrics(c, shape(span), UPF);
    assert.equal(m.members, 1);
    assert.equal(m.plan_length, 18);
    assert.equal(m.member_lf, 18.5);
  });

  it("a 3-ply LVL orders three pieces", () => {
    const c = cond({ type: "BEAM", memberSize: "LVL 1-3/4x11-7/8", options: opts(3, 3), soldAs: "EXACT_LF" });
    const m = measurementMetrics(c, shape(span), UPF);
    assert.equal(m.members, 3);
    assert.equal(m.member_lf, 55.5);
    assert.deepEqual(framingBoards(c, [{ m: shape(span), unitsPerFoot: UPF }]).cutList, [[18.5, 3]]);
  });

  it("sold in stock lengths, each beam gets the shortest one that fits (no sharing)", () => {
    const c = cond({ type: "BEAM", memberSize: "GLB 5-1/8x12", options: opts(3, 1), stockLengths: "16-24" });
    const shapes = [shape(span), shape(span)].map((m) => ({ m, unitsPerFoot: UPF }));
    assert.deepEqual(framingBoards(c, shapes).cutList, [[20, 2]]);
  });

  it("reads its settings forgivingly", () => {
    assert.deepEqual(beamOptions(null), { bearingIn: 3, plies: 1 });
    assert.deepEqual(beamOptions('{"bearingIn": 4.5, "plies": 2}'), { bearingIn: 4.5, plies: 2 });
    assert.deepEqual(beamOptions('{"bearingIn": -1, "plies": 0}'), { bearingIn: 3, plies: 1 });
  });
});

describe("items shared by several takeoffs round up once", () => {
  it("two rafter takeoffs needing 0.39 and 0.41 boxes of clips buy 1 box, not 2", () => {
    const out = roundOncePerItem([
      { roundKey: "clips", raw: 0.39, quantity: 1 },
      { roundKey: "clips", raw: 0.41, quantity: 1 },
    ]);
    assert.deepEqual(
      out.map((l) => l.quantity),
      [0, 1],
    );
  });

  it("the whole units go to whoever needs the most, and add up to the job's total", () => {
    const out = roundOncePerItem([
      { roundKey: "x", raw: 2.2, quantity: 3 },
      { roundKey: "x", raw: 1.7, quantity: 2 },
      { roundKey: "x", raw: 0.6, quantity: 1 },
    ]);
    // 4.5 → 5: floors 2 + 1 + 0, the two left go to the biggest remainders (0.7, 0.6).
    assert.deepEqual(
      out.map((l) => l.quantity),
      [2, 2, 1],
    );
  });

  it("an item only one takeoff uses, or one not bought whole, is left alone", () => {
    const out = roundOncePerItem([{ roundKey: "solo", raw: 0.3, quantity: 1 }, { quantity: 12.5 }]);
    assert.deepEqual(
      out.map((l) => l.quantity),
      [1, 12.5],
    );
  });
});

describe("packing choices and waste boards", () => {
  it("one length: every board that length, a longer piece gets the shortest that fits", () => {
    assert.deepEqual(packBoards([12, 11, 7, 5], parseStockLengths("16-32"), { mode: "LENGTH", length: 26 }).cutList, [[26, 2]]);
    assert.deepEqual(packBoards([29, 5], parseStockLengths("16-32"), { mode: "LENGTH", length: 26 }).cutList, [
      [26, 1],
      [30, 1],
    ]);
  });

  it("cheapest picks the lower cost, not the fewest feet", () => {
    const stock = parseStockLengths("16, 32");
    const prices = { 16: 20, 32: 30 };
    assert.deepEqual(packBoards([15, 15], stock).cutList, [[16, 2]]);
    const r = packBoards([15, 15], stock, { mode: "CHEAPEST", prices });
    assert.deepEqual(r.cutList, [[32, 1]]);
    assert.equal(r.cost, 30);
  });

  it("cheapest gives long pieces their own boards when long boards cost more per foot", () => {
    // 22' boards cost double: 15.7' + 5.2' on one 22' ($22) loses to two 16's ($20).
    const r = packBoards([21.4, 15.7, 5.2], parseStockLengths("16-22"), { mode: "CHEAPEST", prices: { 16: 10, 18: 10.2, 20: 10.4, 22: 22 } });
    assert.deepEqual(r.cutList, [
      [16, 2],
      [22, 1],
    ]);
    assert.equal(r.cost, 42);
  });

  it("cheapest with no prices packs for least waste and says so", () => {
    const r = packBoards([15, 15], parseStockLengths("16, 32"), { mode: "CHEAPEST", prices: {} });
    assert.equal(r.mode, "WASTE");
    assert.equal(r.noPrices, true);
    assert.deepEqual(r.cutList, [[16, 2]]);
  });

  it("an unpriced length is estimated from the nearest priced one's price per foot", () => {
    assert.deepEqual(boardPrice(32, { 18: 14.4 }), { price: 25.6, estimated: true });
    assert.deepEqual(boardPrice(18, { 18: 14.4 }), { price: 14.4, estimated: false });
    assert.equal(boardPrice(18, {}), null);
  });

  it("waste is added once, as boards of the most-used length", () => {
    assert.deepEqual(
      wasteBoards(
        [
          [16, 1],
          [26, 5],
        ],
        10,
      ),
      { length: 26, count: 1 },
    );
    // 1,218 lf × 10% = 121.8 lf → six 22' boards (not one extra of every length).
    assert.deepEqual(
      wasteBoards(
        [
          [16, 8],
          [18, 2],
          [20, 23],
          [22, 27],
        ],
        10,
      ),
      { length: 22, count: 6 },
    );
    assert.equal(wasteBoards([[16, 1]], 0), null);
  });

  it("lumber piece lines don't add waste again", () => {
    const line = { metric: "pieces:26", qty: 1, per: 1, wastePct: 10, roundUp: true };
    assert.equal(assemblyQuantity(line, emptyMetrics(), [[26, 6]]), 6);
  });
});

describe("member sizes and item names", () => {
  it("reads lumber sizes", () => {
    assert.deepEqual(parseMemberSize("2x8"), { t: 2, w: 8 });
    assert.deepEqual(parseMemberSize("LVL 1-3/4x11-7/8"), { t: 1.75, w: 11.875 });
    assert.equal(parseMemberSize("rafter"), null);
  });

  it("matches Item List names regardless of case, spaces and inch marks", () => {
    assert.equal(itemNameKey("Concrete"), itemNameKey(" concrete "));
    assert.equal(itemNameKey('1/2" 4x12 Drywall'), itemNameKey("1/2 4x12 drywall"));
  });
});

describe("assemblies", () => {
  it("1 drywall sheet per 32 sf + 10%, rounded up", () => {
    const metrics = measurementMetrics(cond({ type: "AREA" }), shape(ROOM), UPF);
    assert.equal(assemblyQuantity({ qty: 1, per: 32, wastePct: 10, roundUp: true, metric: "area" }, metrics), 9);
  });

  it("lumber lines count pieces of their stock length (waste is already in the count)", () => {
    const metrics = measurementMetrics(cond({ type: "AREA" }), shape(ROOM), UPF);
    assert.equal(assemblyQuantity({ qty: 1, per: 1, wastePct: 10, roundUp: true, metric: "pieces:20" }, metrics, [[20, 18]]), 18);
  });
});

describe("walls", () => {
  const ext: WallOptions = {
    ...DEFAULT_WALL_OPTIONS,
    topPlates: 2,
    bottomPlates: 1,
    treatedBottom: true,
    topPlateStock: "16",
    bottomPlateStock: "16",
    sheathingSides: 1,
    sheathingItem: "OSB",
    drywallSides: 1,
    drywallItem: "Drywall",
    baseSides: 1,
    baseItem: "Base",
  };
  const extWall = { studSize: "2x6", spacing: 16, heightFt: 9 };
  // The 20' × 12' room traced as one closed loop back to the first corner: 64' of wall.
  const loop: Pt[] = [...ROOM, ROOM[0]];
  const qty = (lines: { key: string; qty: number }[], key: string) => lines.find((l) => l.key === key)?.qty ?? 0;

  it("precut studs for 8', 9' and 10' walls", () => {
    assert.equal(inchesText(precutStudLength(8)), '92-5/8"');
    assert.equal(inchesText(precutStudLength(9)), '104-5/8"');
    assert.equal(inchesText(precutStudLength(10)), '116-5/8"');
  });

  it("reads a traced run: length, closed, corners", () => {
    assert.deepEqual(wallRun(loop, UPF), { lengthFt: 64, closed: true, corners: 4 });
    assert.deepEqual(
      wallRun(
        [
          [0, 0],
          [144, 0],
          [144, 96],
        ],
        UPF,
      ),
      { lengthFt: 20, closed: false, corners: 1 },
    );
  });

  it("a closed 64' building loop, figured full height (no openings taken out)", () => {
    const { lines, length, area } = wallTakeoff(extWall, ext, [wallRun(loop, UPF)]);
    assert.equal(length, 64);
    assert.equal(area, 576);
    // 48 studs at 16" o.c. + 4 corners × 2
    assert.equal(qty(lines, "studs"), 56);
    assert.equal(lines.find((l) => l.key === "studs")?.name, '2x6 × 92-5/8" precut stud');
    // 64' × 2 top plates in 16' boards; the treated bottom plate is its own lumber
    assert.equal(qty(lines, "top:16"), 8);
    assert.equal(qty(lines, "bottom:16"), 4);
    assert.equal(lines.find((l) => l.key === "bottom:16")?.name, "2x6 treated × 16'");
    near(qty(lines, "sheathing"), 576 / 32, 1e-9, "OSB sheets");
    near(qty(lines, "drywall"), 576 / 32, 1e-9, "drywall sheets");
    assert.equal(qty(lines, "base"), 64);
  });

  it("the same loop as four separate walls (Find walls) frames the same: corners where they meet", () => {
    const walls = [0, 1, 2, 3].map((i) => ({ sheetId: "s", points: [ROOM[i], ROOM[(i + 1) % 4]] as Pt[], unitsPerFoot: UPF }));
    const joined = wallNetworks(walls);
    assert.equal(joined.length, 1);
    const a = wallTakeoff(extWall, ext, joined).lines;
    const b = wallTakeoff(extWall, ext, [wallRun(loop, UPF)]).lines;
    assert.equal(qty(a, "studs"), qty(b, "studs"));
    // Plates go wall by wall (a plate can't turn a corner): 20' walls take a 16' and a piece.
    assert.ok(qty(a, "top:16") >= qty(b, "top:16"));
    // Two walls of an L: one closing stud, one corner — like the L traced as one run.
    const l = wallNetworks(walls.slice(0, 2));
    assert.deepEqual(
      wallTakeoff(extWall, ext, l).lines.find((x) => x.key === "studs")?.qty,
      wallTakeoff(extWall, ext, [wallRun([ROOM[0], ROOM[1], ROOM[2]], UPF)]).lines.find((x) => x.key === "studs")?.qty,
    );
    // A wall by itself, or on another sheet, counts on its own.
    assert.equal(wallNetworks([walls[0], { ...walls[1], sheetId: "other" }]).length, 2);
    // A wall drawn in two straight pieces: no corner where they meet.
    const half = [
      { sheetId: "s", points: [ROOM[0], [(ROOM[0][0] + ROOM[1][0]) / 2, ROOM[0][1]]] as Pt[], unitsPerFoot: UPF },
      { sheetId: "s", points: [[(ROOM[0][0] + ROOM[1][0]) / 2, ROOM[0][1]], ROOM[1]] as Pt[], unitsPerFoot: UPF },
    ];
    assert.equal(wallNetworks(half)[0].corners, 0);
  });

  it("an open interior run: closing stud, plates packed together, drywall both sides", () => {
    const int: WallOptions = { ...ext, treatedBottom: false, sheathingSides: 0, drywallSides: 2, baseSides: 2 };
    const { lines } = wallTakeoff({ studSize: "2x4", spacing: 16, heightFt: 8 }, int, [
      wallRun(
        [
          [0, 0],
          [144, 0],
        ],
        UPF,
      ),
    ]);
    // 12' run: 9 spaces + 1 to close it
    assert.equal(qty(lines, "studs"), 10);
    // 3 plates × 12' — same lumber top and bottom, so packed together
    assert.equal(qty(lines, "plates:16"), 3);
    near(qty(lines, "drywall"), (2 * 96) / 32, 1e-9, "both sides");
    assert.equal(qty(lines, "base"), 24);
    assert.equal(qty(lines, "sheathing"), 0);
  });

  it("a bend adds the corner studs", () => {
    const { lines } = wallTakeoff({ studSize: "2x4", spacing: 16, heightFt: 8 }, ext, [
      wallRun(
        [
          [0, 0],
          [144, 0],
          [144, 96],
        ],
        UPF,
      ),
    ]);
    // 20': 15 spaces + 1 + 1 corner × 2
    assert.equal(qty(lines, "studs"), 18);
  });
});

describe("openings", () => {
  const qty = (lines: { key: string; qty: number }[], key: string) => lines.find((l) => l.key === key)?.qty ?? 0;

  it("one line is one opening, its length the width", () => {
    const m = measurementMetrics(
      cond({ type: "OPENING" }),
      {
        points: [
          [0, 0],
          [36, 0],
        ],
        isDeduction: false,
        angle: 0,
      },
      UPF,
    );
    assert.equal(m.count, 1);
    assert.equal(m.length, 3);
  });

  it("headers packed into stock, and king & jack studs", () => {
    const o = DEFAULT_OPENING_OPTIONS;
    // A 3' and a 6' opening: 2 plies × 3'-3" and 2 × 6'-3" → a 6'-3" + 3'-3" pair on each of two 10' boards
    const { lines, openings } = openingTakeoff({ size: "2x10", stockLengths: "8-20" }, o, [3, 6]);
    assert.equal(openings, 2);
    assert.equal(qty(lines, "header:10"), 2);
    assert.equal(lines.find((l) => l.key === "header:10")?.name, "2x10 × 10'");
    assert.equal(qty(lines, "studs"), 8);
    assert.equal(lines.find((l) => l.key === "studs")?.name, studItemName("2x4", 92.625));
    assert.equal(lines.length, 2);
  });

  it("no header size = no header line", () => {
    const { lines } = openingTakeoff({ size: null, stockLengths: null }, DEFAULT_OPENING_OPTIONS, [3]);
    assert.equal(
      lines.some((l) => l.key.startsWith("header")),
      false,
    );
    assert.equal(qty(lines, "studs"), 4);
  });

  it("stored options fall back to the defaults when missing or the wrong type", () => {
    const o = parseOptions('{"headerPlies":3,"kingStuds":"lots","bogus":1}', DEFAULT_OPENING_OPTIONS);
    assert.equal(o.headerPlies, 3);
    assert.equal(o.kingStuds, DEFAULT_OPENING_OPTIONS.kingStuds);
    assert.equal("bogus" in o, false);
    assert.deepEqual(parseOptions("not json", DEFAULT_WALL_OPTIONS), DEFAULT_WALL_OPTIONS);
  });
});

describe("arcs", () => {
  it("a half circle through its top point is π × r long", () => {
    // 10' radius: from (-10, 0) over (0, 10) to (10, 0), in feet at UPF 12
    const pts: Pt[] = [
      [-120, 0],
      [0, 120],
      [120, 0],
    ];
    const len = polylineLength(arcPath(pts, [1], false)) / UPF;
    near(len, Math.PI * 10, 0.01, "half-circle length");
    // the same three points without the arc are two straight legs
    near(polylineLength(pts) / UPF, 2 * Math.hypot(10, 10), 1e-9, "straight");
  });

  it("an area with a curved side: 20' × 10' plus a half circle on the 20' side", () => {
    // Rectangle 0..240 × 0..120, the top edge bowed out to a half circle of radius 10'.
    const pts: Pt[] = [
      [0, 0],
      [240, 0],
      [240, 120],
      [120, 240],
      [0, 120],
    ];
    const m = measurementMetrics(cond({ type: "AREA" }), { points: pts, arcs: [3], isDeduction: false, angle: 0 }, UPF);
    near(m.area, 200 + (Math.PI * 100) / 2, 0.1, "area");
    near(m.perimeter, 20 + 10 + 10 + Math.PI * 10, 0.01, "perimeter");
  });

  it("the closing edge of an outline can be the arc", () => {
    // Half disc of radius 10': flat side from (20,10) back to (0,10), curving through (10,0).
    const pts: Pt[] = [
      [0, 120],
      [240, 120],
      [120, 0],
    ];
    const m = measurementMetrics(cond({ type: "AREA" }), { points: pts, arcs: [2], isDeduction: false, angle: 0 }, UPF);
    near(m.area, (Math.PI * 100) / 2, 0.1, "half disc");
  });

  it("a curved wall has no corner at its arc point", () => {
    const run = wallRun(
      [
        [-120, 0],
        [0, 120],
        [120, 0],
        [120, -120],
      ],
      UPF,
      [1],
    );
    near(run.lengthFt, Math.PI * 10 + 10, 0.01, "curved wall + straight leg");
    assert.equal(run.corners, 1);
  });

  it("arc points round-trip through storage", () => {
    const json = pointsJson(
      [
        [0, 0],
        [5, 5],
        [10, 0],
      ],
      [1],
    );
    assert.equal(json, "[[0,0],[5,5,1],[10,0]]");
    assert.deepEqual(parsePoints(json), [
      [0, 0],
      [5, 5],
      [10, 0],
    ]);
    assert.deepEqual(parseArcs(json), [1]);
  });
});

describe("sheet sizes and the Material List order", () => {
  it("the sheet size picked renames the item and is what's counted", () => {
    assert.equal(withSheetSize('1/2" Drywall 4x8', "4x12"), '1/2" Drywall 4x12');
    assert.equal(withSheetSize("Sheetrock", "4x12"), "Sheetrock");
    assert.equal(sheetSizeInName('5/8" Type X 4x10 drywall'), "4x10");
    assert.equal(sheetSizeInName("2x4 × 8'"), null);
    const { lines } = wallTakeoff(
      { studSize: "2x4", spacing: 16, heightFt: 8 },
      { ...DEFAULT_WALL_OPTIONS, drywallSides: 2, drywallItem: '1/2" Drywall 4x8', drywallSheet: "4x12" },
      [
        wallRun(
          [
            [0, 0],
            [144, 0],
          ],
          UPF,
        ),
      ],
    );
    const drywall = lines.find((l) => l.key === "drywall")!;
    assert.equal(drywall.name, '1/2" Drywall 4x12');
    near(drywall.qty, (2 * 96) / 48, 1e-9, "4x12 sheets");
  });

  it("lumber sorts studs first, then treated, then the rest — each by size, then length", () => {
    const names = [
      "2x10 × 22'",
      "Tech Shield",
      "2x6 treated × 16'",
      "2x4 × 16'",
      '2x6 × 104-5/8" precut stud',
      "2x6 × 8'",
      "2x6x16",
      "2x4x9ft stud",
      "2x6 × 10'",
      "LVL 1-3/4x11-7/8 × 20'",
    ];
    assert.deepEqual([...names].sort(compareMaterialNames), [
      "2x4x9ft stud",
      '2x6 × 104-5/8" precut stud',
      "2x6 treated × 16'",
      "2x4 × 16'",
      "2x6 × 8'",
      "2x6 × 10'",
      "2x6x16",
      "2x10 × 22'",
      "LVL 1-3/4x11-7/8 × 20'",
      "Tech Shield",
    ]);
  });
});

describe("studs: precut or cut from stock", () => {
  it("picks the stud for the wall height", () => {
    assert.equal(inchesText(defaultStudLength(9, true)), '104-5/8"');
    assert.equal(defaultStudLength(8, false), 96); // 8' wall → 8' studs
    assert.equal(defaultStudLength(9, false), 120); // 9' wall → 10' studs
    assert.equal(defaultStudLength(10, false), 120);
    assert.equal(defaultStudLength(11, false), 144);
  });

  it("stock studs are ordinary lumber, the same item as plates of that length", () => {
    const { lines } = wallTakeoff({ studSize: "2x6", spacing: 16, heightFt: 9 }, { ...DEFAULT_WALL_OPTIONS, studPrecut: false, studLengthIn: 120 }, [
      wallRun(
        [
          [0, 0],
          [144, 0],
        ],
        UPF,
      ),
    ]);
    assert.equal(lines.find((l) => l.key === "studs")?.name, "2x6 × 10'");
    assert.equal(studItemName("2x4", 92.625, true), '2x4 × 92-5/8" precut stud');
    const opening = openingTakeoff({ size: null, stockLengths: null }, { ...DEFAULT_OPENING_OPTIONS, studSize: "2x6", studPrecut: false, studLengthIn: 120 }, [3]);
    assert.equal(opening.lines.find((l) => l.key === "studs")?.name, "2x6 × 10'");
  });
});

describe("doors", () => {
  const d2868 = { name: "2868 Int prehung", widthIn: 32, heightIn: 80 };
  const d3080 = { name: "3080 Ext entry", widthIn: 36, heightIn: 96 };

  it("names sizes the way framers do", () => {
    assert.equal(doorSizeCode(32, 80), "2868");
    assert.equal(doorSizeCode(36, 96), "3080");
    assert.equal(feetInchesIn(80), `6'8"`);
    assert.equal(feetInchesIn(96), "8'");
  });

  it("each marker is one door; casing is 2 legs + head per side", () => {
    const m = measurementMetrics(cond({ type: "DOOR" }), { points: [[0, 0]], isDeduction: false, angle: 0, door: { widthIn: 32, heightIn: 80 } }, null);
    assert.equal(m.count, 1);
    near(m.casing_lf, (2 * 80 + 32) / 12, 1e-9, "casing one side");
    near(m.door_width_lf, 32 / 12, 1e-9, "width");
  });

  it("counts doors by name and cuts casing from whole sticks", () => {
    // 3 × 2868, both sides: per side two 6'8" legs + a 2'8" head; 7' sticks hold one leg each,
    // and the 2'8" heads pair up (2'8" + 2'8" + kerf ≤ 7').
    const { lines, casingLf, unassigned } = doorTakeoff([d2868, d2868, d2868, { name: null, widthIn: 0, heightIn: 0 }], {
      ...DEFAULT_DOOR_OPTIONS,
      casingItem: "Casing",
      casingSides: 2,
      casingStickFt: 7,
    });
    const qty = (k: string) => lines.find((l) => l.key === k)?.qty ?? 0;
    assert.equal(qty("door:2868 int prehung"), 3);
    assert.equal(unassigned, 1);
    near(casingLf, 3 * 2 * ((2 * 80 + 32) / 12), 1e-9, "casing lf");
    // 12 legs → 12 sticks; 6 heads → 3 sticks
    assert.equal(qty("casing"), 15);
  });

  it("8' doors need longer sticks; no stick length orders by the foot", () => {
    const sticks = doorTakeoff([d3080], { ...DEFAULT_DOOR_OPTIONS, casingItem: "Casing", casingSides: 1, casingStickFt: 16 });
    // one side: 8' + 8' legs on one 16' stick? 8 + 8 + kerf > 16 → 2 sticks; the 3' head shares one of them
    assert.equal(sticks.lines.find((l) => l.key === "casing")?.qty, 2);
    const lf = doorTakeoff([d3080], { ...DEFAULT_DOOR_OPTIONS, casingItem: "Casing", casingSides: 2, casingStickFt: 0 });
    const line = lf.lines.find((l) => l.key === "casing")!;
    assert.equal(line.unit, "lf");
    near(line.qty, 2 * ((2 * 96 + 36) / 12), 1e-9, "lf both sides");
  });
});

describe("windows", () => {
  const w3050 = { name: "3050 SH", widthIn: 36, heightIn: 60 };
  const w2030 = { name: "2030 SH", widthIn: 24, heightIn: 36 };
  const o = { ...DEFAULT_WINDOW_OPTIONS, casingItem: "Casing", casingStickFt: 7, stoolStickFt: 8, apronItem: "Apron", apronStickFt: 8 };

  it("each marker is one window; casing is 2 legs + head", () => {
    const m = measurementMetrics(cond({ type: "WINDOW" }), { points: [[0, 0]], isDeduction: false, angle: 0, door: { widthIn: 36, heightIn: 60 } }, null);
    assert.equal(m.count, 1);
    near(m.casing_lf, (2 * 60 + 36) / 12, 1e-9, "casing");
    near(m.window_width_lf, 3, 1e-9, "width");
  });

  it("counts windows by name; casing, stool and apron each from their own sticks", () => {
    const { lines, unassigned } = windowTakeoff([w3050, w3050, w2030, { name: null, widthIn: 0, heightIn: 0 }], o);
    const qty = (k: string) => lines.find((l) => l.key === k)?.qty ?? 0;
    assert.equal(qty("unit:3050 sh"), 2);
    assert.equal(qty("unit:2030 sh"), 1);
    assert.equal(unassigned, 1);
    // casing on 7' sticks: four 5' legs alone (4), 3' legs/heads pair up (2), the 2' head alone (1)
    assert.equal(qty("casing"), 7);
    // stools 3'-6" ×2 share an 8' stick; the 2'-6" needs another
    assert.equal(qty("stool"), 2);
    // aprons 3'-4" ×2 share one; the 2'-4" needs another
    assert.equal(qty("apron"), 2);
    // the stool is always "Window stool"; cased windows are lined with 1x6 primed (2 × height + width), by the foot
    assert.equal(lines.find((l) => l.key === "stool")?.name, "Window stool");
    const lining = lines.find((l) => l.key === "lining")!;
    assert.equal(lining.name, "1x6 primed");
    near(lining.qty, 2 * (2 * 5 + 3) + (2 * 3 + 2), 1e-9, "lining lf");
  });

  it("uncased windows get only a stool and apron; a head trim can differ from the legs", () => {
    const { lines } = windowTakeoff([{ ...w3050, cased: false }, w3050], { ...o, headItem: "1x6", headStickFt: 8 });
    const qty = (k: string) => lines.find((l) => l.key === k)?.qty ?? 0;
    // one cased window: two 5' legs on 7' sticks; its 3' head on an 8' 1x6; lining 13 lf
    assert.equal(qty("casing"), 2);
    assert.equal(lines.find((l) => l.key === "head")?.name, "1x6");
    assert.equal(qty("head"), 1);
    near(qty("lining"), 13, 1e-9, "lining only for the cased one");
    // both windows get a stool and an apron (3'-6" stools pair up on an 8' stick)
    assert.equal(qty("stool"), 1);
  });

  it("trim with no stick length is ordered by the foot", () => {
    const { lines } = windowTakeoff([w3050], { ...DEFAULT_WINDOW_OPTIONS, apronItem: "Apron" });
    const apron = lines.find((l) => l.key === "apron")!;
    assert.equal(apron.unit, "lf");
    near(apron.qty, (36 + 4) / 12, 1e-9, "apron lf");
    assert.equal(
      lines.some((l) => l.key === "casing"),
      false,
    );
  });

  it("doors: 1x4 legs with a 1x6 head", () => {
    const { lines } = doorTakeoff([{ name: "2868 Int prehung", widthIn: 32, heightIn: 80 }], {
      ...DEFAULT_DOOR_OPTIONS,
      casingItem: "1x4",
      casingSides: 2,
      casingStickFt: 7,
      headItem: "1x6",
      headStickFt: 8,
    });
    const qty = (k: string) => lines.find((l) => l.key === k)?.qty ?? 0;
    assert.equal(qty("casing"), 4); // four 6'-8" legs, one per 7' stick
    assert.equal(qty("head"), 1); // two 2'-8" heads on one 8' 1x6
  });
});
