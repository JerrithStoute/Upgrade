import { test } from "node:test";
import assert from "node:assert/strict";
import { alertNeeded, checkState } from "./running-check-rules";

const hourly = { everyMin: 60 };
const now = new Date("2026-11-04T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const row = (r: Partial<NonNullable<Parameters<typeof checkState>[1]>>) => ({ lastRunAt: ago(5), lastOkAt: ago(5), problem: null, failingSince: null, alertedAt: null, ...r });

test("a check is late after two missed runs, not one", () => {
  assert.equal(checkState(hourly, row({ lastRunAt: ago(100) }), now, false), "ok");
  assert.equal(checkState(hourly, row({ lastRunAt: ago(140) }), now, false), "late");
  assert.equal(checkState(hourly, null, now, false), "waiting");
  assert.equal(checkState(hourly, row({ lastRunAt: ago(500) }), now, true), "off");
  assert.equal(checkState(hourly, row({ problem: "JT&I: disk full" }), now, false), "failing");
});

test("one failed run isn't an email; two in a row are, once", () => {
  const once = row({ problem: "x", failingSince: ago(5) });
  assert.equal(alertNeeded(hourly, "failing", once, now), null);
  const twice = row({ problem: "x", failingSince: ago(60) });
  assert.equal(alertNeeded(hourly, "failing", twice, now), "down");
  assert.equal(alertNeeded(hourly, "failing", { ...twice, alertedAt: ago(1) }, now), null);
  assert.equal(alertNeeded(hourly, "late", row({ lastRunAt: ago(200) }), now), "down");
});

test("working again after an email says so once", () => {
  assert.equal(alertNeeded(hourly, "ok", row({ alertedAt: ago(30) }), now), "back");
  assert.equal(alertNeeded(hourly, "ok", row({}), now), null);
  assert.equal(alertNeeded(hourly, "off", row({ alertedAt: ago(30) }), now), null);
});
