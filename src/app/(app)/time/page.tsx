import Link from "@/components/link";
import { ClipboardList } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE } from "@/lib/reports";
import { canManageTime, openEntry, weekOf } from "@/lib/time-clock";
import { entryHours, fmtHours, OVERTIME_AFTER, sameDay, weekDays } from "@/lib/time-math";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ClockPanel, type Code, type Job } from "./_components/clock-panel";

export const metadata = { title: "Time clock" };

const timeOf = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const codeLabel = (c: { code: string | null; name: string }) => (c.code ? `${c.code} ${c.name}` : c.name);

export default async function TimeClockPage() {
  const user = await requireStaff();
  const now = new Date();
  // Days and times on the company's clock.
  const { monday, from, to, clock } = await weekOf(now);
  const { wall } = clock;
  const today = clock.now;
  const [open, projects, costCodes, mine, me] = await Promise.all([
    openEntry(user.id),
    db.project.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true, number: true, name: true, status: true }, orderBy: { number: "desc" } }),
    db.costCode.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true, division: true },
      orderBy: [{ division: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    }),
    db.timeEntry.findMany({
      where: { userId: user.id },
      orderBy: { clockIn: "desc" },
      take: 200,
      include: { project: { select: { number: true, name: true } }, costCode: { select: { code: true, name: true } } },
    }),
    db.user.findUnique({ where: { id: user.id }, select: { salaried: true } }),
  ]);
  // The cost codes on each job's estimates come first in the list.
  const onEstimates = await db.estimateItem.findMany({
    where: { costCodeId: { not: null }, estimate: { projectId: { in: projects.map((p) => p.id) } } },
    select: { costCodeId: true, estimate: { select: { projectId: true } } },
    distinct: ["costCodeId", "estimateId"],
  });

  const label = (p: { number: number; name: string }) => `#${p.number} ${p.name}`;
  const recentIds = [...new Set(mine.map((e) => e.projectId))].slice(0, 3);
  const jobs: Job[] = [
    ...recentIds.flatMap((id) => projects.filter((p) => p.id === id).map((p) => ({ id: p.id, label: label(p), group: "Recent" }))),
    ...projects.filter((p) => ACTIVE.includes(p.status)).map((p) => ({ id: p.id, label: label(p), group: "Active jobs" })),
    ...projects.filter((p) => !ACTIVE.includes(p.status)).map((p) => ({ id: p.id, label: label(p), group: "Other jobs" })),
  ];
  const codes: Code[] = costCodes.map((c) => ({ id: c.id, label: codeLabel(c), division: c.division }));
  const jobCodes: Record<string, string[]> = {};
  for (const r of onEstimates) {
    const list = (jobCodes[r.estimate.projectId] ??= []);
    if (r.costCodeId && !list.includes(r.costCodeId)) list.push(r.costCodeId);
  }
  const order = new Map(codes.map((c, i) => [c.id, i]));
  for (const k of Object.keys(jobCodes)) jobCodes[k].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  // Each job opens on the cost code you last used there.
  const lastCode: Record<string, string> = {};
  for (const e of mine) if (e.costCodeId && !(e.projectId in lastCode)) lastCode[e.projectId] = e.costCodeId;

  const week = mine.filter((e) => e.clockIn >= from && e.clockIn < to).reverse();
  const total = week.reduce((n, e) => n + entryHours(e, now), 0);
  const overtime = me?.salaried ? 0 : Math.max(0, total - OVERTIME_AFTER);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Time clock"
        actions={
          canManageTime(user) ? (
            <Link href="/time/sheets" className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
              <ClipboardList className="h-4 w-4" /> Timesheets
            </Link>
          ) : null
        }
      />
      <ClockPanel
        open={open ? { projectId: open.projectId, job: label(open.project), code: open.costCode ? codeLabel(open.costCode) : null, since: open.clockIn.toISOString() } : null}
        jobs={jobs}
        codes={codes}
        jobCodes={jobCodes}
        lastCode={lastCode}
      />

      <Card className="mt-6">
        <CardHeader
          title="This week"
          description={`${fmtHours(total)} hrs${overtime > 0.004 ? ` · ${fmtHours(overtime)} overtime` : ""} · week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-slate-100">
            {weekDays(monday)
              .filter((d) => d <= today)
              .reverse()
              .map((d) => {
                const day = week.filter((e) => sameDay(wall(e.clockIn), d));
                const hours = day.reduce((n, e) => n + entryHours(e, now), 0);
                return (
                  <li key={d.toISOString()} className="px-4 py-3">
                    <p className="flex items-baseline justify-between text-sm">
                      <span className={cn("font-medium", sameDay(d, today) ? "text-slate-900" : "text-slate-700")}>
                        {sameDay(d, today) ? "Today" : d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                      </span>
                      <span className={cn("tabular-nums", hours ? "font-medium text-slate-900" : "text-slate-400")}>{hours ? `${fmtHours(hours)} hrs` : "—"}</span>
                    </p>
                    {day.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {day.map((e) => (
                          <li key={e.id} className="flex justify-between gap-3 text-xs text-slate-500">
                            <span className="min-w-0 truncate">
                              {label(e.project)}
                              {e.costCode ? ` · ${codeLabel(e.costCode)}` : ""}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {timeOf(wall(e.clockIn))} – {e.clockOut ? timeOf(wall(e.clockOut)) : <span className="font-medium text-emerald-700">now</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
