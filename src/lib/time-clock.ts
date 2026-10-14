import "server-only";
import { db } from "@/lib/db";
import { cache } from "react";
import { costWeek, dayKey, entryHours, fmtHours, loadedRate, nextWeek, parseWeek, weekKey, type Person } from "@/lib/time-math";
import { parseTimeRules } from "@/lib/time-rules";
import { companyClock } from "@/lib/company-zone";

/**
 * The time clock: who's on the clock where, and the labor it costs each job. Finished time
 * is posted to each job's Budget as one LABOR cost per cost code per week ("Crew labor"),
 * worked out again whenever any time in that week changes — so overtime (which depends on
 * the whole week) always lands right.
 *
 * Days and weeks are the company's (its time zone and its week — Settings → Time clock): a punch
 * belongs to the day and the week its clock-in falls in on the company's clock.
 */

/** The company's time clock rules (Settings → Time clock). Asked once per page. */
export const timeRules = cache(async () => parseTimeRules((await db.company.findFirst({ select: { timeRules: true } }))?.timeRules));

export type Spot = { lat: number; lng: number; accuracy: number | null };

/**
 * The week a moment falls in on the company's clock: its key ("2026-10-12"), its first day (wall
 * date — `monday` is the first day of the company's week, whatever day that is) and the real moments
 * it runs between. With the rules, and the company's day for a moment (`dayOf`).
 */
export async function weekOf(at: Date | string) {
  const [clock, rules] = await Promise.all([companyClock(), timeRules()]);
  const start = rules.weekStart;
  const monday = typeof at === "string" ? parseWeek(at, start)! : parseWeek(weekKey(clock.wall(at), start), start)!;
  return { key: weekKey(monday, start), monday, from: clock.real(monday), to: clock.real(nextWeek(monday)), clock, rules, dayOf: (d: Date) => dayKey(clock.wall(d)) };
}

export const LABOR_VENDOR = "Crew labor (time clock)";

/** May see everyone's time (Timesheets). */
export function canManageTime(user: { role: string; access?: { time: number } | null }) {
  return user.role === "ADMIN" || (user.access?.time ?? 0) > 0;
}

/** May change other people's time (not just see it). */
export function canFixTime(user: { role: string; access?: { time: number } | null }) {
  return user.role === "ADMIN" || (user.access?.time ?? 0) > 1;
}

export async function laborBurden() {
  return (await db.company.findFirst({ select: { laborBurden: true } }))?.laborBurden ?? 0;
}

/** This person's cost per hour right now (pay + burden); null = no pay rate set. */
export async function currentRate(userId: string) {
  const [user, burden] = await Promise.all([db.user.findUnique({ where: { id: userId }, select: { payRate: true } }), laborBurden()]);
  return loadedRate(user?.payRate, burden);
}

export function openEntry(userId: string) {
  return db.timeEntry.findFirst({
    where: { userId, clockOut: null },
    orderBy: { clockIn: "desc" },
    include: { project: { select: { id: true, name: true, number: true } }, costCode: { select: { id: true, code: true, name: true } } },
  });
}

/** Start the clock on a job (ending whatever they were on, if anything — that's a switch). */
export async function clockIn(userId: string, projectId: string, costCodeId: string | null, notes: string | null, spot: Spot | null = null, at = new Date()) {
  const open = await db.timeEntry.findFirst({ where: { userId, clockOut: null } });
  if (open) await clockOut(userId, spot, at);
  const rate = await currentRate(userId);
  return db.timeEntry.create({
    data: { userId, projectId, costCodeId, notes, clockIn: at, rate, ...(spot ? { inLat: spot.lat, inLng: spot.lng, inAccuracy: spot.accuracy } : {}) },
  });
}

/** Stop the clock. Returns the finished stretch (null when they weren't on the clock). */
export async function clockOut(userId: string, spot: Spot | null = null, at = new Date()) {
  const open = await db.timeEntry.findFirst({ where: { userId, clockOut: null }, orderBy: { clockIn: "desc" } });
  if (!open) return null;
  const done = await db.timeEntry.update({
    where: { id: open.id },
    data: { clockOut: at < open.clockIn ? open.clockIn : at, ...(spot ? { outLat: spot.lat, outLng: spot.lng, outAccuracy: spot.accuracy } : {}) },
  });
  await postLabor([done.clockIn]);
  return done;
}

// One posting at a time, so two changes in the same week can't both add its costs.
let chain: Promise<unknown> = Promise.resolve();

