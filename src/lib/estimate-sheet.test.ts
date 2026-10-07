import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { byCategory, groupLooseLines, organizeSheet, rollupTakeoff, lineMath, saveSheetInput, specsTotals, toSaveInput, type SheetSpec } from "./estimate-sheet";
import { newLine, newSpec, sheetReducer, type SheetState } from "./estimate-sheet-state";

function sheet(): SheetState {
  const a = {
    ...newSpec("a", "Framing", "Wall framing"),
    id: "A",
    lines: [
      { ...newLine("a1", 20), id: "A1", quantity: 10, unitCost: 5 },
      { ...newLine("a2", 10), id: "A2", quantity: 2, unitCost: 100 },
    ],
  };
  const b = { ...newSpec("b", "Framing", "Roof framing"), id: "B", lines: [{ ...newLine("b1", 0), id: "B1", quantity: 1, unitCost: 50 }] };
  const c = { ...newSpec("c", "Flooring", "Hardwood"), id: "C", isAllowance: true, lines: [{ ...newLine("c1", 25), id: "C1", quantity: 100, unitCost: 8 }] };
  return { specs: [a, b, c], basePrice: null, totalSqFt: null, values: {}, markup: [], dirty: false };
}

const order = (s: SheetState) => s.specs.map((x) => `${x.category}/${x.key}:${x.lines.map((l) => l.key).join(",")}`);

describe("estimate sheet math", () => {
  it("prices a line as cost plus profit on cost", () => {
    assert.deepEqual(lineMath({ quantity: 10, unitCost: 5, markupPct: 20 }), { cost: 50, tax: 0, profit: 10, price: 60 });
  });

  it("puts the sales tax you pay in a taxed line's cost, with profit on cost and tax", () => {
    // $1,000 of lumber, 8.25% tax, 20% profit: 1,082.50 + 216.50 = 1,299.
    const m = lineMath({ quantity: 1, unitCost: 1000, markupPct: 20, taxPct: 8.25 });
    assert.equal(m.tax, 82.5);
    assert.equal(Math.round(m.profit * 100) / 100, 216.5);
    assert.equal(Math.round(m.price * 100) / 100, 1299);
  });

  it("totals every spec item and leaves optional lines out", () => {
    const s = sheet();
    assert.deepEqual(specsTotals(s.specs), { cost: 50 + 200 + 50 + 800, tax: 0, profit: 10 + 20 + 0 + 200, price: 60 + 220 + 50 + 1000 });
    s.specs[0].lines[1].isOptional = true;
    assert.equal(specsTotals(s.specs).cost, 50 + 50 + 800);
  });

  it("files loose lines into one spec item per category and cost code, named after the code", () => {
    const lines = [
      { id: "1", group: "Framing", costCodeId: "lumber", description: "2x6 studs", sortOrder: 3 },
      { id: "2", group: "Framing", costCodeId: "labor", description: "Framing labor", sortOrder: 1 },
      { id: "3", group: "Framing", costCodeId: "lumber", description: "Plates", sortOrder: 2 },
      { id: "4", group: "Doors", costCodeId: null, description: "Front door", sortOrder: 4 },
      { id: "5", group: "Framing", costCodeId: "lumber", description: "Beam allowance", sortOrder: 5, isAllowance: true },
    ];
    const groups = groupLooseLines(lines, (id) => ({ lumber: "Framing lumber", labor: "Framing labor" })[id]);
    assert.deepEqual(
      groups.map((g) => [g.category, g.name, g.lines.map((l) => l.id)]),
      [
        ["Framing", "Framing labor", ["2"]],
        ["Framing", "Framing lumber", ["3", "1"]],
        ["Doors", "Front door", ["4"]],
        ["Framing", "Beam", ["5"]],
      ],
    );
  });
});

