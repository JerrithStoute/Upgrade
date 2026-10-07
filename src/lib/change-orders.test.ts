import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { changeOrderTotals, effectOnContract, isFullyApproved } from "./change-orders";

// A $4,500 flooring overage (client choice), a $250 change order fee and a $1,000 item with 20% markup.
const lines = [
  { quantity: 1, unitCost: 4500, markupPct: 0 },
  { quantity: 1, unitCost: 250, markupPct: 0 },
  { quantity: 1, unitCost: 1000, markupPct: 20 },
];
const co = (p: Partial<{ profitMode: string; profitValue: number; profitShown: string; taxPct: number; taxShown: string }>) => ({
  profitMode: "NONE",
  profitValue: 0,
  profitShown: "LINE",
  taxPct: 0,
  ...p,
});

describe("change order totals", () => {
  it("adds the lines, with no profit", () => {
    const t = changeOrderTotals(co({}), lines);
    assert.deepEqual([t.subtotal, t.profit, t.total, t.profitLine], [5950, 0, 5950, false]);
  });

  it("adds profit as a % or $ on its own line", () => {
    const pct = changeOrderTotals(co({ profitMode: "PCT", profitValue: 10 }), lines);
    assert.deepEqual([pct.profit, pct.total, pct.profitLine, pct.shown(lines[0])], [595, 6545, true, 4500]);
    const amt = changeOrderTotals(co({ profitMode: "AMOUNT", profitValue: 300 }), lines);
    assert.deepEqual([amt.profit, amt.total], [300, 6250]);
  });

  it("folds profit into the line prices so they add up to the total", () => {
    const t = changeOrderTotals(co({ profitMode: "PCT", profitValue: 10, profitShown: "FOLDED" }), lines);
    assert.equal(t.profitLine, false);
    assert.deepEqual(lines.map(t.shown), [4950, 275, 1320]);
    assert.equal(t.shownSubtotal, 6545);
    assert.equal(t.total, 6545);
  });

  it("lets any line have its own profit — none, a % or a $ — and the rest follow the change order", () => {
    const own = [
      { quantity: 1, unitCost: 475, markupPct: 0 }, // follows the change order (10%)
      { quantity: 1, unitCost: 1200, markupPct: 0, profitMode: "PCT", profitValue: 25 },
      { quantity: 1, unitCost: 100, markupPct: 0, profitMode: "NONE", profitValue: 0 },
      { quantity: 1, unitCost: 300, markupPct: 0, profitMode: "AMOUNT", profitValue: 150 },
    ];
    const folded = changeOrderTotals(co({ profitMode: "PCT", profitValue: 10, profitShown: "FOLDED" }), own);
    assert.deepEqual(own.map(folded.shown), [522.5, 1500, 100, 450]);
    assert.deepEqual([folded.profit, folded.total, folded.shownSubtotal], [497.5, 2572.5, 2572.5]);
    const line = changeOrderTotals(co({ profitMode: "PCT", profitValue: 10 }), own);
    assert.deepEqual([line.profitLine, line.profit, line.feePct, line.shown(own[1])], [true, 497.5, null, 1200]);
    // A change order's $ amount is added once, on top of the lines' own profit.
    const flat = changeOrderTotals(co({ profitMode: "AMOUNT", profitValue: 100 }), own);
    assert.deepEqual([flat.profit, flat.total], [550, 2625]);
  });

  it("puts the tax you pay in the taxed lines, with profit on it — its own line or built in", () => {
    // The flooring and the item taxed at 8%: 4,500 + 360 and (1,000 + 80) × 1.2 = 1,296; the fee isn't.
    const taxed = lines.map((l, i) => ({ ...l, taxed: i !== 1 }));
    const own = changeOrderTotals(co({ profitMode: "PCT", profitValue: 10, taxPct: 8 }), taxed);
    // Lines 4,860 + 250 + 1,296 = 6,406; profit 10% = 640.60; tax shown 360 + 80 = 440.
    assert.deepEqual([own.tax, own.profit, own.total], [440, 640.6, 7046.6]);
    assert.deepEqual([own.shown(taxed[0]), own.shownSubtotal], [4500, 5966]);
    const built = changeOrderTotals(co({ profitMode: "PCT", profitValue: 10, taxPct: 8, taxShown: "FOLDED" }), taxed);
    assert.deepEqual([built.tax, built.taxIn, built.total, built.shown(taxed[0]), built.shownSubtotal], [0, 440, 7046.6, 4860, 6406]);
  });

  it("shows the effect on the contract", () => {
    assert.deepEqual(effectOnContract(250000, 1200, 4500), { basePrice: 250000, previous: 1200, thisOne: 4500, total: 255700 });
  });

  it("is approved only when the client and every listed team member have approved", () => {
    const base = { clientApproval: true, clientApprovedAt: null as Date | null, approverIds: JSON.stringify(["jess"]), teamApprovals: null as string | null };
    assert.equal(isFullyApproved(base), false);
    assert.equal(isFullyApproved({ ...base, clientApprovedAt: new Date() }), false);
    assert.equal(isFullyApproved({ ...base, clientApprovedAt: new Date(), teamApprovals: JSON.stringify({ jess: "2026-10-01" }) }), true);
    assert.equal(isFullyApproved({ ...base, clientApproval: false, teamApprovals: JSON.stringify({ jess: "x" }) }), true);
  });
});
