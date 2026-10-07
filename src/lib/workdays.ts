import { addDays, format } from "date-fns";

/**
 * Workday math for schedules: the days you work (Settings → Schedule) and the company
 * holidays. Task lengths count workdays; a task that waits on others starts after the last
 * of them finishes, plus its lag in workdays. Dates are local days (stored at noon).
 * No database code here.
 */

export type WorkCal = { days: number[]; holidays: Set<string> };

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "1,2,3,4,5" → [1,2,3,4,5]; never empty (Monday–Friday when nothing's set). */
export function parseWorkDays(text: string | null | undefined): number[] {
  const parts = (text ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const days = Array.from(new Set(parts.map(Number))).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? days.sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const noon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);

export function isWorkday(cal: WorkCal, d: Date) {
  return cal.days.includes(d.getDay()) && !cal.holidays.has(dayKey(d));
}

/** `d` when it's a workday, else the next one. */
export function nextWorkday(cal: WorkCal, d: Date) {
  let x = noon(d);
  for (let i = 0; i < 3660 && !isWorkday(cal, x); i++) x = addDays(x, 1);
  return x;
}

/** `n` workdays after `d` (before it when n < 0); 0 is `d` itself. */
export function addWorkdays(cal: WorkCal, d: Date, n: number) {
  let x = noon(d);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n), i = 0; left > 0 && i < 36600; i++) {
    x = addDays(x, step);
    if (isWorkday(cal, x)) left--;
  }
  return x;
}

/** Workdays from `start` to `end`, both counted. */
export function workdaysBetween(cal: WorkCal, start: Date, end: Date) {
  let n = 0;
  for (let x = noon(start), i = 0; x <= noon(end) && i < 36600; x = addDays(x, 1), i++) if (isWorkday(cal, x)) n++;
  return n;
}

/** A task's length in workdays (at least 1). */
export function taskWorkdays(cal: WorkCal, t: { startDate: Date; endDate: Date; isMilestone?: boolean }) {
  return t.isMilestone ? 1 : Math.max(1, workdaysBetween(cal, t.startDate, t.endDate));
}

/** Starts on the first workday from `start` and runs `duration` workdays. */
export function placeTask(cal: WorkCal, start: Date, duration: number, isMilestone = false) {
  const s = nextWorkday(cal, start);
  return { startDate: s, endDate: isMilestone ? s : addWorkdays(cal, s, Math.max(1, duration) - 1) };
}

export type TaskLinkRow = { taskId: string; predecessorId: string; lagDays: number };
export type PlanTask = { id: string; startDate: Date; endDate: Date; isMilestone?: boolean; percentComplete?: number };
export type DateUpdate = { id: string; startDate: Date; endDate: Date };

/** The first day a task may start after its predecessor ends: the (lag + 1)th workday after. */
export function startAfter(cal: WorkCal, predecessorEnd: Date, lagDays: number) {
  return addWorkdays(cal, predecessorEnd, Math.max(0, lagDays) + 1);
}