describe("the takeoff on the estimate", () => {
  it("rolls the takeoff up into one line per cost code at total cost", () => {
    const codes: Record<string, { label: string; name: string; division: string; category: string }> = {
      pkg: { label: "3120 Framing Package", name: "Framing Package", division: "3100 Framing", category: "General" },
    };
    const r = rollupTakeoff(
      [
        { costCodeId: "pkg", group: "Walls", quantity: 100, unitCost: 4.25 },
        { costCodeId: "pkg", group: "Roof", quantity: 30, unitCost: 22 },
        { costCodeId: null, group: "Siding", quantity: 10, unitCost: 3 },
        { costCodeId: "deleted", group: "Siding", quantity: 1, unitCost: 5 },
      ],
      (id) => codes[id],
    );
    assert.deepEqual(
      r.map((x) => [x.key, x.cost, x.description, x.name, x.category]),
      [
        ["code:pkg", 1085, "From takeoff — 3120 Framing Package", "3100 Framing", "General"],
        ["group:siding", 35, "From takeoff — Siding (no cost code)", "Siding", "General"],
      ],
    );
  });
});

describe("organizing by your divisions", () => {
  it("folds per-code categories into their cost code category and files it into its division", () => {
    // Built the old way: "1000 Permits and Fees" as the division, each code its own category.
    const spec = (key: string, name: string, category: string, code: string, extra: Partial<SheetSpec> = {}): SheetSpec => ({
      ...newSpec(key, category, name),
      id: key.toUpperCase(),
      lines: [{ ...newLine(`${key}1`, 20), costCodeId: code, description: name }],
      ...extra,
    });
    const specs = [
      spec("legal", "Legal Fees", "1000 Permits and Fees", "1001"),
      spec("permit", "Permit", "1000 Permits and Fees", "1002", { specText: "Building permit by owner" }),
      spec("soil", "Soil Tests", "1000 Permits and Fees", "1003"),
      spec("dig", "Earth Hauling", "2000 Excavation", "2020"),
      spec("exc", "2000 Excavation", "Something", "2001"),
      spec("misc", "Dumpster", "Site", "9999"),
    ];
    const groupOfCode = new Map([
      ["1001", "1000 Permits and Fees"],
      ["1002", "1000 Permits and Fees"],
      ["1003", "1000 Permits and Fees"],
      ["2020", "2000 Excavation"],
      ["2001", "2000 Excavation"],
    ]);
    let n = 0;
    const r = organizeSheet(specs, {
      groupOfCode,
      groups: ["1000 Permits and Fees", "2000 Excavation"],
      divisionOf: { "1000 Permits and Fees": "Preparation Preliminaries", "2000 Excavation": "Excavation and Foundation" },
      order: ["Preparation Preliminaries", "Excavation and Foundation"],
      newKey: () => `new${++n}`,
    });
    assert.deepEqual(
      r.specs.map((s) => [s.category, s.name, s.lines.map((l) => l.key).join(",")]),
      [
        ["Preparation Preliminaries", "1000 Permits and Fees", "legal1,soil1"],
        ["Preparation Preliminaries", "Permit", "permit1"],
        ["Excavation and Foundation", "2000 Excavation", "exc1,dig1"],
        ["Site", "Dumpster", "misc1"],
      ],
    );
    assert.equal(r.changed, 5);
  });
});

