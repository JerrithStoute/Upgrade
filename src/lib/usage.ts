import "server-only";
import { systemDb } from "./db";
import { companyClock } from "./company-zone";
import { dayKey } from "./time-math";
import { AREAS, areaOf, type Area } from "./usage-areas";

/**
 * How builders use the program, for the Station's Builders pages: each page someone opens is counted
 * for them, on their company's day, under its part of the program (usage-areas.ts). Counts only.
 * Through the system login — the table is the Station's (tenant-rules.ts).
 */

/** Someone opened `path`: one more for them, today, in its area. */
export async function recordUsage(user: { id: string; companyId: string; role: string }, path: string) {
  const area = areaOf(path);
  if (!area) return;
  const day = dayKey((await companyClock()).now);
  const key = { builderId: user.companyId, userId: user.id, day, area };
  await systemDb.stationUsage.upsert({
    where: { builderId_userId_day_area: key },
    create: { ...key, role: user.role },
    update: { count: { increment: 1 }, lastAt: new Date() },
  });
}

/** The day `n` days before today (yyyy-mm-dd), to ask for the last n days. */
const daysAgo = (n: number) => dayKey(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

/** Every builder's last activity and how many of the last 30 days they used it. */
export async function usageByBuilder() {
  const [last, days] = await Promise.all([
    systemDb.stationUsage.groupBy({ by: ["builderId"], _max: { lastAt: true } }),
    systemDb.stationUsage.groupBy({ by: ["builderId", "day"], where: { day: { gt: daysAgo(30) }, role: { in: ["ADMIN", "STAFF"] } } }),
  ]);
  const activeDays = new Map<string, number>();
  for (const d of days) activeDays.set(d.builderId, (activeDays.get(d.builderId) ?? 0) + 1);
  return { lastActive: new Map(last.map((r) => [r.builderId, r._max.lastAt])), activeDays };
}

export type AreaUse = { area: Area; days: number; people: number; visits: number };

/** One builder, the last 30 days: each area's days, people and visits; which days had any; each person's last activity. */
export async function builderUsage(builderId: string) {
  const since = daysAgo(30);
  const rows = await systemDb.stationUsage.findMany({ where: { builderId, day: { gt: since } }, select: { userId: true, role: true, day: true, area: true, count: true } });
  const areas: AreaUse[] = AREAS.map((area) => {
    const of = rows.filter((r) => r.area === area);
    return { area, days: new Set(of.map((r) => r.day)).size, people: new Set(of.map((r) => r.userId)).size, visits: of.reduce((n, r) => n + r.count, 0) };
  });
  // The team's days (clients and subs in the portals don't make the builder "active").
  const teamDays = new Set(rows.filter((r) => r.role === "ADMIN" || r.role === "STAFF").map((r) => r.day));
  const strip = Array.from({ length: 30 }, (_, i) => daysAgo(29 - i)).map((day) => ({ day, active: teamDays.has(day) }));
  const people = await systemDb.stationUsage.groupBy({ by: ["userId"], where: { builderId }, _max: { lastAt: true } });
  return { areas, strip, lastActiveOf: new Map(people.map((p) => [p.userId, p._max.lastAt])) };
}
