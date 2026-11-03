import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escalationOf, type SnapshotLine } from "./escalation";

const line = (key: string, qty: number, price: number): SnapshotLine => ({
  key,
  materialItemId: key,
  name: key,
  category: "Framing",
  unit: "ea",
  qty,
  price,
  pinned: false,
  vendor: null,
});

describe("material price escalation", () => {
  it("bid quantities at today's prices, against what was bid", () => {
    const today: Record<string, number> = { studs: 5.5, osb: 30 };
    const e = escalationOf([line("studs", 100, 5), line("osb", 10, 25)], (l) => today[l.key] ?? null, 10);
    assert.equal(e.then, 750);
    assert.equal(e.now, 850);
    assert.equal(e.change, 100);
    assert.equal(e.pct, 13.3);
    assert.equal(e.past, true);
    assert.deepEqual(
      e.lines.map((l) => l.change),
      [50, 50],
    );
  });

  it("must rise MORE than the trigger", () => {
    const e = escalationOf([line("a", 1, 100)], () => 110, 10);
    assert.equal(e.pct, 10);
    assert.equal(e.past, false);
  });

  it("nothing to compare with, or $0 today: the bid price stands", () => {
    const e = escalationOf([line("a", 2, 50), line("b", 1, 20)], (l) => (l.key === "a" ? null : 0), 10);
    assert.equal(e.change, 0);
    assert.equal(e.now, e.then);
  });

  it("a line bid at $0 (not priced then) stays out", () => {
    const e = escalationOf([line("a", 5, 0), line("b", 1, 10)], () => 12, 10);
    assert.equal(e.then, 10);
    assert.equal(e.now, 12);
  });

  it("prices down: a negative change, never past the trigger", () => {
    const e = escalationOf([line("a", 10, 10)], () => 9, 5);
    assert.equal(e.change, -10);
    assert.equal(e.pct, -10);
    assert.equal(e.past, false);
  });
});
