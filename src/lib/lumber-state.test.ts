import { test } from "node:test";
import assert from "node:assert/strict";
import { changesLumber, LUMBER_RULES_CHANGED, lumberUpToDate, whileWorkingOut, workingOut } from "./lumber-state";

const t = (s: number) => new Date(LUMBER_RULES_CHANGED.getTime() + 60_000 + s * 1000);

test("lines are up to date only when worked out since the last change", () => {
  assert.equal(lumberUpToDate(null, null), false, "never worked out");
  assert.equal(lumberUpToDate(t(5), null), false);
  assert.equal(lumberUpToDate(null, t(5)), true, "worked out, nothing changed since");
  assert.equal(lumberUpToDate(t(4), t(5)), true);
  assert.equal(lumberUpToDate(t(5), t(5)), true);
  assert.equal(lumberUpToDate(t(6), t(5)), false, "changed after it was worked out");
  // Worked out before the rules last changed: done again once.
  assert.equal(lumberUpToDate(null, new Date(LUMBER_RULES_CHANGED.getTime() - 1000)), false, "worked out under the old rules");
});

test("writes to what the lines come from count as changes; reads and other things don't", () => {
  assert.equal(changesLumber("TakeoffMeasurement", "create"), true);
  assert.equal(changesLumber("MaterialItem", "updateMany"), true);
  assert.equal(changesLumber("JobSubstitution", "deleteMany"), true);
  assert.equal(changesLumber("TakeoffCondition", "upsert"), true);
  assert.equal(changesLumber("TakeoffMeasurement", "findMany"), false);
  assert.equal(changesLumber("Estimate", "update"), false);
  assert.equal(changesLumber("DailyLog", "create"), false);
  assert.equal(changesLumber(undefined, "create"), false);
});

test("the working-out's own writes are told apart", async () => {
  assert.equal(workingOut(), false);
  await whileWorkingOut(async () => {
    await new Promise((r) => setTimeout(r, 1));
    assert.equal(workingOut(), true);
  });
  assert.equal(workingOut(), false);
});
