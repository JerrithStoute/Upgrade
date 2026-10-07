import Link from "next/link";
import { GripVertical, Play, Plus, List, GanttChartSquare, ChevronRight, ChevronsRight, CheckCircle2, CloudRain, LayoutTemplate, Bell, Settings2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, staffUsers } from "@/lib/projects";
import { dateInput, fmtDate, cn } from "@/lib/utils";
import { groupByPhase, isTaskOverdue, overallPercent } from "@/lib/schedule";
import { placeTask, startAfter, taskWorkdays } from "@/lib/workdays";
import { canDelay, loadWorkCal } from "@/lib/work-calendar";
import { scheduleTemplateOptions } from "@/lib/schedule-templates";
import { Gantt, InsertLinks } from "@/components/schedule/gantt";
import { EraseTaskButton } from "@/components/schedule/erase-task-button";
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
  Field,
  FormGrid,
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
import { ScheduleReorder } from "./_components/schedule-reorder";
import { startTask, deleteSchedule, createTask, updateTask, deleteTask, shiftTask, completeTask, delayJob, startFromTemplate, saveAsScheduleTemplate } from "./actions";
import { addReminder } from "../../../schedule/actions";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; view?: string; delayed?: string; insert?: string; at?: string; add?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const { task: taskId, view, delayed, insert, at, add } = await searchParams;
  const project = await getProject(id);
  const [tasks, staff, links, delays, reasons, templates, cal] = await Promise.all([
    db.scheduleTask.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
      include: { assignee: { select: { id: true, name: true } }, reminders: { where: { status: { not: "DONE" } }, include: { assignee: { select: { name: true } } } } },
    }),
    staffUsers(),
    db.taskLink.findMany({ where: { task: { projectId: project.id } } }),
    db.jobDelay.findMany({ where: { projectId: project.id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { user: { select: { name: true } } } }),
    db.delayReason.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    scheduleTemplateOptions(),
    loadWorkCal(),
  ]);
  const today = new Date();
  const base = `/projects/${project.id}/schedule`;
  const editing = taskId ? tasks.find((t) => t.id === taskId) : undefined;
  // "Insert a task above / below" one: the new task starts in its phase, beside it.
  const near = !editing && insert ? tasks.find((t) => t.id === insert) : undefined;
  // "+ Add task": a new task at the end, starting the workday after the schedule's last one ends.
  const adding = !editing && !near && add === "1";
  const above = at === "above";
  const overdue = tasks.filter((t) => isTaskOverdue(t, today));
  const pctOverall = overallPercent(tasks);
  const scheduleEnd = tasks.reduce<Date | null>((m, t) => (!m || t.endDate > m ? t.endDate : m), null);
  const isList = view === "list";
  const mayDelay = canDelay(user);
  const waitsOn = (id: string) => links.filter((l) => l.taskId === id);
  const nameOf = (id: string) => tasks.find((t) => t.id === id)?.name ?? "?";
  const workWeek = cal.days.length;
  const listQ = view === "list" ? "&view=list" : "";
  const insertHref = (t: { id: string }, where: "above" | "below") => `${base}?insert=${t.id}&at=${where}${listQ}`;
  // Erase, on each row's hover tools (asks first).
  const eraseTool = (t: { id: string; name: string }) => (
    <EraseTaskButton action={deleteTask} hidden={{ projectId: project.id, id: t.id, view: isList ? "list" : "" }} name={t.name} />
  );
  // Below: starts the workday after it ends and waits on it. Above: starts when it does.
  const lastEnd = tasks.reduce<Date | null>((m, t) => (!m || t.endDate > m ? t.endDate : m), null);
  const addDates = lastEnd ? placeTask(cal, startAfter(cal, lastEnd, 0), 1) : placeTask(cal, today, 1);
  const nearDates = near ? (above ? placeTask(cal, near.startDate, 1) : placeTask(cal, startAfter(cal, near.endDate, 0), 1)) : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Tasks" value={tasks.length} hint={`${tasks.filter((t) => t.percentComplete >= 100).length} complete`} />
        <Stat label="Overall complete" value={`${pctOverall}%`} hint="Duration-weighted across all tasks" />
        <Stat
          label="Schedule ends"
          value={fmtDate(scheduleEnd)}
          hint={delays.length ? `${delays.reduce((n, d) => n + d.days, 0)} workday(s) of delays` : "Last task end date (internal only)"}
        />
        <Stat
          label="Overdue tasks"
          value={overdue.length}
          tone={overdue.length ? "bad" : "good"}
          hint={
            overdue.length
              ? overdue
                  .map((t) => t.name)
                  .slice(0, 2)
                  .join(", ")
              : "On track"
          }
        />
      </div>

      {delayed !== undefined ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Job delayed — {delayed} task{delayed === "1" ? "" : "s"} moved out. It&apos;s in the delay log below.
        </p>
      ) : null}

      {adding ? (
        <Card className="border-blue-200">
          <CardHeader
            title="Add a task"
            description="It goes at the end of its phase. To put it somewhere else, hover over a task and use Insert above / below — or drag it after."
            actions={
              <ButtonLink href={`${base}${isList ? "?view=list" : ""}`} variant="ghost" size="sm">
                Cancel
              </ButtonLink>
            }
          />
          <CardBody>
            <form action={createTask} className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="view" value={isList ? "list" : ""} />
              <TaskFields
                values={{ startDate: addDates.startDate, endDate: addDates.endDate, percentComplete: 0, color: "#2563eb" }}
                staff={staff}
                otherTasks={tasks}
                idPrefix="new"
              />
              <div className="flex items-center gap-2">
                <SubmitButton>Add task</SubmitButton>
                <ButtonLink href={`${base}${isList ? "?view=list" : ""}`} variant="secondary">
                  Cancel
                </ButtonLink>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {near && nearDates ? (
        <Card className="border-blue-200">
          <CardHeader
            title={`Insert a task ${above ? "above" : "below"} "${near.name}"`}
            description={above ? "It goes in just above it, starting when it does." : "It goes in just below it, starting the workday after it ends and waiting on it."}
            actions={
              <ButtonLink href={`${base}${isList ? "?view=list" : ""}`} variant="ghost" size="sm">
                Cancel
              </ButtonLink>
            }
          />
          <CardBody>
            <form action={createTask} className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="insertNear" value={near.id} />
              <input type="hidden" name="insertAt" value={above ? "above" : "below"} />
              <input type="hidden" name="view" value={isList ? "list" : ""} />
              <TaskFields
                key={`${near.id}:${above}`}
                values={{ phase: near.phase, startDate: nearDates.startDate, endDate: nearDates.endDate, percentComplete: 0, color: near.color }}
                staff={staff}
                otherTasks={tasks}
                links={above ? [] : [{ id: near.id, lag: 0 }]}
                idPrefix="ins"
              />
              <div className="flex items-center gap-2">
                <SubmitButton>Insert task</SubmitButton>
                <ButtonLink href={`${base}${isList ? "?view=list" : ""}`} variant="secondary">
                  Cancel
                </ButtonLink>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {editing ? (
        <Card className="border-blue-200">
          <CardHeader
            title={`Edit task — ${editing.name}`}
            description={`${fmtDate(editing.startDate)} – ${fmtDate(editing.endDate)} · ${taskWorkdays(cal, editing)} workday${taskWorkdays(cal, editing) === 1 ? "" : "s"} · ${editing.percentComplete}% complete`}
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
              <TaskFields values={editing} staff={staff} otherTasks={tasks} links={waitsOn(editing.id).map((l) => ({ id: l.predecessorId, lag: l.lagDays }))} idPrefix="edit" />
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
                <Button type="submit" variant="secondary" size="sm" title="Move this task one workday later — what waits on it moves too">
                  <ChevronRight className="h-3.5 w-3.5" /> +1 workday
                </Button>
              </form>
              <form action={shiftTask}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="days" value={workWeek} />
                <Button type="submit" variant="secondary" size="sm" title={`Move this task a work week (${workWeek} workdays) later — what waits on it moves too`}>
                  <ChevronsRight className="h-3.5 w-3.5" /> +1 week
                </Button>
              </form>
              {editing.percentComplete === 0 ? (
                <form action={startTask}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={editing.id} />
                  <Button type="submit" variant="secondary" size="sm" title="It's under way — noted in today's daily log">
                    <Play className="h-3.5 w-3.5" /> Mark started
                  </Button>
                </form>
              ) : null}
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
                <ConfirmForm action={deleteTask} hidden={{ projectId: project.id, id: editing.id }} message={`Delete task "${editing.name}"? Tasks waiting on it stop waiting.`}>
                  Delete task
                </ConfirmForm>
              </div>
            </div>
            {/* Reminders that move with the task. */}
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Bell className="h-3.5 w-3.5" /> Reminders
              </p>
              {editing.reminders.length ? (
                <ul className="space-y-1 text-sm text-slate-700">
                  {editing.reminders.map((r) => (
                    <li key={r.id}>
                      {fmtDate(r.dueDate)} · <span className="font-medium">{r.title}</span>
                      {r.assignee ? <span className="text-slate-500"> — {r.assignee.name}</span> : null}
                      <span className="text-xs text-slate-400">
                        {" "}
                        (
                        {(r.taskOffset ?? 0) === 0
                          ? "the day it starts"
                          : `${Math.abs(r.taskOffset ?? 0)} workday${Math.abs(r.taskOffset ?? 0) === 1 ? "" : "s"} ${(r.taskOffset ?? 0) < 0 ? "before" : "after"} it starts`}
                        )
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form action={addReminder} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="taskId" value={editing.id} />
                <input type="hidden" name="back" value={`${base}?task=${editing.id}`} />
                <Field label="Remind" htmlFor="rem-title">
                  <input id="rem-title" name="title" required className="input !w-64" placeholder="e.g. Confirm lumber delivery" />
                </Field>
                <Field label="Who" htmlFor="rem-who">
                  <select id="rem-who" name="assigneeId" className="input !w-44" defaultValue={user.id}>
                    {staff.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="When" htmlFor="rem-days">
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    <input id="rem-days" name="offset" type="number" min={0} max={365} defaultValue={3} className="input !w-16 text-right" />
                    <select name="dir" className="input !w-48" defaultValue="before" aria-label="Before or after it starts">
                      <option value="before">workdays before it starts</option>
                      <option value="after">workdays after it starts</option>
                    </select>
                  </span>
                </Field>
                <SubmitButton size="sm" variant="secondary">
                  Add reminder
                </SubmitButton>
              </form>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Schedule <span className="ml-1 text-sm font-normal text-slate-500">{tasks.length} tasks</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href={`${base}?add=1${isList ? "&view=list" : ""}`} size="sm">
            <Plus className="h-3.5 w-3.5" /> Add task
          </ButtonLink>
          {tasks.length ? (
            <ConfirmForm
              action={deleteSchedule}
              hidden={{ projectId: project.id }}
              variant="ghost"
              message={`Delete this job's whole schedule — all ${tasks.length} tasks, what waits on what, and the reminders tied to them? This can't be undone. (The delay log stays; selections keep their deadlines.)`}
            >
              <span className="text-xs text-rose-600">Delete schedule</span>
            </ConfirmForm>
          ) : null}
          <Link href="/schedule/calendar" className="text-xs font-medium text-blue-700 hover:underline">
            Calendar
          </Link>
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
            <Link href={base} className={cn("flex items-center gap-1 rounded px-2.5 py-1 font-medium", !isList ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
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
      </div>

      {/* Delay the job: everything not finished moves out from that day. */}
      {mayDelay && tasks.length ? (
        <Collapsible
          summary={
            <span className="flex items-center gap-2">
              <CloudRain className="h-4 w-4 text-amber-600" /> Delay this job
            </span>
          }
        >
          <form action={delayJob} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <FormGrid className="md:grid-cols-4">
              <Field label="Reason" htmlFor="delay-reason">
                <select id="delay-reason" name="reasonId" className="input" required={reasons.length > 0} defaultValue="">
                  <option value="" disabled>
                    Pick a reason…
                  </option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Day" htmlFor="delay-date" hint="Usually today">
                <input id="delay-date" name="date" type="date" className="input" defaultValue={dateInput(today)} />
              </Field>
              <Field label="Workdays" htmlFor="delay-days">
                <input id="delay-days" name="days" type="number" min={1} max={60} defaultValue={1} className="input" />
              </Field>
              <Field label="Note (optional)" htmlFor="delay-notes">
                <input id="delay-notes" name="notes" className="input" placeholder="e.g. 2 in. of rain overnight" />
              </Field>
            </FormGrid>
            {reasons.length === 0 ? (
              <p className="text-xs text-amber-700">
                No delay reasons yet —{" "}
                {user.role === "ADMIN" ? (
                  <Link href="/settings/schedule" className="font-medium underline">
                    add them in Settings → Schedule
                  </Link>
                ) : (
                  "an admin can add them in Settings → Schedule"
                )}
                . Until then it&apos;s logged as &ldquo;Other&rdquo;.
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="share" className="h-4 w-4 rounded border-slate-300" /> Show the reason to the client (they always see the new dates)
            </label>
            <div className="flex items-center gap-3">
              <SubmitButton variant="secondary">Delay the job</SubmitButton>
              <span className="text-xs text-slate-500">Everything not finished moves out; finished tasks stay. Tasks under way that day finish later.</span>
              {user.role === "ADMIN" ? (
                <Link href="/settings/schedule" className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                  <Settings2 className="h-3.5 w-3.5" /> Reasons
                </Link>
              ) : null}
            </div>
          </form>
        </Collapsible>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState icon={GanttChartSquare} title="No schedule yet" description="Start from a template below, or click + Add task above." />
      ) : isList ? (
        <ScheduleReorder projectId={project.id} insertBase={`${base}?`} insertTail={listQ}>
          <Table>
            <THead>
              <tr>
                <Th>Task</Th>
                <Th>Phase</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th right>Workdays</Th>
                <Th>Assignee</Th>
                <Th>Progress</Th>
                <Th>Waits on</Th>
              </tr>
            </THead>
            <TBody>
              {groupByPhase(tasks).flatMap((g) =>
                g.tasks.map((t) => {
                  const od = isTaskOverdue(t, today);
                  return (
                    <tr key={t.id} data-drop-task={t.id} data-task-name={t.name} className="group/row hover:bg-slate-50/60">
                      <Td className="relative">
                        <span
                          draggable
                          data-drag-task={t.id}
                          title="Drag to move it in the schedule"
                          aria-hidden
                          className="absolute left-1 top-1/2 flex h-6 w-3 -translate-y-1/2 cursor-grab items-center justify-center text-slate-400 opacity-0 transition-opacity hover:text-slate-700 active:cursor-grabbing group-hover/row:opacity-100"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <InsertLinks above={insertHref(t, "above")} below={insertHref(t, "below")} name={t.name} more={eraseTool(t)} />
                        <Link href={`${base}?task=${t.id}&view=list`} className="font-medium text-slate-900 hover:underline">
                          {t.isMilestone ? <span className="mr-1 text-violet-600">◆</span> : null}
                          {t.name}
                        </Link>
                      </Td>
                      <Td className="text-slate-500">{t.phase}</Td>
                      <Td className="whitespace-nowrap">{fmtDate(t.startDate)}</Td>
                      <Td className={cn("whitespace-nowrap", od && "font-medium text-rose-600")}>{fmtDate(t.endDate)}</Td>
                      <Td right>{t.isMilestone ? "—" : taskWorkdays(cal, t)}</Td>
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
                      <Td className="text-slate-500">
                        {waitsOn(t.id).length
                          ? waitsOn(t.id)
                              .map((l) => `${nameOf(l.predecessorId)}${l.lagDays ? ` +${l.lagDays}` : ""}`)
                              .join(", ")
                          : "—"}
                      </Td>
                    </tr>
                  );
                }),
              )}
            </TBody>
          </Table>
        </ScheduleReorder>
      ) : (
        <ScheduleReorder projectId={project.id} insertBase={`${base}?`} insertTail={listQ}>
          <Gantt tasks={tasks} today={today} taskHref={(t) => `${base}?task=${t.id}`} selectedTaskId={editing?.id} draggable insertHref={insertHref} rowTools={eraseTool} />
        </ScheduleReorder>
      )}

      <Collapsible
        defaultOpen={tasks.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4" /> Schedule templates
          </span>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <form action={startFromTemplate} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <p className="text-sm font-medium text-slate-800">Start from a template</p>
            {templates.length ? (
              <>
                <FormGrid>
                  <Field label="Template" htmlFor="tpl">
                    <select id="tpl" name="templateId" className="input">
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t._count.tasks})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Start" htmlFor="tpl-start" hint="On your workdays, holidays skipped">
                    <input id="tpl-start" name="start" type="date" required className="input" defaultValue={dateInput(today)} />
                  </Field>
                </FormGrid>
                <SubmitButton variant="secondary">{tasks.length ? "Add its tasks" : "Build the schedule"}</SubmitButton>
              </>
            ) : (
              <p className="text-xs text-slate-500">No schedule templates yet — save this job&apos;s schedule as one, or build one in Settings → Schedule templates.</p>
            )}
          </form>
          {tasks.length ? (
            <form action={saveAsScheduleTemplate} className="space-y-3">
              <input type="hidden" name="projectId" value={project.id} />
              <p className="text-sm font-medium text-slate-800">Save this schedule as a template</p>
              <Field label="Name" htmlFor="tpl-name" hint="Lengths are kept in workdays, with what waits on what">
                <input id="tpl-name" name="name" required className="input" placeholder="e.g. 2,400 sq ft one-story" />
              </Field>
              <SubmitButton variant="secondary">Save as template</SubmitButton>
            </form>
          ) : null}
        </div>
      </Collapsible>

      {delays.length ? (
        <Card>
          <CardHeader title="Delays" description={`${delays.length} logged · ${delays.reduce((n, d) => n + d.days, 0)} workday(s) in all`} />
          <Table className="rounded-t-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Day</Th>
                <Th>Reason</Th>
                <Th right>Workdays</Th>
                <Th right>Tasks moved</Th>
                <Th>By</Th>
                <Th>Client sees</Th>
              </tr>
            </THead>
            <TBody>
              {delays.map((d) => (
                <Tr key={d.id}>
                  <Td className="whitespace-nowrap">{fmtDate(d.date)}</Td>
                  <Td>
                    <span className="font-medium text-slate-900">{d.reason}</span>
                    {d.notes ? <span className="block text-xs text-slate-500">{d.notes}</span> : null}
                  </Td>
                  <Td right>{d.days}</Td>
                  <Td right>{d.moved}</Td>
                  <Td className="text-slate-600">{d.user?.name ?? "—"}</Td>
                  <Td className="text-slate-600">{d.shareWithClient ? "The reason" : "New dates only"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
