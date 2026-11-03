import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePriceSheet, sheetCategories, shownLines, DEFAULT_PRICE_SHEET } from "./price-sheet";
import type { EscalationLine } from "./escalation";

const line = (key: string, category: string, qty: number, price: number, today: number): EscalationLine => ({
  key,
  materialItemId: key,
  name: key,
  category,
  unit: "ea",
  qty,
  price,
  pinned: false,
  vendor: null,
  today,
  change: Math.round(qty * (today - price) * 100) / 100,
});

describe("price change sheet", () => {
  const lines = [line("studs", "Framing", 100, 5, 6), line("nails", "Framing", 10, 10, 10), line("osb", "Framing", 10, 20, 30), line("tile", "Flooring", 50, 2, 1.5)];

  it("totals count every item in the categories shown, unchanged ones too", () => {
    const s = sheetCategories(lines);
    assert.equal(s.then, 900);
    assert.equal(s.now, 1075);
    assert.equal(s.change, 175);
    assert.equal(s.pct, 19.4);
    const framing = s.categories.find((c) => c.name === "Framing")!;
    assert.equal(framing.change, 200);
    assert.equal(framing.unchanged, 1);
    assert.equal(framing.unchangedTotal, 100);
  });

  it("a category left off is out of the totals", () => {
    const s = sheetCategories(lines, ["Flooring"]);
    assert.equal(s.categories.length, 1);
    assert.equal(s.change, 200);
    assert.equal(s.pct, 25);
  });

  it("lists what moved, biggest first; unchanged items only when asked", () => {
    const framing = sheetCategories(lines).categories.find((c) => c.name === "Framing")!;
    assert.deepEqual(
      shownLines(framing, false).map((l) => l.key),
      ["studs", "osb"],
    );
    assert.deepEqual(
      shownLines(framing, true).map((l) => l.key),
      ["studs", "osb", "nails"],
    );
  });

  it("bad or missing settings fall back to the built-in sheet", () => {
    assert.deepEqual(parsePriceSheet(null), DEFAULT_PRICE_SHEET);
    assert.deepEqual(parsePriceSheet("not json"), DEFAULT_PRICE_SHEET);
    const o = parsePriceSheet(JSON.stringify({ items: false, heading: 5 }));
    assert.equal(o.items, false);
    assert.equal(o.heading, "Material price change");
  });
});
