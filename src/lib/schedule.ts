import { addDays, differenceInCalendarDays, startOfDay, startOfWeek, endOfWeek } from "date-fns";
import { SCHEDULE_PHASES } from "./constants";

/**
 * Pure schedule math shared by the Gantt component and the schedule server actions.
 * All "day" arithmetic is calendar-day based (differenceInCalendarDays) so the time-of-day
 * stored on a task never matters.
 */

export type TaskDates = { id: string; startDate: Date; endDate: Date };

export type GanttTask = TaskDates & {
  name: string;
  phase: string;
  percentComplete: number;
  isMilestone: boolean;
  color: string;
  sortOrder: number;
  assignee?: { name: string } | null;
};

/** Position of a phase in SCHEDULE_PHASES; unknown/custom phases sort last (alphabetically among themselves). */
export function phaseRank(phase: string) {
  const i = (SCHEDULE_PHASES as readonly string[]).indexOf(phase);
  return i === -1 ? SCHEDULE_PHASES.length : i;
}

/** Group tasks by phase, phases in SCHEDULE_PHASES order, tasks by sortOrder then start date. */
export function groupByPhase<T extends { phase: string; sortOrder: number; startDate: Date }>(tasks: T[]) {
  const map = new Map<string, T[]>();
  for (const t of tasks) {
    const list = map.get(t.phase) ?? [];
    list.push(t);
    map.set(t.phase, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => phaseRank(a) - phaseRank(b) || a.localeCompare(b))
    .map(([phase, list]) => ({
      phase,
      tasks: list.sort((x, y) => x.sortOrder - y.sortOrder || x.startDate.getTime() - y.startDate.getTime()),
    }));
}

/** Whole calendar days from `base` to `d` (negative if before). */
export function dayIndex(base: Date, d: Date) {
  return differenceInCalendarDays(d, base);
}

/** Inclusive duration in days (a one-day task = 1). Milestones count as 1. */
export function durationDays(t: { startDate: Date; endDate: Date }) {
  return Math.max(1, dayIndex(t.startDate, t.endDate) + 1);
}

export type GanttWindow = { start: Date; end: Date; days: number; weeks: Date[] };

/**
 * Chart window: min(start)-7d .. max(end)+7d, snapped outward to full Mon–Sun weeks.
 * Pass `fixed` to force a window (e.g. the 4-week overview).
 */
export function ganttWindow(tasks: { startDate: Date; endDate: Date }[], today: Date, fixed?: { start: Date; end: Date }): GanttWindow {
  let start: Date;
  let end: Date;
  if (fixed) {
    start = fixed.start;
    end = fixed.end;
  } else if (tasks.length === 0) {
    start = addDays(today, -7);
    end = addDays(today, 21);
  } else {
    start = addDays(new Date(Math.min(...tasks.map((t) => t.startDate.getTime()))), -7);
    end = addDays(new Date(Math.max(...tasks.map((t) => t.endDate.getTime()))), 7);
  }
  start = startOfWeek(startOfDay(start), { weekStartsOn: 1 });
  end = startOfDay(endOfWeek(end, { weekStartsOn: 1 }));
  const days = dayIndex(start, end) + 1;
  const weeks: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(d);
  return { start, end, days, weeks };
}

/** Bar geometry in day units, clipped to the window. `null` when the task is entirely outside. */
export function barGeometry(t: { startDate: Date; endDate: Date }, win: { start: Date; days: number }) {
  const s = dayIndex(win.start, t.startDate);
  const e = dayIndex(win.start, t.endDate);
  if (e < 0 || s >= win.days) return null;
  const left = Math.max(0, s);
  const right = Math.min(win.days - 1, Math.max(s, e));
  return { left, width: right - left + 1, clippedStart: s < 0, clippedEnd: e > win.days - 1 };
}

/** Duration-weighted overall completion (0–100). */
export function overallPercent(tasks: { startDate: Date; endDate: Date; percentComplete: number; isMilestone: boolean }[]) {
  if (tasks.length === 0) return 0;
  let weight = 0;
  let done = 0;
  for (const t of tasks) {
    const w = t.isMilestone ? 1 : durationDays(t);
    weight += w;
    done += (w * Math.max(0, Math.min(100, t.percentComplete))) / 100;
  }
  return weight === 0 ? 0 : Math.round((done / weight) * 100);
}

export function isTaskOverdue(t: { endDate: Date; percentComplete: number }, today: Date) {
  return dayIndex(today, t.endDate) < 0 && t.percentComplete < 100;
}

export function overlapsRange(t: { startDate: Date; endDate: Date }, start: Date, end: Date) {
  return dayIndex(start, t.endDate) >= 0 && dayIndex(t.startDate, end) >= 0;
}
