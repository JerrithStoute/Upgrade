/**
 * Time clock math: hours on the clock, overtime, and what the time costs each job.
 *
 * A work week runs Monday to Sunday. Hourly people's hours past 40 in a week are overtime,
 * paid at 1.5×; salaried people have no overtime. Each stretch on the clock costs its hours
 * × the rate it was worked at (pay + burden), plus the overtime premium on any of its hours
 * past the 40th.
 */

export const OVERTIME_AFTER = 40;
export const OVERTIME_FACTOR = 1.5;

/** Monday 00:00 (local time) of the week `d` falls in. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (x.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
  x.setDate(x.getDate() - back);
  return x;
}

/** The week's Monday as "2026-10-05". */
export function weekKey(d: Date): string {
  const m = weekStart(d);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

/** "2026-10-05" → that Monday, 00:00 local (null if it isn't a date). */
export function parseWeek(key: string | undefined | null): Date | null {
  const m = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : weekStart(d);
}

/** The Monday after (same clock time, safe across daylight saving). */
export function nextWeek(monday: Date, by = 1): Date {
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7 * by);
}

export type Stretch = { clockIn: Date; clockOut: Date | null; breakMinutes: number };

/** Hours on the clock, less the break (still on the clock: up to `now`). Never negative. */
export function entryHours(e: Stretch, now = new Date()): number {
  const end = e.clockOut ?? now;
  const h = (end.getTime() - e.clockIn.getTime()) / 3_600_000 - (e.breakMinutes || 0) / 60;
  return Math.max(0, h);
}

export type CostEntry = Stretch & { id: string; userId: string; projectId: string; costCodeId: string | null; rate: number | null };
export type Person = { salaried: boolean; rate: number | null }; // rate: today's cost per hour (null = no pay rate)
export type Costed = { id: string; hours: number; overtime: number; rate: number; cost: number };

/**
 * Costs a week of finished stretches. Each person's stretches are taken in order; once
 * their week passes 40 hours, the rest is overtime (unless they're salaried).
 */
export function costWeek(entries: CostEntry[], people: Map<string, Person>): Map<string, Costed> {
  const out = new Map<string, Costed>();
  const byUser = new Map<string, CostEntry[]>();
  for (const e of entries) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e]);
  for (const [userId, list] of byUser) {
    const person = people.get(userId) ?? { salaried: false, rate: null };
    let sofar = 0;
    for (const e of [...list].sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime())) {
      const hours = entryHours(e, e.clockOut ?? e.clockIn);
      const overtime = person.salaried ? 0 : Math.max(0, Math.min(hours, sofar + hours - OVERTIME_AFTER));
      sofar += hours;
      const rate = e.rate ?? person.rate ?? 0;
      const cost = rate * (hours + overtime * (OVERTIME_FACTOR - 1));
      out.set(e.id, { id: e.id, hours, overtime, rate, cost });
    }
  }
  return out;
}

/** Hours as "8", "7.5", "7.25" (2 decimal places at most). */
export function fmtHours(h: number): string {
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

/** On the clock a long time — probably forgot to clock out. */
export function looksForgotten(e: Stretch, now = new Date()): boolean {
  return !e.clockOut && now.getTime() - e.clockIn.getTime() > 14 * 3_600_000;
}

/** Days Monday…Sunday of a week. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
