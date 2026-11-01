import Link from "@/components/link";
import { addDays, startOfDay, startOfWeek, endOfWeek } from "date-fns";
import { CalendarRange } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, cn } from "@/lib/utils";
import { isTaskOverdue, overlapsRange } from "@/lib/schedule";
import { Gantt } from "@/components/schedule/gantt";
import { Card, CardHeader, CardBody, Badge, EmptyState, Progress } from "@/components/ui";
import { companyClock } from "@/lib/company-zone";

export default async function GlobalSchedulePage() {
  await requireView("field");
  const today = (await companyClock()).now; // today, on the company's clock
  const weekStart = startOfWeek(startOfDay(today), { weekStartsOn: 1 });
  const weekEnd = startOfDay(endOfWeek(today, { weekStartsOn: 1 }));
  const windowStart = weekStart;
  const windowEnd = addDays(weekStart, 27);

  const projects = await db.project.findMany({
    where: { status: { in: ["CONTRACTED", "IN_PROGRESS", "ON_HOLD"] }, isTemplate: false },
    orderBy: [{ status: "asc" }, { number: "asc" }],
    include: {
      tasks: {
        where: { startDate: { lte: addDays(windowEnd, 1) }, endDate: { gte: addDays(windowStart, -1) } },
        orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
        include: { assignee: { select: { id: true, name: true } } },
      },
    },
  });

  const thisWeek = projects
    .flatMap((p) => p.tasks.filter((t) => overlapsRange(t, weekStart, weekEnd)).map((t) => ({ ...t, project: p })))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Four-week overview across active projects · {fmtDate(windowStart)} – {fmtDate(windowEnd)}
      </p>
      <div className="space-y-6">
        <Card>
          <CardHeader title="This week" description={`${fmtDate(weekStart)} – ${fmtDate(weekEnd)} · ${thisWeek.length} task${thisWeek.length === 1 ? "" : "s"} in progress`} />
          {thisWeek.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">Nothing scheduled this week.</p>
            </CardBody>
          ) : (
            <>
              {/* Phones: one card per task instead of the wide table. */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {thisWeek.map((t) => {
                  const od = isTaskOverdue(t, today);
                  return (
                    <li key={t.id}>
                      <Link href={`/projects/${t.project.id}/schedule?task=${t.id}`} className="block px-4 py-3 active:bg-slate-50">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 font-medium text-slate-900">
                            {t.isMilestone ? <span className="mr-1 text-violet-600">◆</span> : null}
                            {t.name}
                          </span>
                          <span className={cn("shrink-0 text-xs", od ? "font-medium text-rose-600" : "text-slate-500")}>
                            {t.isMilestone ? fmtDate(t.startDate, "MMM d") : `${fmtDate(t.startDate, "MMM d")} – ${fmtDate(t.endDate, "MMM d")}`}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          #{t.project.number} {t.project.name}
                          {t.assignee ? ` · ${t.assignee.name}` : ""}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <Progress value={t.percentComplete} color={t.color} className="flex-1" />
                          <span className="w-9 text-right text-xs tabular-nums text-slate-600">{t.percentComplete}%</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-4 py-2 font-normal">Job</th>
                      <th className="px-3 py-2 font-normal">Task</th>
                      <th className="px-3 py-2 font-normal">Dates</th>
                      <th className="px-3 py-2 font-normal">Who</th>
                      <th className="px-4 py-2 font-normal">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thisWeek.map((t) => {
                      const od = isTaskOverdue(t, today);
                      return (
                        <tr key={t.id} className="border-b border-slate-100 align-top last:border-b-0">
                          <td className="px-4 py-2">
                            <Link href={`/projects/${t.project.id}/schedule`} className="hover:underline">
                              #{t.project.number} {t.project.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <Link href={`/projects/${t.project.id}/schedule?task=${t.id}`} className="font-medium text-blue-700 hover:underline">
                              {t.isMilestone ? <span className="mr-1 text-violet-600">◆</span> : null}
                              {t.name}
                            </Link>
                            {t.phase ? <span className="block text-xs text-slate-500">{t.phase}</span> : null}
                          </td>
                          <td className={cn("whitespace-nowrap px-3 py-2", od && "font-medium text-rose-600")}>
                            {t.isMilestone ? fmtDate(t.startDate, "MMM d") : `${fmtDate(t.startDate, "MMM d")} – ${fmtDate(t.endDate, "MMM d")}`}
                            {od ? <span className="block text-xs">overdue</span> : null}
                          </td>
                          <td className="px-3 py-2">{t.assignee ? t.assignee.name : <span className="text-slate-400">—</span>}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <Progress value={t.percentComplete} color={t.color} className="w-20" />
                              <span className="text-xs tabular-nums text-slate-600">{t.percentComplete}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {projects.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No active projects" description="Projects that are contracted, in progress or on hold show up here." />
        ) : (
          projects.map((p) => (
            <Card key={p.id}>
              <CardHeader
                title={
                  <Link href={`/projects/${p.id}/schedule`} className="hover:underline">
                    #{p.number} {p.name}
                  </Link>
                }
                description={
                  <span className="flex items-center gap-2">
                    <Badge status={p.status} />
                    <span>
                      {p.tasks.length} task{p.tasks.length === 1 ? "" : "s"} in the next four weeks
                    </span>
                  </span>
                }
                actions={
                  <Link href={`/projects/${p.id}/schedule`} className="text-sm font-medium text-blue-700 hover:underline">
                    Full schedule →
                  </Link>
                }
              />
              <CardBody className="px-3 py-3">
                <Gantt tasks={p.tasks} today={today} compact window={{ start: windowStart, end: windowEnd }} taskHref={(t) => `/projects/${p.id}/schedule?task=${t.id}`} />
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