describe("editing the sheet", () => {
  it("moves a line above another line, even into another spec item", () => {
    const s = sheetReducer(sheet(), { type: "moveLine", line: "a2", toSpec: null, before: "c1" });
    assert.deepEqual(order(s), ["Framing/a:a1", "Framing/b:b1", "Flooring/c:a2,c1"]);
    assert.equal(s.dirty, true);
  });

  it("moves a line to the end of a spec item", () => {
    const s = sheetReducer(sheet(), { type: "moveLine", line: "a1", toSpec: "b", before: null });
    assert.deepEqual(order(s), ["Framing/a:a2", "Framing/b:b1,a1", "Flooring/c:c1"]);
  });

  it("moves a spec item into another category, taking that category", () => {
    let s = sheetReducer(sheet(), { type: "moveSpec", spec: "a", toCategory: null, before: "c" });
    assert.deepEqual(order(s), ["Framing/b:b1", "Flooring/a:a1,a2", "Flooring/c:c1"]);
    s = sheetReducer(s, { type: "moveSpec", spec: "b", toCategory: "Flooring", before: null });
    assert.deepEqual(order(s), ["Flooring/a:a1,a2", "Flooring/c:c1", "Flooring/b:b1"]);
  });

  it("moves a whole category", () => {
    const s = sheetReducer(sheet(), { type: "moveCategory", category: "Flooring", before: "Framing" });
    assert.deepEqual(order(s), ["Flooring/c:c1", "Framing/a:a1,a2", "Framing/b:b1"]);
  });

  it("keeps a category's items together when an item's category changes", () => {
    const s = sheetReducer(sheet(), { type: "spec", spec: "a", patch: { category: "Flooring" } });
    assert.deepEqual(order(s), ["Framing/b:b1", "Flooring/c:c1", "Flooring/a:a1,a2"]);
  });

  it("renaming a one-line item renames its line too, unless the line has its own name", () => {
    const start = sheet();
    start.specs[1].lines[0].description = "Roof framing";
    let s = sheetReducer(start, { type: "spec", spec: "b", patch: { name: "Roof structure" } });
    assert.equal(s.specs[1].lines[0].description, "Roof structure");
    s = sheetReducer(s, { type: "line", spec: "b", line: "b1", patch: { description: "Trusses" } });
    s = sheetReducer(s, { type: "spec", spec: "b", patch: { name: "Roof" } });
    assert.equal(s.specs[1].lines[0].description, "Trusses");
  });

  it("renaming a category to an existing one merges them", () => {
    const s = sheetReducer(sheet(), { type: "renameCategory", from: "Flooring", to: "Framing" });
    assert.deepEqual(
      byCategory(s.specs).map(([c, x]) => [c, x.length]),
      [["Framing", 3]],
    );
  });

  it("duplicates a spec item as new rows, not tied to the takeoff", () => {
    const start = sheet();
    start.specs[0].lines[0].fromTakeoff = true;
    const s = sheetReducer(start, { type: "duplicateSpec", spec: "a", key: "a-copy", lineKeys: ["x1", "x2"] });
    const copy = s.specs[1];
    assert.equal(copy.name, "Wall framing (copy)");
    assert.equal(copy.id, null);
    assert.deepEqual(
      copy.lines.map((l) => [l.id, l.key, l.fromTakeoff]),
      [
        [null, "x1", false],
        [null, "x2", false],
      ],
    );
  });

  it("a formula sets the quantity, a parameter change updates it, and typing a number unlinks it", () => {
    let s = sheetReducer(sheet(), { type: "paramValue", id: "sf", value: 2000 });
    s = sheetReducer(s, { type: "line", spec: "a", line: "a1", patch: { qtyFormula: "[#sf] * 1.1" } });
    assert.equal(s.specs[0].lines[0].quantity, 2200);
    s = sheetReducer(s, { type: "paramValue", id: "sf", value: 2500 });
    assert.equal(s.specs[0].lines[0].quantity, 2750);
    assert.equal(s.specs[0].lines[1].quantity, 2); // not linked: unchanged
    s = sheetReducer(s, { type: "line", spec: "a", line: "a1", patch: { quantity: 12 } });
    assert.deepEqual([s.specs[0].lines[0].quantity, s.specs[0].lines[0].qtyFormula], [12, null]);
    s = sheetReducer(s, { type: "line", spec: "a", line: "a2", patch: { qtyFormula: "[#sf]", description: "x" } });
    s = sheetReducer(s, { type: "line", spec: "a", line: "a2", patch: { description: "Studs" } });
    assert.equal(s.specs[0].lines[1].qtyFormula, "[#sf]"); // other edits keep the link
  });

  it("a unit cost can come from a parameter too", () => {
    let s = sheetReducer(sheet(), { type: "paramValue", id: "rate", value: 85 });
    s = sheetReducer(s, { type: "line", spec: "a", line: "a1", patch: { costFormula: "[#rate] * 1.1" } });
    assert.equal(s.specs[0].lines[0].unitCost, 93.5);
    s = sheetReducer(s, { type: "paramValue", id: "rate", value: 90 });
    assert.equal(s.specs[0].lines[0].unitCost, 99);
    s = sheetReducer(s, { type: "patchLines", lines: ["a1"], patch: { unitCost: 50 } });
    assert.deepEqual([s.specs[0].lines[0].unitCost, s.specs[0].lines[0].costFormula], [50, null]);
  });

  it("lines follow the table's profit % unless you changed them by hand", () => {
    const row = { id: "p", name: "Profit", kind: "PROFIT" as const, pct: 20, basis: "MARKUP" as const, appliesTo: "ALL", costCodeId: null, inAllowance: false };
    let s: SheetState = { ...sheet(), markup: [row] };
    s = sheetReducer(s, { type: "markup", rows: [{ ...row, pct: 22 }] });
    // a1 was at 20 (the table) -> 22; a2 was at 10 (by hand) -> stays
    assert.deepEqual(
      s.specs[0].lines.map((l) => l.markupPct),
      [22, 10],
    );
    // labor at 25%: a line at the table % takes it when its cost type changes
    s = sheetReducer(s, {
      type: "markup",
      rows: [
        { ...row, pct: 22 },
        { ...row, id: "l", pct: 25, appliesTo: "LABOR" },
      ],
    });
    s = sheetReducer(s, { type: "line", spec: "a", line: "a1", patch: { costType: "LABOR" } });
    assert.equal(s.specs[0].lines[0].markupPct, 47); // 22 (all) + 25 (labor)
  });

  it("adds a line just above the line it's dropped on", () => {
    const s = sheetReducer(sheet(), { type: "addLine", spec: null, before: "c1", key: "n1", markupPct: 15, init: { costCodeId: "tile", description: "Tile" } });
    assert.deepEqual(order(s), ["Framing/a:a1,a2", "Framing/b:b1", "Flooring/c:n1,c1"]);
    assert.deepEqual([s.specs[2].lines[0].costCodeId, s.specs[2].lines[0].markupPct], ["tile", 15]);
  });

  it("adds an item at the end of its category", () => {
    const s = sheetReducer(sheet(), { type: "addSpec", category: "Framing", key: "n" });
    assert.deepEqual(order(s), ["Framing/a:a1,a2", "Framing/b:b1", "Framing/n:", "Flooring/c:c1"]);
  });

  it("deletes picked lines and edits them in bulk", () => {
    let s = sheetReducer(sheet(), { type: "patchLines", lines: ["a1", "c1"], patch: { costType: "LABOR" } });
    assert.deepEqual(
      s.specs.flatMap((x) => x.lines.map((l) => l.costType)),
      ["LABOR", "MATERIAL", "MATERIAL", "LABOR"],
    );
    s = sheetReducer(s, { type: "deleteLines", lines: ["a1", "b1"] });
    assert.deepEqual(order(s), ["Framing/a:a2", "Framing/b:", "Flooring/c:c1"]);
  });
});

describe("saving the sheet", () => {
  it("sends what the server accepts, without the screen's keys", () => {
    const s = sheet();
    const input = toSaveInput(s.specs as SheetSpec[], { specIds: ["A", "B", "C"], lineIds: ["A1", "A2", "B1", "C1"] }, { basePrice: 1500, totalSqFt: 2000 });
    const parsed = saveSheetInput.parse(input);
    assert.equal(parsed.specs.length, 3);
    assert.ok(!("key" in parsed.specs[0]) && !("key" in parsed.specs[0].lines[0]));
    assert.equal(parsed.basePrice, 1500);
  });

  it("refuses numbers that aren't numbers", () => {
    const s = sheet();
    s.specs[0].lines[0].quantity = Number.NaN;
    assert.equal(saveSheetInput.safeParse(toSaveInput(s.specs, { specIds: [], lineIds: [] }, { basePrice: null, totalSqFt: null })).success, false);
  });
});
