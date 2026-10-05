import { CalendarDays, Flag, CheckCircle2, CircleDot, Circle } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext, scheduleProgress } from "@/lib/portal";
import { cn, fmtDate } from "@/lib/utils";
import { Card, CardHeader, Collapsible, EmptyState, Progress, Stat } from "@/components/ui";
import { Gantt } from "@/components/schedule/gantt";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Schedule" };

function taskState(t: { percentComplete: number; startDate: Date }) {
  if (t.percentComplete >= 100) return "done" as const;
  if (t.percentComplete > 0 || t.startDate <= new Date()) return "active" as const;
  return "upcoming" as const;
}

export default async function PortalSchedulePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Schedule" projects={projects} project={null} />
        <EmptyState icon={CalendarDays} title="No projects yet" description="Your schedule will appear here once your project is set up." />
      </>
    );
  }

  const tasks = await db.scheduleTask.findMany({
    where: { projectId: project.id },
    orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
    include: { assignee: { select: { name: true } } },
  });
  const progress = scheduleProgress(tasks);
  const milestones = tasks.filter((t) => t.isMilestone);
  const done = tasks.filter((t) => t.percentComplete >= 100).length;
  const active = tasks.filter((t) => taskState(t) === "active").length;

  // Group by phase, preserving first-appearance order (tasks are date-sorted).
  const phases = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const list = phases.get(t.phase) ?? [];
    list.push(t);
    phases.set(t.phase, list);
  }

  return (
    <>
      <PortalPageHeader title="Schedule" description="Where the work stands, phase by phase. Dates may shift as the project progresses." projects={projects} project={project} />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Overall progress</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{progress}%</p>
            <Progress value={progress} className="mt-2" />
          </div>
          <Stat label="Tasks complete" value={`${done} / ${tasks.length}`} tone="good" />
          <Stat label="In progress" value={active} />
        </div>

        {tasks.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No schedule yet" description="Your team hasn't published a schedule for this project." />
        ) : (
          <>
            <Collapsible summary="Timeline view" defaultOpen>
              <Gantt tasks={tasks} compact taskHref={(t) => `#task-${t.id}`} />
            </Collapsible>

            {milestones.length ? (
              <Card>
                <CardHeader title="Milestones" description="Key dates on the project" />
                <ul className="divide-y divide-slate-100">
                  {milestones.map((m) => {
                    const state = taskState(m);
                    return (
                      <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <Flag className={cn("h-4 w-4 shrink-0", state === "done" ? "text-emerald-600" : state === "active" ? "text-blue-600" : "text-slate-400")} />
                        <span className={cn("flex-1 font-medium", state === "done" ? "text-slate-500 line-through" : "text-slate-900")}>{m.name}</span>
                        <span className="text-xs text-slate-500">{fmtDate(m.endDate)}</span>
                        <StateLabel state={state} />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            {[...phases.entries()].map(([phase, list]) => {
              const phaseProgress = scheduleProgress(list);
              const start = list[0].startDate;
              const end = list.reduce((m, t) => (t.endDate > m ? t.endDate : m), list[0].endDate);
              return (
                <Card key={phase}>
                  <CardHeader
                    title={phase}
                    description={`${fmtDate(start)} – ${fmtDate(end)} · ${list.length} task${list.length === 1 ? "" : "s"}`}
                    actions={
                      <div className="flex w-40 items-center gap-2">
                        <Progress value={phaseProgress} />
                        <span className="text-xs font-medium tabular-nums text-slate-600">{phaseProgress}%</span>
                      </div>
                    }
                  />
                  <ul className="divide-y divide-slate-100">
                    {list.map((t) => {
                      const state = taskState(t);
                      const Icon = state === "done" ? CheckCircle2 : state === "active" ? CircleDot : Circle;
                      return (
                        <li
                          key={t.id}
                          id={`task-${t.id}`}
                          className="grid scroll-mt-32 grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm sm:grid-cols-[auto_1fr_150px_180px_auto]"
                        >
                          <Icon className={cn("h-4 w-4", state === "done" ? "text-emerald-600" : state === "active" ? "text-blue-600" : "text-slate-300")} />
                          <span className={cn("min-w-0 truncate", state === "done" ? "text-slate-500" : "text-slate-900", t.isMilestone && "font-medium")}>
                            {t.isMilestone ? <Flag className="mr-1 inline h-3 w-3 text-slate-400" /> : null}
                            {t.name}
                          </span>
                          <span className="col-start-2 text-xs text-slate-500 sm:col-start-auto">
                            {fmtDate(t.startDate, "MMM d")} – {fmtDate(t.endDate, "MMM d, yyyy")}
                          </span>
                          <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
                            <Progress value={t.percentComplete} color={t.color} className="h-1.5" />
                            <span className="w-9 text-right text-xs tabular-nums text-slate-600">{t.percentComplete}%</span>
                          </span>
                          <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">
                            <StateLabel state={state} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

function StateLabel({ state }: { state: "done" | "active" | "upcoming" }) {
  const styles = {
    done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    active: "bg-blue-50 text-blue-800 ring-blue-200",
    upcoming: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  const labels = { done: "Done", active: "In progress", upcoming: "Upcoming" };
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", styles[state])}>{labels[state]}</span>;
}
