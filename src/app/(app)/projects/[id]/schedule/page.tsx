import Link from "next/link";
import { addDays, differenceInCalendarDays } from "date-fns";
import { Plus, List, GanttChartSquare, ChevronRight, ChevronsRight, CheckCircle2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, staffUsers } from "@/lib/projects";
import { fmtDate, cn } from "@/lib/utils";
import { groupByPhase, isTaskOverdue, overallPercent } from "@/lib/schedule";
import { Gantt } from "@/components/schedule/gantt";
import {
  Stat,
  Card,
  CardHeader,
  CardBody,
  Collapsible,
  SubmitButton,
  ConfirmForm,
  Button,
  ButtonLink,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  Progress,
  EmptyState,
  Avatar,
} from "@/components/ui";
import { TaskFields } from "./_components/task-form";
import { createTask, updateTask, deleteTask, shiftTask, completeTask } from "./actions";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; view?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const { task: taskId, view } = await searchParams;
  const project = await getProject(id);
  const [tasks, staff] = await Promise.all([
    db.scheduleTask.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
      include: { assignee: { select: { id: true, name: true } } },
    }),
    staffUsers(),
  ]);
  const today = new Date();
  const base = `/projects/${project.id}/schedule`;
  const editing = taskId ? tasks.find((t) => t.id === taskId) : undefined;
  const overdue = tasks.filter((t) => isTaskOverdue(t, today));
  const pctOverall = overallPercent(tasks);
  const scheduleEnd = tasks.reduce<Date | null>((m, t) => (!m || t.endDate > m ? t.endDate : m), null);
  const isList = view === "list";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Tasks" value={tasks.length} hint={`${tasks.filter((t) => t.percentComplete >= 100).length} complete`} />
        <Stat label="Overall complete" value={`${pctOverall}%`} hint="Duration-weighted across all tasks" />
        <Stat label="Schedule ends" value={fmtDate(scheduleEnd)} hint="Last task end date (internal only)" />
        <Stat label="Overdue tasks" value={overdue.length} tone={overdue.length ? "bad" : "good"} hint={overdue.length ? overdue.map((t) => t.name).slice(0, 2).join(", ") : "On track"} />
      </div>

      {editing ? (
        <Card className="border-blue-200">
          <CardHeader
            title={`Edit task — ${editing.name}`}
            description={`${fmtDate(editing.startDate)} – ${fmtDate(editing.endDate)} · ${editing.percentComplete}% complete`}
            actions={
              <ButtonLink href={base} variant="ghost" size="sm">
                Close
              </ButtonLink>
            }
          />
          <CardBody className="space-y-4">
            <form action={updateTask} className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={editing.id} />
              <TaskFields values={editing} staff={staff} otherTasks={tasks} idPrefix="edit" />
              <div className="flex flex-wrap items-center gap-2">
                <SubmitButton>Save changes</SubmitButton>
                <ButtonLink href={base} variant="secondary">
                  Cancel
                </ButtonLink>
              </div>
            </form>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Quick actions</span>
              <form action={shiftTask}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="days" value="1" />
                <Button type="submit" variant="secondary" size="sm" title="Shift this task and all successors by one day">
                  <ChevronRight className="h-3.5 w-3.5" /> +1 day
                </Button>
              </form>
              <form action={shiftTask}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="days" value="7" />
                <Button type="submit" variant="secondary" size="sm" title="Shift this task and all successors by one week">
                  <ChevronsRight className="h-3.5 w-3.5" /> +1 week
                </Button>
              </form>
              {editing.percentComplete < 100 ? (
                <form action={completeTask}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={editing.id} />
                  <Button type="submit" variant="success" size="sm">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark complete
                  </Button>
                </form>
              ) : null}
              <div className="ml-auto">
                <ConfirmForm action={deleteTask} hidden={{ projectId: project.id, id: editing.id }} message={`Delete task "${editing.name}"? Successors will lose their predecessor link.`}>
                  Delete task
                </ConfirmForm>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Schedule <span className="ml-1 text-sm font-normal text-slate-500">{tasks.length} tasks</span>
        </h2>
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
          <Link
            href={base}
            className={cn("flex items-center gap-1 rounded px-2.5 py-1 font-medium", !isList ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            <GanttChartSquare className="h-3.5 w-3.5" /> Gantt
          </Link>
          <Link
            href={`${base}?view=list`}
            className={cn("flex items-center gap-1 rounded px-2.5 py-1 font-medium", isList ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            <List className="h-3.5 w-3.5" /> List
          </Link>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={GanttChartSquare} title="No schedule yet" description="Add the first task below to start building the project timeline." />
      ) : isList ? (
        <Table>
          <THead>
            <tr>
              <Th>Task</Th>
              <Th>Phase</Th>
              <Th>Start</Th>
              <Th>End</Th>
              <Th right>Days</Th>
              <Th>Assignee</Th>
              <Th>Progress</Th>
              <Th>Predecessor</Th>
            </tr>
          </THead>
          <TBody>
            {groupByPhase(tasks).flatMap((g) =>
              g.tasks.map((t) => {
                const od = isTaskOverdue(t, today);
                return (
                  <Tr key={t.id}>
                    <Td>
                      <Link href={`${base}?task=${t.id}&view=list`} className="font-medium text-slate-900 hover:underline">
                        {t.isMilestone ? <span className="mr-1 text-violet-600">◆</span> : null}
                        {t.name}
                      </Link>
                    </Td>
                    <Td className="text-slate-500">{t.phase}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(t.startDate)}</Td>
                    <Td className={cn("whitespace-nowrap", od && "font-medium text-rose-600")}>{fmtDate(t.endDate)}</Td>
                    <Td right>{t.isMilestone ? "—" : differenceInCalendarDays(t.endDate, t.startDate) + 1}</Td>
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
                    <Td className="text-slate-500">{tasks.find((p) => p.id === t.predecessorId)?.name ?? "—"}</Td>
                  </Tr>
                );
              }),
            )}
          </TBody>
        </Table>
      ) : (
        <Gantt tasks={tasks} today={today} taskHref={(t) => `${base}?task=${t.id}`} selectedTaskId={editing?.id} />
      )}

      <Collapsible
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add task
          </span>
        }
      >
        <form action={createTask} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <TaskFields values={{ startDate: today, endDate: addDays(today, 2), percentComplete: 0, color: "#2563eb" }} staff={staff} otherTasks={tasks} idPrefix="new" />
          <SubmitButton>Add task</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
