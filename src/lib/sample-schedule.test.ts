import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { differenceInCalendarDays } from "date-fns";
import { SAMPLE_NEW_HOME } from "./sample-schedule";
import { STARTER_COST_CODES } from "./starter-cost-codes";
import { planTemplate, wouldLoop } from "./workdays";

describe("starter data", () => {
  it("the sample new-home schedule waits only on its own tasks, without loops, and runs about 6 months", () => {
    const keys = new Set(SAMPLE_NEW_HOME.map((t) => t.key));
    assert.equal(keys.size, SAMPLE_NEW_HOME.length);
    const links: { taskId: string; predecessorId: string }[] = [];
    for (const t of SAMPLE_NEW_HOME)
      for (const a of t.after ?? []) {
        const k = typeof a === "string" ? a : a[0];
        assert.ok(keys.has(k), `${t.key} waits on unknown ${k}`);
        assert.equal(wouldLoop(links, t.key, k), false);
        links.push({ taskId: t.key, predecessorId: k });
      }
    const cal = { days: [1, 2, 3, 4, 5], holidays: new Set<string>() };
    const start = new Date("2027-01-04T12:00:00");
    const plan = planTemplate(
      cal,
      SAMPLE_NEW_HOME.map((t) => ({
        key: t.key,
        duration: t.days,
        isMilestone: !!t.milestone,
        links: (t.after ?? []).map((a) => (typeof a === "string" ? { key: a, lag: 0 } : { key: a[0], lag: a[1] })),
      })),
      start,
    );
    const end = plan.get("walkthrough")!.endDate;
    const months = differenceInCalendarDays(end, start) / 30.4;
    assert.ok(months > 4.5 && months < 7.5, `runs ${months.toFixed(1)} months`);
  });

  it("the starter cost codes have unique numbers, each in a 1000–6000 group", () => {
    const codes = STARTER_COST_CODES.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length);
    for (const c of STARTER_COST_CODES) assert.match(c.division, /^[1-6]\d{3} /);
  });
});