/** Work out the labor costs again for the weeks these dates fall in. */
export function postLabor(dates: Date[]) {
  const run = chain.then(async () => {
    const [{ wall }, rules] = await Promise.all([companyClock(), timeRules()]);
    for (const w of new Set(dates.map((d) => weekKey(wall(d), rules.weekStart)))) await postWeek(w);
  });
  chain = run.catch(() => {});
  return run;
}

/**
 * The rules changed (Settings → Time clock): every week's labor is worked out again by them. A new
 * week start makes new weeks, so the old postings go first.
 */
export async function repostAllLabor() {
  const finished = await db.timeEntry.findMany({ where: { clockOut: { not: null } }, select: { clockIn: true } });
  const run = chain.then(() => db.expense.deleteMany({ where: { laborWeek: { not: null } } }));
  chain = run.catch(() => {});
  await run;
  await postLabor(finished.map((e) => e.clockIn));
}

async function postWeek(key: string) {
  const { monday, from, to, rules, dayOf } = await weekOf(key);
  const [entries, burden, posted] = await Promise.all([
    db.timeEntry.findMany({
      where: { clockIn: { gte: from, lt: to }, clockOut: { not: null } },
      include: { user: { select: { name: true, payRate: true, salaried: true } } },
    }),
    laborBurden(),
    db.expense.findMany({ where: { laborWeek: key } }),
  ]);
  const people = new Map<string, Person>(entries.map((e) => [e.userId, { salaried: e.user.salaried, rate: loadedRate(e.user.payRate, burden) }]));
  const costed = costWeek(entries, people, rules, dayOf);

  // One line per job + cost code.
  type Line = { projectId: string; costCodeId: string | null; hours: number; overtime: number; double: number; cost: number; names: Set<string>; last: Date };
  const lines = new Map<string, Line>();
  for (const e of entries) {
    const c = costed.get(e.id)!;
    const k = `${e.projectId}|${e.costCodeId ?? ""}`;
    const line = lines.get(k) ?? { projectId: e.projectId, costCodeId: e.costCodeId, hours: 0, overtime: 0, double: 0, cost: 0, names: new Set<string>(), last: e.clockIn };
    line.hours += c.hours;
    line.overtime += c.overtime;
    line.double += c.double;
    line.cost += c.cost;
    line.names.add(shortName(e.user.name));
    if (e.clockOut! > line.last) line.last = e.clockOut!;
    lines.set(k, line);
  }

  const weekLabel = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const keep = new Set<string>();
  for (const line of lines.values()) {
    const amount = Math.round(line.cost * 100) / 100;
    if (amount <= 0) continue; // no pay rates set: hours show on Timesheets, nothing to cost
    const h = (n: number) => fmtHours(n, rules.hoursFormat);
    const extra = [line.overtime > 0.004 ? `${h(line.overtime)} overtime` : "", line.double > 0.004 ? `${h(line.double)} double time` : ""].filter(Boolean).join(", ");
    const description = `Week of ${weekLabel} — ${h(line.hours)} hrs${extra ? ` (${extra})` : ""} · ${[...line.names].join(", ")}`;
    const had = posted.find((p) => p.projectId === line.projectId && p.costCodeId === line.costCodeId);
    if (had) {
      keep.add(had.id);
      if (had.amount !== amount || had.description !== description || had.date.getTime() !== line.last.getTime())
        await db.expense.update({ where: { id: had.id }, data: { amount, description, date: line.last } });
    } else {
      const made = await db.expense.create({
        data: {
          projectId: line.projectId,
          costCodeId: line.costCodeId,
          date: line.last,
          vendor: LABOR_VENDOR,
          description,
          category: "LABOR",
          amount,
          status: "PAID",
          laborWeek: key,
        },
      });
      keep.add(made.id);
    }
  }
  const stale = posted.filter((p) => !keep.has(p.id)).map((p) => p.id);
  if (stale.length) await db.expense.deleteMany({ where: { id: { in: stale } } });
}

/** "Dave Nguyen" → "Dave N." */
export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.pop();
  return last ? `${first} ${last[0]}.` : first;
}

/** Hours so far for a person this week (finished + the stretch they're on). */
export async function hoursThisWeek(userId: string, now = new Date()) {
  const { from, to, rules } = await weekOf(now);
  const entries = await db.timeEntry.findMany({ where: { userId, clockIn: { gte: from, lt: to } } });
  return entries.reduce((n, e) => n + entryHours(e, now, rules), 0);
}
