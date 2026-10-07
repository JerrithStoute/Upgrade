import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addWorkdays, dayKey, delaySchedule, parseWorkDays, placeTask, planTemplate, reflow, workdaysBetween, wouldLoop, type WorkCal } from "./workdays";

// Monday–Friday, with Friday Oct 9, 2026 a holiday.
const d = (s: string) => new Date(`${s}T12:00:00`);
const cal: WorkCal = { days: [1, 2, 3, 4, 5], holidays: new Set(["2026-10-09"]) };
const keys = (x: { startDate: Date; endDate: Date }) => [dayKey(x.startDate), dayKey(x.endDate)];

describe("workdays", () => {
  it("reads the work week, never empty", () => {
    assert.deepEqual(parseWorkDays("6,1,2,3,4,5"), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(parseWorkDays(""), [1, 2, 3, 4, 5]);
  });

  it("skips weekends and holidays", () => {
    // Thursday Oct 8 + 1 workday: Friday is a holiday, so Monday Oct 12.
    assert.equal(dayKey(addWorkdays(cal, d("2026-10-08"), 1)), "2026-10-12");
    assert.equal(workdaysBetween(cal, d("2026-10-05"), d("2026-10-16")), 9);
    // A 3-day task starting Saturday starts Monday.
    assert.deepEqual(keys(placeTask(cal, d("2026-10-03"), 3)), ["2026-10-05", "2026-10-07"]);
  });

  it("starts a task after the last thing it waits on, plus lag", () => {
    const tasks = [
      { id: "plumb", startDate: d("2026-10-05"), endDate: d("2026-10-06") },
      { id: "elec", startDate: d("2026-10-05"), endDate: d("2026-10-08") },
      { id: "insul", startDate: d("2026-10-05"), endDate: d("2026-10-06") },
    ];
    const links = [
      { taskId: "insul", predecessorId: "plumb", lagDays: 0 },
      { taskId: "insul", predecessorId: "elec", lagDays: 1 },
    ];
    // Electrical ends Thu 10/8; +1 lag workday (Fri is a holiday) → Mon 10/12 is the lag day, start Tue 10/13; 2 workdays.
    const moved = reflow(cal, tasks, links);
    assert.deepEqual(
      moved.map((m) => [m.id, ...keys(m)]),
      [["insul", "2026-10-13", "2026-10-14"]],
    );
  });

  it("delays a job one workday: under way finishes later, not started starts later, finished stays", () => {
    const tasks = [
      { id: "done", startDate: d("2026-10-01"), endDate: d("2026-10-02"), percentComplete: 100 },
      { id: "framing", startDate: d("2026-10-05"), endDate: d("2026-10-07") },
      { id: "roof", startDate: d("2026-10-08"), endDate: d("2026-10-12") },
    ];
    const moved = delaySchedule(cal, tasks, [{ taskId: "roof", predecessorId: "framing", lagDays: 0 }], d("2026-10-06"), 1);
    const by = new Map(moved.map((m) => [m.id, keys(m)]));
    assert.equal(by.has("done"), false);
    assert.deepEqual(by.get("framing"), ["2026-10-05", "2026-10-08"]);
    // Roof was Thu 10/8 + 2 workdays (Fri holiday) → now Mon 10/12 – Tue 10/13.
    assert.deepEqual(by.get("roof"), ["2026-10-12", "2026-10-13"]);
  });

  it("won't make a loop", () => {
    const links = [
      { taskId: "b", predecessorId: "a" },
      { taskId: "c", predecessorId: "b" },
    ];
    assert.equal(wouldLoop(links, "a", "c"), true);
    assert.equal(wouldLoop(links, "c", "a"), false);
  });

  it("lays a template out from a start date", () => {
    const plan = planTemplate(
      cal,
      [
        { key: "slab", duration: 3, isMilestone: false, links: [] },
        { key: "cure", duration: 1, isMilestone: true, links: [{ key: "slab", lag: 2 }] },
        { key: "frame", duration: 5, isMilestone: false, links: [{ key: "cure", lag: 0 }] },
      ],
      d("2026-10-03"),
    );
    assert.deepEqual(keys(plan.get("slab")!), ["2026-10-05", "2026-10-07"]);
    // Slab ends Wed 10/7; lag 2 workdays (Thu, Mon — Fri's a holiday) → Tue 10/13.
    assert.deepEqual(keys(plan.get("cure")!), ["2026-10-13", "2026-10-13"]);
    assert.deepEqual(keys(plan.get("frame")!), ["2026-10-14", "2026-10-20"]);
  });
});
