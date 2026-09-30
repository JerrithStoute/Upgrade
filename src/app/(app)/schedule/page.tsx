import Link from "next/link";
import { addDays, startOfDay, startOfWeek, endOfWeek } from "date-fns";
import { CalendarRange } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, cn } from "@/lib/utils";
import { isTaskOverdue, overlapsRange } from "@/lib/schedule";
import { Gantt } from "@/components/schedule/gantt";
import { PageHeader, Card, CardHeader, CardBody, Badge, Table, THead, TBody, Tr, Th, Td, EmptyState, Progress, Avatar } from "@/components/ui";

export default async function GlobalSchedulePage() {
  await requireStaff();
  const today = new Date();
  const weekStart = startOfWeek(startOfDay(today), { weekStartsOn: 1 });
  const weekEnd = startOfDay(endOfWeek(today, { weekStartsOn: 1 }));
  const windowStart = weekStart;
  const windowEnd = addDays(weekStart, 27);

  const projects = await db.project.findMany({
    where: { status: { in: ["CONTRACTED", "IN_PROGRESS", "ON_HOLD"] } },
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
      <PageHeader
        title="Schedule"
        description={`Four-week overview across active projects · ${fmtDate(windowStart)} – ${fmtDate(windowEnd)}`}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="This week" description={`${fmtDate(weekStart)} – ${fmtDate(weekEnd)} · ${thisWeek.length} task${thisWeek.length === 1 ? "" : "s"} in progress`} />
          {thisWeek.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">Nothing scheduled this week.</p>
            </CardBody>
          ) : (
            <Table className="rounded-t-none border-0 shadow-none">
              <THead>
                <tr>
                  <Th>Project</Th>
                  <Th>Task</Th>
                  <Th>Dates</Th>
                  <Th>Assignee</Th>
                  <Th>Progress</Th>
                </tr>
              </THead>
              <TBody>
                {thisWeek.map((t) => {
                  const od = isTaskOverdue(t, today);
                  return (
                    <Tr key={t.id}>
                      <Td>
                        <Link href={`/projects/${t.project.id}`} className="font-medium text-slate-900 hover:underline">
                          #{t.project.number} {t.project.name}
                        </Link>
                      </Td>
                      <Td>
                        <Link href={`/projects/${t.project.id}/schedule?task=${t.id}`} className="hover:underline">
                          {t.isMilestone ? <span className="mr-1 text-violet-600">◆</span> : null}
                          {t.name}
                        </Link>
                        <span className="ml-2 text-xs text-slate-400">{t.phase}</span>
                      </Td>
                      <Td className={cn("whitespace-nowrap", od && "font-medium text-rose-600")}>
                        {t.isMilestone ? fmtDate(t.startDate, "MMM d") : `${fmtDate(t.startDate, "MMM d")} – ${fmtDate(t.endDate, "MMM d")}`}
                      </Td>
                      <Td>
                        {t.assignee ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar name={t.assignee.name} className="h-6 w-6 text-[10px]" /> {t.assignee.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Progress value={t.percentComplete} color={t.color} className="w-20" />
                          <span className="text-xs tabular-nums text-slate-600">{t.percentComplete}%</span>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
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
                <Gantt
                  tasks={p.tasks}
                  today={today}
                  compact
                  window={{ start: windowStart, end: windowEnd }}
                  taskHref={(t) => `/projects/${p.id}/schedule?task=${t.id}`}
                />
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
