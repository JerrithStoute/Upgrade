import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TIME_RULES, feetBetween, parseTimeRules, roundPunch, siteCheck, type TimeRules } from "./time-rules";
import { costWeek, entryHours, fmtHours, weekKey, type CostEntry } from "./time-math";

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m); // October 2026 (Oct 5 is a Monday)
const rules = (r: Partial<TimeRules>): TimeRules => ({ ...DEFAULT_TIME_RULES, ...r });
const shift = (id: string, day: number, from: number, to: number, breakMinutes = 0): CostEntry => ({
  id,
  userId: "u1",
  projectId: "p",
  costCodeId: null,
  rate: 20,
  clockIn: at(day, from),
  clockOut: at(day, to),
  breakMinutes,
});
const pay = new Map([["u1", { salaried: false, rate: 20 }]]);

test("the starting rules are what the clock always did", () => {
  assert.deepEqual(parseTimeRules(null), DEFAULT_TIME_RULES);
  assert.equal(DEFAULT_TIME_RULES.weekStart, 1);
  assert.equal(DEFAULT_TIME_RULES.weeklyAfter, 40);
  assert.equal(DEFAULT_TIME_RULES.dailyAfter, null);
  assert.equal(DEFAULT_TIME_RULES.rounding, 0);
  assert.equal(DEFAULT_TIME_RULES.lunchMinutes, 0);
  assert.deepEqual(parseTimeRules('{"weeklyAfter":"lots","rounding":7}'), DEFAULT_TIME_RULES); // unreadable: the starting rules
});

test("daily overtime and double time in one long day", () => {
  const c = costWeek([shift("a", 5, 6, 18)], pay, rules({ dailyAfter: 8, doubleAfter: 10 })).get("a")!;
  assert.equal(c.hours, 12);
  assert.equal(c.overtime, 2);
  assert.equal(c.double, 2);
  assert.equal(c.cost, 20 * 8 + 30 * 2 + 40 * 2);
});

test("hours already overtime for the day don't count again toward the week", () => {
  // Four 12-hour days with daily overtime after 8: 32 regular hours — under 40, so no weekly overtime.
  const week = [5, 6, 7, 8].map((d) => shift(`d${d}`, d, 6, 18));
  const c = costWeek(week, pay, rules({ dailyAfter: 8 }));
  assert.equal([...c.values()].reduce((n, x) => n + x.overtime, 0), 16);
  // A fifth day's 8 regular hours go past 40 for the week.
  const c2 = costWeek([...week, shift("d9", 9, 6, 14)], pay, rules({ dailyAfter: 8 }));
  assert.equal(c2.get("d9")!.overtime, 0); // 32 + 8 = 40: right at the line
  const c3 = costWeek([...week, shift("d9", 9, 6, 15)], pay, rules({ dailyAfter: 8 }));
  assert.equal(c3.get("d9")!.overtime, 1); // the 9th hour that day is daily overtime (not counted twice)
});

test("no overtime by the week when it's turned off; salaried never", () => {
  const week = [5, 6, 7, 8, 9].map((d) => shift(`d${d}`, d, 6, 16));
  assert.equal([...costWeek(week, pay, rules({ weeklyAfter: null })).values()].reduce((n, x) => n + x.overtime, 0), 0);
  assert.equal([...costWeek(week, new Map([["u1", { salaried: true, rate: 20 }]])).values()].reduce((n, x) => n + x.overtime, 0), 0);
});

test("rounding counts punches to the nearest step; halfway rounds up", () => {
  assert.equal(roundPunch(at(5, 7, 52), 15).getMinutes(), 45);
  assert.equal(roundPunch(at(5, 7, 53), 15).getMinutes(), 0);
  assert.equal(roundPunch(at(5, 17, 7), 15).getMinutes(), 0);
  assert.equal(roundPunch(at(5, 17, 8), 15).getMinutes(), 15);
  assert.equal(entryHours({ clockIn: at(5, 7, 52), clockOut: at(5, 16, 8), breakMinutes: 0 }, undefined, rules({ rounding: 15 })), 8.5);
});

test("the automatic lunch comes out of long shifts with no break typed in", () => {
  const r = rules({ lunchMinutes: 30, lunchAfter: 6 });
  assert.equal(entryHours({ clockIn: at(5, 7), clockOut: at(5, 15, 30), breakMinutes: 0 }, undefined, r), 8);
  assert.equal(entryHours({ clockIn: at(5, 7), clockOut: at(5, 15, 30), breakMinutes: 15 }, undefined, r), 8.25); // a typed-in break wins
  assert.equal(entryHours({ clockIn: at(5, 7), clockOut: at(5, 12), breakMinutes: 0 }, undefined, r), 5); // short shift: no lunch
});

test("the week starts on the company's day", () => {
  assert.equal(weekKey(at(11, 9)), "2026-10-05"); // Sunday, in a Monday week
  assert.equal(weekKey(at(11, 9), 0), "2026-10-11"); // Sunday starts a Sunday week
  assert.equal(weekKey(at(10, 9), 0), "2026-10-04");
});

test("hours as 7:30", () => {
  assert.equal(fmtHours(7.5, "CLOCK"), "7:30");
  assert.equal(fmtHours(8.25, "CLOCK"), "8:15");
  assert.equal(fmtHours(7.5), "7.5");
});

test("a punch is off site only when it's surely too far", () => {
  const site = { lat: 30.2672, lng: -97.7431 };
  assert.ok(Math.abs(feetBetween(site, { lat: 30.2672 + 0.001, lng: -97.7431 }) - 364) < 3); // 0.001° of latitude ≈ 364 ft
  assert.equal(siteCheck({ lat: 30.2672 + 0.003, lng: -97.7431, accuracy: 10 }, site, 500)!.offSite, true); // ~1,090 ft away
  assert.equal(siteCheck({ lat: 30.2672 + 0.003, lng: -97.7431, accuracy: 300 }, site, 500)!.offSite, false); // could be on site, given the phone's accuracy
  assert.equal(siteCheck({ lat: 30.2672 + 0.001, lng: -97.7431, accuracy: 5 }, site, 500)!.offSite, false);
  assert.equal(siteCheck({ lat: null, lng: null, accuracy: null }, site, 500), null);
  assert.equal(siteCheck({ lat: 30, lng: -97, accuracy: 5 }, { lat: null, lng: null }, 500), null); // no spot for the job yet
});
