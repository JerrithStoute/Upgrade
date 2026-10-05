/**
 * Selection deadlines ("Requested by"): a date, or a schedule item with a number of
 * days before it starts — so the deadline moves when the schedule does.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Midnight (local) of a date, for day-based comparisons. */
function day(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The deadline for "n days before" a schedule item that starts on `start`. */
export function tiedDeadline(start: Date, leadDays: number) {
  return new Date(day(start).getTime() - Math.max(0, leadDays) * DAY + 12 * 60 * 60 * 1000);
}

/** Whole days from today to the deadline (negative = past). */
export function daysUntil(deadline: Date, today = new Date()) {
  return Math.round((day(deadline).getTime() - day(today).getTime()) / DAY);
}

/**
 * "overdue": past the deadline and nothing chosen yet. "soon": within `soonDays`
 * (and nothing chosen). Otherwise null.
 */
export function deadlineState(deadline: Date | null, status: string, today = new Date(), soonDays = 7): "overdue" | "soon" | null {
  if (!deadline || status !== "PENDING") return null;
  const n = daysUntil(deadline, today);
  if (n < 0) return "overdue";
  if (n <= soonDays) return "soon";
  return null;
}
