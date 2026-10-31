import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageTime, laborBurden, weekOf } from "@/lib/time-clock";
import { costWeek, entryHours, loadedRate, parseWeek, type Person } from "@/lib/time-math";

/** A week's time as a spreadsheet (CSV) for payroll: one row per stretch on the clock. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !canManageTime(user)) return new Response("Not allowed", { status: 403 });
  const url = new URL(req.url);
  const asked = parseWeek(url.searchParams.get("week"));
  // The company's week and clock: the dates and times in the file are the ones on their wall.
  const { key, from, to, clock, rules, dayOf } = await weekOf(asked ? url.searchParams.get("week")! : new Date());
  const { wall } = clock;
  const [entries, burden] = await Promise.all([
    db.timeEntry.findMany({
      where: { clockIn: { gte: from, lt: to } },
      orderBy: [{ user: { name: "asc" } }, { clockIn: "asc" }],
      include: {
        user: { select: { name: true, payRate: true, salaried: true } },
        project: { select: { number: true, name: true } },
        costCode: { select: { code: true, name: true } },
      },
    }),
    laborBurden(),
  ]);
  const people = new Map<string, Person>(entries.map((e) => [e.userId, { salaried: e.user.salaried, rate: loadedRate(e.user.payRate, burden) }]));
  const costed = costWeek(
    entries.filter((e) => e.clockOut),
    people,
    rules,
    dayOf,
  );
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = (d: Date | null) => (d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "still on the clock");
  const round = (n: number) => Math.round(n * 100) / 100;
  const lines = [["Person", "Date", "Job", "Cost code", "Started", "Stopped", "Break (min)", "Hours", "Regular", "Overtime", "Double time", ...(user.role === "ADMIN" ? ["Pay rate"] : []), "Note"].join(",")];
  for (const e of entries) {
    // Hours by the company's rules (rounding, automatic lunch); the punch times are the real ones.
    const hours = entryHours(e, new Date(), rules);
    const ot = costed.get(e.id)?.overtime ?? 0;
    const dt = costed.get(e.id)?.double ?? 0;
    lines.push(
      [
        e.user.name,
        day(wall(e.clockIn)),
        `#${e.project.number} ${e.project.name}`,
        e.costCode ? (e.costCode.code ? `${e.costCode.code} ${e.costCode.name}` : e.costCode.name) : "",
        time(wall(e.clockIn)),
        time(e.clockOut ? wall(e.clockOut) : null),
        e.breakMinutes,
        round(hours),
        round(hours - ot - dt),
        round(ot),
        round(dt),
        ...(user.role === "ADMIN" ? [e.user.payRate ?? ""] : []),
        e.notes ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="timesheets-week-of-${key}.csv"` },
  });
}