/** Tasks in an order where every task comes after what it waits on (tasks caught in a loop are left out). */
function ordered<T extends { id: string }>(tasks: T[], links: TaskLinkRow[]) {
  const ids = new Set(tasks.map((t) => t.id));
  const live = links.filter((l) => ids.has(l.taskId) && ids.has(l.predecessorId));
  const waiting = new Map(tasks.map((t) => [t.id, 0]));
  for (const l of live) waiting.set(l.taskId, (waiting.get(l.taskId) ?? 0) + 1);
  const queue = tasks.filter((t) => !waiting.get(t.id));
  const out: T[] = [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  while (queue.length) {
    const t = queue.shift()!;
    out.push(t);
    for (const l of live.filter((x) => x.predecessorId === t.id)) {
      const n = (waiting.get(l.taskId) ?? 0) - 1;
      waiting.set(l.taskId, n);
      if (n === 0) queue.push(byId.get(l.taskId)!);
    }
  }
  return out;
}

/**
 * Moves tasks that now start before what they wait on allows — later, keeping each one's
 * length in workdays. Finished tasks stay put. Returns the tasks that move.
 */
export function reflow<T extends PlanTask>(cal: WorkCal, tasks: T[], links: TaskLinkRow[]): DateUpdate[] {
  const now = new Map(tasks.map((t) => [t.id, { startDate: t.startDate, endDate: t.endDate }]));
  const moved = new Map<string, DateUpdate>();
  for (const t of ordered(tasks, links)) {
    const preds = links.filter((l) => l.taskId === t.id && now.has(l.predecessorId));
    if (!preds.length || (t.percentComplete ?? 0) >= 100) continue;
    const earliest = preds.map((l) => startAfter(cal, now.get(l.predecessorId)!.endDate, l.lagDays)).reduce((a, b) => (b > a ? b : a));
    const cur = now.get(t.id)!;
    if (dayKey(cur.startDate) >= dayKey(earliest)) continue;
    const next = placeTask(cal, earliest, taskWorkdays(cal, t), t.isMilestone);
    now.set(t.id, next);
    moved.set(t.id, { id: t.id, ...next });
  }
  return [...moved.values()];
}

/**
 * A delay: from `from`, everything not finished moves out `days` workdays. A task under way
 * that day finishes `days` workdays later; one that hasn't started yet starts later (keeping
 * its length). Then anything waiting on them is pushed to fit.
 */
export function delaySchedule<T extends PlanTask>(cal: WorkCal, tasks: T[], links: TaskLinkRow[], from: Date, days: number): DateUpdate[] {
  const day = dayKey(from);
  const moved = new Map<string, DateUpdate>();
  const after = tasks.map((t) => {
    if ((t.percentComplete ?? 0) >= 100 || dayKey(t.endDate) < day) return t;
    const next =
      dayKey(t.startDate) >= day
        ? placeTask(cal, addWorkdays(cal, nextWorkday(cal, t.startDate), days), taskWorkdays(cal, t), t.isMilestone)
        : { startDate: t.startDate, endDate: addWorkdays(cal, t.endDate, days) };
    moved.set(t.id, { id: t.id, ...next });
    return { ...t, ...next };
  });
  for (const u of reflow(cal, after, links)) moved.set(u.id, u);
  return [...moved.values()];
}

/** True when making `taskId` wait on `predecessorId` would make a loop. */
export function wouldLoop(links: { taskId: string; predecessorId: string }[], taskId: string, predecessorId: string) {
  const seen = new Set<string>();
  const stack = [predecessorId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const l of links) if (l.taskId === cur) stack.push(l.predecessorId);
  }
  return false;
}

export type TemplateTaskPlan = { key: string; duration: number; isMilestone: boolean; links: { key: string; lag: number }[] };

/** A template's tasks laid out from `start` on your workdays: each as early as what it waits on allows. */
export function planTemplate(cal: WorkCal, tasks: TemplateTaskPlan[], start: Date) {
  const links: TaskLinkRow[] = tasks.flatMap((t) => t.links.map((l) => ({ taskId: t.key, predecessorId: l.key, lagDays: l.lag })));
  const placed = new Map<string, { startDate: Date; endDate: Date }>();
  const list = tasks.map((t) => ({ id: t.key, ...t }));
  const order = ordered(list, links);
  // Tasks caught in a loop go last, from the start date.
  for (const t of [...order, ...list.filter((x) => !order.includes(x))]) {
    let s = nextWorkday(cal, start);
    for (const l of t.links) {
      const p = placed.get(l.key);
      if (p) {
        const e = startAfter(cal, p.endDate, l.lag);
        if (e > s) s = e;
      }
    }
    placed.set(t.key, placeTask(cal, s, t.duration, t.isMilestone));
  }
  return placed;
}
