import { DEFAULT_TIME_RULES, roundPunch, type TimeRules } from "./time-rules";

/**
 * Time clock math: hours on the clock, overtime, and what the time costs each job — by the
 * company's rules (src/lib/time-rules.ts; the starting rules: weeks Monday to Sunday, hours past
 * 40 in a week are overtime at 1.5×). Salaried people have no overtime. Each stretch on the clock
 * costs its hours × the rate it was worked at (pay + burden), plus the overtime / double-time
 * premium on any of its hours that are.
 */

/** The first day (00:00, local) of the week `d` falls in — weeks start on `startDay` (0 Sunday … 6 Saturday; Monday unless the company changed it). */
export function weekStart(d: Date, startDay = 1): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() - startDay + 7) % 7));
  return x;
}

/** A day as "2026-10-05" (local). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The week's first day as "2026-10-05". */
export function weekKey(d: Date, startDay = 1): string {
  return dayKey(weekStart(d, startDay));
}

/** "2026-10-05" → the first day of the week it's in, 00:00 local (null if it isn't a date). */
export function parseWeek(key: string | undefined | null, startDay = 1): Date | null {
  const m = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : weekStart(d, startDay);
}

/** The Monday after (same clock time, safe across daylight saving). */
export function nextWeek(monday: Date, by = 1): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7 * by);
}

export type Stretch = { clockIn: Date; clockOut: Date | null; breakMinutes: number };
type HourRules = Pick<TimeRules, "rounding" | "lunchMinutes" | "lunchAfter">;

/**
 * Hours on the clock (still on: up to `now`), less the break — the punches rounded as the company
 * rounds them, and, with no break typed in, its automatic lunch on a long enough shift. Never negative.
 */
export function entryHours(e: Stretch, now = new Date(), rules: HourRules = DEFAULT_TIME_RULES): number {
  const start = roundPunch(e.clockIn, rules.rounding);
  const end = roundPunch(e.clockOut ?? now, rules.rounding);
  const onClock = (end.getTime() - start.getTime()) / 3_600_000;
  const lunch = !e.breakMinutes && rules.lunchMinutes > 0 && onClock > rules.lunchAfter ? rules.lunchMinutes : 0;
  return Math.max(0, onClock - (e.breakMinutes || lunch) / 60);
}

/** Hours of the span [from, from + len] that are past `limit` (null limit: none). */
const past = (from: number, len: number, limit: number | null) => (limit == null ? 0 : Math.max(0, Math.min(len, from + len - limit)));

export type CostEntry = Stretch & { id: string; userId: string; projectId: string; costCodeId: string | null; rate: number | null };
export type Person = { salaried: boolean; rate: number | null }; // rate: today's cost per hour (null = no pay rate)
export type Costed = { id: string; hours: number; overtime: number; double: number; rate: number; cost: number };

/**
 * Costs a week of stretches (a running one up to `now`). Each person's are taken in order:
 * - in a day (the company's day, `dayOf`), hours past "daily overtime after" are overtime and
 *   past "double time after" are double time;
 * - the rest count toward the week, and past "weekly overtime after" they're overtime too
 *   (hours already overtime for the day don't count twice);
 * - salaried people have none.
 */
export function costWeek(
  entries: CostEntry[],
  people: Map<string, Person>,
  rules: TimeRules = DEFAULT_TIME_RULES,
  dayOf: (d: Date) => string = dayKey,
  now = new Date(),
): Map<string, Costed> {
  const out = new Map<string, Costed>();
  const byUser = new Map<string, CostEntry[]>();
  for (const e of entries) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e]);
  for (const [userId, list] of byUser) {
    const person = people.get(userId) ?? { salaried: false, rate: null };
    let week = 0; // regular hours so far this week
    const days = new Map<string, number>(); // hours so far each day
    for (const e of [...list].sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime())) {
      const hours = entryHours(e, e.clockOut ?? now, rules);
      const day = dayOf(e.clockIn);
      const before = days.get(day) ?? 0;
      days.set(day, before + hours);
      let overtime = 0;
      let double = 0;
      if (!person.salaried) {
        double = past(before, hours, rules.doubleAfter);
        // Daily overtime: past its limit, short of double time.
        overtime = Math.max(0, past(before, hours, rules.dailyAfter) - double);
        const regular = hours - overtime - double;
        overtime += past(week, regular, rules.weeklyAfter);
        week += regular;
      }
      const rate = e.rate ?? person.rate ?? 0;
      const cost = rate * (hours + overtime * (rules.overtimeTimes - 1) + double * (rules.doubleTimes - 1));
      out.set(e.id, { id: e.id, hours, overtime, double, rate, cost });
    }
  }
  return out;
}

/** Hours as "8", "7.5", "7.25" (2 decimal places at most) — or, the company's choice, as "7:30". */
export function fmtHours(h: number, format: TimeRules["hoursFormat"] = "DECIMAL"): string {
  if (format === "CLOCK") {
    const m = Math.round(h * 60);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  }
  const r = Math.round(h * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, "");
}

/** A running clock: "2:05:09" (h:mm:ss). */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Cost per hour with burden (payroll taxes, workers' comp…) on top; null = no pay rate. */
export function loadedRate(payRate: number | null | undefined, burdenPct: number): number | null {
  if (payRate == null || !(payRate > 0)) return null;
  return Math.round(payRate * (1 + (burdenPct || 0) / 100) * 100) / 100;
}

/** On the clock longer than `hours` (the company's long-shift hours) — probably forgot to clock out. */
export function looksForgotten(e: Stretch, now = new Date(), hours = 14): boolean {
  return !e.clockOut && now.getTime() - e.clockIn.getTime() > hours * 3_600_000;
}

/** The seven days of a week, from its first day. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
