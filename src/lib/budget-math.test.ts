import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { budgetTotals, jobProjectedCost, projectedCost, projectedWhy } from "./budget-math";

const money = (n: number) => `$${n}`;

describe("projectedCost", () => {
  it("is the budget with no bid and little spent", () => {
    assert.equal(projectedCost({ budget: 2400, committed: null, spent: 1150, done: false }), 2400);
  });
  it("is what's spent once spending passes the budget", () => {
    assert.equal(projectedCost({ budget: 6500, committed: null, spent: 6820, done: false }), 6820);
  });
  it("uses the bid, over or under the budget", () => {
    assert.equal(projectedCost({ budget: 48200, committed: 51900, spent: 22400, done: false }), 51900);
    assert.equal(projectedCost({ budget: 21000, committed: 19800, spent: 0, done: false }), 19800);
  });
  it("is exactly what's spent when Done, and follows a later bill", () => {
    assert.equal(projectedCost({ budget: 2400, committed: null, spent: 1150, done: true }), 1150);
    assert.equal(projectedCost({ budget: 2400, committed: null, spent: 1150 + 300, done: true }), 1450);
  });
});

describe("projectedWhy", () => {
  it("says a Done line never needs unchecking", () => {
    assert.match(projectedWhy({ budget: 1, committed: null, spent: 5, done: true }, money), /Nothing to uncheck/);
  });
  it("names the bid when it's used", () => {
    assert.match(projectedWhy({ budget: 10, committed: 8, spent: 2, done: false }, money), /committed \$8/);
  });
});

describe("budgetTotals", () => {
  it("adds up lines and counts Done, leaving out the unsorted line", () => {
    const t = budgetTotals([
      { budget: 6500, committed: null, spent: 6820, done: true, price: 8100, invoiced: 8100 },
      { budget: 2400, committed: null, spent: 1150, done: false, price: 3000, invoiced: 0 },
      { budget: 0, committed: null, spent: 1340, done: false, price: 0, invoiced: 0, unsorted: true },
    ]);
    assert.deepEqual([t.budget, t.spent, t.projected, t.done, t.lines, t.price], [8900, 9310, 6820 + 2400 + 1340, 1, 2, 11100]);
  });
});

describe("jobProjectedCost", () => {
  const base = {
    budget: [
      { costCodeId: "lumber", amount: 48200 },
      { costCodeId: "drywall", amount: 21000 },
      { costCodeId: "dumpster", amount: 2400 },
    ],
    spent: [
      { costCodeId: "lumber", amount: 22400 },
      { costCodeId: "dumpster", amount: 1150 },
      { costCodeId: null, amount: 640 },
    ],
    pos: [],
    awards: [
      { bidId: "b1", codeKey: "lumber", lines: [{ codeKey: "lumber", quantity: 1, unitPrice: 51900 }] },
      { bidId: "b2", codeKey: "sub:drywall", lines: [{ codeKey: "drywall", quantity: 1, unitPrice: 19800 }] },
    ],
    done: [] as string[],
  };
  it("adds each line's projected, as the Budget tab does", () => {
    assert.equal(jobProjectedCost(base), 51900 + 19800 + 2400 + 640);
  });
  it("uses what's spent on a Done line", () => {
    assert.equal(jobProjectedCost({ ...base, done: ["dumpster"] }), 51900 + 19800 + 1150 + 640);
  });
  it("counts a PO made from a bid once, and skips draft POs", () => {
    const pos = [
      { status: "SENT", bidId: "b1", lines: [{ costCodeId: "lumber", quantity: 1, unitCost: 52500 }] },
      { status: "DRAFT", bidId: null, lines: [{ costCodeId: "dumpster", quantity: 1, unitCost: 9999 }] },
    ];
    assert.equal(jobProjectedCost({ ...base, pos }), 52500 + 19800 + 2400 + 640);
  });
});
