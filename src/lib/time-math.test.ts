import { test } from "node:test";
import assert from "node:assert/strict";
import { costWeek, entryHours, fmtClock, fmtHours, loadedRate, looksForgotten, parseWeek, weekKey, weekStart, type CostEntry } from "./time-math";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // October 2026 (Oct 5 is a Monday)

test("weeks run Monday to Sunday", () => {
  assert.equal(weekKey(at(5, 7)), "2026-10-05");
  assert.equal(weekKey(at(11, 23)), "2026-10-05"); // Sunday
  assert.equal(weekKey(at(12, 0)), "2026-10-12");
  assert.equal(weekStart(at(8, 15)).getDate(), 5);
  assert.equal(parseWeek("2026-10-08")?.getDate(), 5);
  assert.equal(parseWeek("nope"), null);
});

test("hours on the clock, less the break", () => {
  assert.equal(entryHours({ clockIn: at(5, 7), clockOut: at(5, 15, 30), breakMinutes: 30 }), 8);
  assert.equal(entryHours({ clockIn: at(5, 7), clockOut: null, breakMinutes: 0 }, at(5, 9, 15)), 2.25);
  assert.equal(entryHours({ clockIn: at(5, 7), clockOut: at(5, 7, 10), breakMinutes: 30 }), 0);
});

const day = (id: string, d: number, hours: number, extra: Partial<CostEntry> = {}): CostEntry => ({
  id,
  userId: "u1",
  projectId: "p1",
  costCodeId: "c1",
  clockIn: at(d, 7),
  clockOut: new Date(at(d, 7).getTime() + hours * 3_600_000),
  breakMinutes: 0,
  rate: null,
  ...extra,
});

test("past 40 hours in a week is overtime at 1.5×", () => {
  const entries = [day("a", 5, 10), day("b", 6, 10), day("c", 7, 10), day("d", 8, 10), day("e", 9, 6)]; // 46 h
  const c = costWeek(entries, new Map([["u1", { salaried: false, rate: 20 }]]));
  assert.equal(c.get("d")!.overtime, 0);
  assert.equal(c.get("e")!.overtime, 6);
  assert.equal(c.get("e")!.cost, 6 * 20 * 1.5);
  const total = [...c.values()].reduce((n, x) => n + x.cost, 0);
  assert.equal(total, 40 * 20 + 6 * 30);
});

test("the stretch that crosses 40 hours splits", () => {
  const entries = [day("a", 5, 38), day("b", 6, 5)];
  const c = costWeek(entries, new Map([["u1", { salaried: false, rate: 10 }]]));
  assert.equal(c.get("b")!.overtime, 3);
  assert.equal(c.get("b")!.cost, 2 * 10 + 3 * 15);
});

test("salaried people have no overtime; a stretch keeps the rate it was worked at", () => {
  const entries = [day("a", 5, 45, { rate: 30 }), day("b", 6, 5, { userId: "u2" })];
  const c = costWeek(
    entries,
    new Map([
      ["u1", { salaried: true, rate: 50 }],
      ["u2", { salaried: false, rate: null }],
    ]),
  );
  assert.equal(c.get("a")!.overtime, 0);
  assert.equal(c.get("a")!.cost, 45 * 30); // its own rate, not today's 50
  assert.equal(c.get("b")!.cost, 0); // no pay rate set
});

test("overtime counts across jobs in time order", () => {
  const entries = [day("late", 9, 8, { projectId: "p2" }), day("early", 5, 36), day("mid", 6, 2)];
  const c = costWeek(entries, new Map([["u1", { salaried: false, rate: 10 }]]));
  assert.equal(c.get("early")!.overtime, 0);
  assert.equal(c.get("mid")!.overtime, 0);
  assert.equal(c.get("late")!.overtime, 6); // 38 → 46
});

test("burden, formats and forgotten clocks", () => {
  assert.equal(loadedRate(25, 20), 30);
  assert.equal(loadedRate(null, 20), null);
  assert.equal(loadedRate(0, 20), null);
  assert.equal(fmtHours(8), "8");
  assert.equal(fmtHours(7.5), "7.5");
  assert.equal(fmtHours(7.25), "7.25");
  assert.equal(fmtClock(2 * 3600_000 + 5 * 60_000 + 9000), "2:05:09");
  assert.equal(looksForgotten({ clockIn: at(5, 7), clockOut: null, breakMinutes: 0 }, at(6, 8)), true);
  assert.equal(looksForgotten({ clockIn: at(5, 7), clockOut: null, breakMinutes: 0 }, at(5, 17)), false);
});
