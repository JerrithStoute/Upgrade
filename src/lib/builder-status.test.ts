import { test } from "node:test";
import assert from "node:assert/strict";
import { healthFlags, readStatus, trialNote } from "./builder-status";

const now = new Date("2026-10-20T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

test("a trial's admins hear about it in its last week, and after — not before, and not for other statuses", () => {
  assert.equal(trialNote("TRIAL", day(10), now), null);
  assert.match(trialNote("TRIAL", day(5), now)!, /in 5 days/);
  assert.match(trialNote("TRIAL", day(1), now)!, /tomorrow/);
  assert.match(trialNote("TRIAL", new Date(now.getTime() + 3_600_000), now)!, /today/, "later the same day");
  assert.match(trialNote("TRIAL", day(-2), now)!, /has ended/);
  assert.equal(trialNote("ACTIVE", day(-2), now), null);
  assert.equal(trialNote("TRIAL", null, now), null, "a trial with no end date");
});

test("anything unknown reads as Active", () => {
  assert.equal(readStatus(null), "ACTIVE");
  assert.equal(readStatus("WHATEVER"), "ACTIVE");
  assert.equal(readStatus("PAUSED"), "PAUSED");
});

test("the Builders list flags what's worth a look", () => {
  const base = { status: "ACTIVE" as const, trialEndsAt: null, signedUp: day(-60), jobs: 4, lastSignIn: day(-1) };
  assert.deepEqual(healthFlags(base, now), []);
  assert.deepEqual(
    healthFlags({ ...base, jobs: 0 }, now).map((f) => f.text),
    ["No jobs yet"],
  );
  assert.deepEqual(
    healthFlags({ ...base, jobs: 0, signedUp: day(-1) }, now).map((f) => f.text),
    [],
    "just signed up",
  );
  assert.deepEqual(
    healthFlags({ ...base, lastSignIn: day(-45) }, now).map((f) => f.text),
    ["Quiet 45 days"],
  );
  assert.deepEqual(
    healthFlags({ ...base, status: "TRIAL", trialEndsAt: day(3) }, now).map((f) => f.text),
    ["Trial ends in 3 days"],
  );
  assert.deepEqual(
    healthFlags({ ...base, status: "TRIAL", trialEndsAt: day(-4) }, now).map((f) => f.text),
    ["Trial ended 4 days ago"],
  );
  assert.equal(healthFlags({ ...base, status: "PAUSED" }, now)[0].text, "Paused");
});
