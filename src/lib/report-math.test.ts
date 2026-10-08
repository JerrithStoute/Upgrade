import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agingBucket, daysLate, jobNumbers, periodOf, periods } from "./report-math";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("job numbers", () => {
  it("works out WIP by cost-to-cost", () => {
    // $100k contract, $80k budget, $40k spent → 50% done, $50k earned.
    const j = jobNumbers({ contract: 100000, budgetCost: 80000, actualCost: 40000, billed: 60000, collected: 45000 });
    assert.equal(j.pctComplete, 0.5);
    assert.equal(j.earned, 50000);
    assert.equal(j.overUnder, 10000); // over-billed
    assert.equal(j.costToFinish, 40000);
    assert.equal(j.projectedProfit, 20000);
    assert.equal(j.profitToDate, 10000);
    assert.equal(j.profitToCome, 10000);
    assert.equal(j.owed, 15000);
    assert.equal(j.fade, 0);
  });

  it("shows under-billing", () => {
    const j = jobNumbers({ contract: 100000, budgetCost: 80000, actualCost: 60000, billed: 50000, collected: 50000 });
    assert.equal(j.overUnder, -25000);
  });

  it("fades profit when cost runs past the budget", () => {
    const j = jobNumbers({ contract: 100000, budgetCost: 80000, actualCost: 90000, billed: 90000, collected: 90000 });
    assert.equal(j.projectedCost, 90000);
    assert.equal(j.projectedProfit, 10000);
    assert.equal(j.fade, -10000);
    assert.equal(j.pctComplete, 1);
    assert.equal(j.projectedMargin, 0.1);
  });

  it("has no % complete without a budget, and isn't over or under", () => {
    const j = jobNumbers({ contract: 0, budgetCost: 0, actualCost: 0, billed: 5000, collected: 0 });
    assert.equal(j.pctComplete, null);
    assert.equal(j.overUnder, 0);
    assert.equal(j.projectedMargin, null);
  });

  it("doesn't fade a job that has no budget", () => {
    const j = jobNumbers({ contract: 68400, budgetCost: 0, actualCost: 49990, billed: 68400, collected: 68400, completed: true });
    assert.equal(j.fade, 0);
    assert.equal(j.projectedProfit, 18410);
  });

  it("counts a finished job as 100%", () => {
    const j = jobNumbers({ contract: 100000, budgetCost: 80000, actualCost: 70000, billed: 100000, collected: 100000, completed: true });
    assert.equal(j.pctComplete, 1);
    assert.equal(j.overUnder, 0);
    assert.equal(j.costToFinish, 0);
  });
});

describe("AR aging", () => {
  it("buckets by days late", () => {
    const today = d("2026-10-08");
    assert.equal(agingBucket(daysLate(d("2026-10-08"), today)), "current");
    assert.equal(agingBucket(daysLate(d("2026-10-20"), today)), "current");
    assert.equal(agingBucket(daysLate(d("2026-10-07"), today)), "d30");
    assert.equal(agingBucket(daysLate(d("2026-09-08"), today)), "d30");
    assert.equal(agingBucket(daysLate(d("2026-09-07"), today)), "d60");
    assert.equal(agingBucket(daysLate(d("2026-07-01"), today)), "d90plus");
  });
});

describe("cash-flow periods", () => {
  it("makes months around today", () => {
    const p = periods("month", d("2026-10-08"), 2, 3);
    assert.deepEqual(
      p.map((x) => x.label),
      ["Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027"],
    );
    assert.equal(p.find((x) => x.current)?.label, "Oct 2026");
    assert.equal(periodOf(p, d("2026-11-30"))?.label, "Nov 2026");
    assert.equal(periodOf(p, d("2027-03-01")), null);
  });

  it("makes weeks starting Monday", () => {
    const p = periods("week", d("2026-10-08"), 1, 1); // a Thursday
    assert.deepEqual(
      p.map((x) => x.label),
      ["Week of Sep 28", "Week of Oct 5", "Week of Oct 12"],
    );
    assert.equal(periodOf(p, d("2026-10-11"))?.label, "Week of Oct 5");
  });
});
