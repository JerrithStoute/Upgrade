"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { boolField, fmtDate, intField, parseDateInput, str, strOrNull } from "@/lib/utils";
import { refreshTiedDeadlines } from "@/lib/selections";
import { addWorkdays, delaySchedule, nextWorkday, placeTask, taskWorkdays, wouldLoop } from "@/lib/workdays";
import { applyDateUpdates, canDelay, jobLinks, loadWorkCal, reflowJob, refreshTaskReminders } from "@/lib/work-calendar";
import { applyScheduleTemplate, saveScheduleAsTemplate } from "@/lib/schedule-templates";
import { groupByPhase } from "@/lib/schedule";
import { addToDailyLog } from "@/lib/daily-log-auto";

function schedulePath(projectId: string) {
  return `/projects/${projectId}/schedule`;
}

async function revalidate(projectId: string) {
  // Selection deadlines and reminders tied to schedule items move with them.
  await refreshTiedDeadlines(projectId);
  await refreshTaskReminders(projectId);
  revalidatePath(`/projects/${projectId}/selections`);
  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/schedule", "layout");
  revalidatePath("/todos");
}

/** "What it waits on" from the form: [{ id, lag }] (hidden JSON from the predecessors picker). */
function readLinks(fd: FormData) {
  try {
    const v = JSON.parse(str(fd, "links") || "[]");
    return Array.isArray(v)
      ? v.filter((x) => x && typeof x.id === "string" && x.id).map((x) => ({ id: String(x.id), lag: Math.max(0, Math.min(365, Math.round(Number(x.lag) || 0))) }))
      : [];
  } catch {
    return [];
  }
}

function readTaskFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Task name is required");
  const phaseCustom = str(fd, "phaseCustom");
  const phase = phaseCustom || str(fd, "phase") || "General";
  const isMilestone = boolField(fd, "isMilestone");
  const startDate = parseDateInput(fd.get("startDate"));
  if (!startDate) throw new Error("Start date is required");
  let endDate = parseDateInput(fd.get("endDate")) ?? startDate;
  if (isMilestone) endDate = startDate;
  if (endDate < startDate) endDate = startDate;
  const percentComplete = Math.max(0, Math.min(100, intField(fd, "percentComplete", 0)));
  const color = str(fd, "color") || "#2563eb";
  return {
    name,
    phase,
    isMilestone,
    startDate,
    endDate,
    percentComplete,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2563eb",
    notes: strOrNull(fd, "notes"),
    assigneeId: strOrNull(fd, "assigneeId"),
    vendorId: strOrNull(fd, "vendorId"),
  };
}

/** Replaces what a task waits on (tasks on this job only, no loops), then pushes tasks to fit. */
async function setLinks(projectId: string, taskId: string, wanted: { id: string; lag: number }[]) {
  const [tasks, links] = await Promise.all([db.scheduleTask.findMany({ where: { projectId }, select: { id: true } }), jobLinks(projectId)]);
  const ids = new Set(tasks.map((t) => t.id));
  const others = links.filter((l) => l.taskId !== taskId);
  const keep: { id: string; lag: number }[] = [];
  for (const w of wanted) {
    if (w.id === taskId || !ids.has(w.id) || keep.some((k) => k.id === w.id)) continue;
    if (wouldLoop([...others, ...keep.map((k) => ({ taskId, predecessorId: k.id }))], taskId, w.id)) continue;
    keep.push(w);
  }
  await db.$transaction([db.taskLink.deleteMany({ where: { taskId } }), ...keep.map((k) => db.taskLink.create({ data: { taskId, predecessorId: k.id, lagDays: k.lag } }))]);
}

export async function createTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const data = readTaskFields(fd);
  const last = await db.scheduleTask.findFirst({ where: { projectId: project.id }, orderBy: { sortOrder: "desc" } });
  const task = await db.scheduleTask.create({ data: { ...data, projectId: project.id, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  await setLinks(project.id, task.id, readLinks(fd));
  // "Insert a task above / below": it goes right there in the list.
  const near = str(fd, "insertNear");
  if (near) await placeNear(project.id, task.id, near, str(fd, "insertAt") !== "above", false);
  await reflowJob(project.id);
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_created", description: `Added task "${data.name}"` });
  await revalidate(project.id);
  redirect(`${schedulePath(project.id)}${str(fd, "view") === "list" ? "?view=list" : ""}`);
}

export async function updateTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const existing = await db.scheduleTask.findFirst({ where: { id, projectId: project.id } });
  if (!existing) throw new Error("Task not found");
  const data = readTaskFields(fd);
  await db.scheduleTask.update({ where: { id }, data });
  await setLinks(project.id, id, readLinks(fd));
  // Anything waiting on it (or on what it waits on) is pushed to fit.
  await reflowJob(project.id);
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_updated", description: `Updated task "${data.name}"` });
  // Under way (0% → more) or finished: in today's daily log.
  if (existing.percentComplete === 0 && data.percentComplete > 0 && data.percentComplete < 100) await logStarted(project.id, data.name, user.id);
  if (existing.percentComplete < 100 && data.percentComplete >= 100) await logCompleted(project.id, data.name, user.id);
  await revalidate(project.id);
  redirect(schedulePath(project.id));
}

export async function deleteTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const task = await db.scheduleTask.findFirst({ where: { id, projectId: project.id } });
  if (!task) throw new Error("Task not found");
  await db.scheduleTask.delete({ where: { id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_deleted", description: `Deleted task "${task.name}"` });
  await revalidate(project.id);
  redirect(`${schedulePath(project.id)}${str(fd, "view") === "list" ? "?view=list" : ""}`);
}

/** Moves a task N workdays (keeping its length); what waits on it is pushed to fit. */
export async function shiftTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const days = intField(fd, "days", 0);
  if (!days) redirect(`${schedulePath(project.id)}?task=${id}`);
  const task = await db.scheduleTask.findFirst({ where: { id, projectId: project.id } });
  if (!task) throw new Error("Task not found");
  const cal = await loadWorkCal();
  const moved = placeTask(cal, addWorkdays(cal, nextWorkday(cal, task.startDate), days), taskWorkdays(cal, task), task.isMilestone);
  await applyDateUpdates([{ id, ...moved }]);
  const pushed = await reflowJob(project.id, cal);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "schedule.shifted",
    description: `Moved "${task.name}" ${days > 0 ? "+" : ""}${days} workday(s)${pushed.length ? ` and pushed ${pushed.length} task(s) waiting on it` : ""}`,
  });
  await revalidate(project.id);
  redirect(`${schedulePath(project.id)}?task=${id}`);
}

export async function completeTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const task = await db.scheduleTask.findFirst({ where: { id, projectId: project.id } });
  if (!task) throw new Error("Task not found");
  await db.scheduleTask.update({ where: { id }, data: { percentComplete: 100 } });
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_completed", description: `Completed task "${task.name}"` });
  if (task.percentComplete < 100) await logCompleted(project.id, task.name, user.id);
  await revalidate(project.id);
  redirect(schedulePath(project.id));
}

/**
 * Delays the job: from that day, everything not finished moves out (1 workday by default),
 * logged with the reason. Admins, and team members allowed to (Settings → Team).
 */
export async function delayJob(fd: FormData) {
  const user = await requireStaff();
  if (!canDelay(user)) throw new Error("You don't have permission to delay jobs — an admin can allow it in Settings → Team");
  const project = await getProject(str(fd, "projectId"));
  const date = parseDateInput(fd.get("date")) ?? new Date();
  const days = Math.max(1, Math.min(60, intField(fd, "days", 1)));
  const reasonId = str(fd, "reasonId");
  const reason = (reasonId ? (await db.delayReason.findUnique({ where: { id: reasonId } }))?.name : null) ?? (str(fd, "reasonOther") || "Other");
  const cal = await loadWorkCal();
  const [tasks, links] = await Promise.all([db.scheduleTask.findMany({ where: { projectId: project.id } }), jobLinks(project.id)]);
  const updates = delaySchedule(cal, tasks, links, date, days);
  await applyDateUpdates(updates);
  const notes = strOrNull(fd, "notes");
  const share = boolField(fd, "share");
  await db.jobDelay.create({ data: { projectId: project.id, date, days, reason, notes, shareWithClient: share, moved: updates.length, userId: user.id } });
  // In that day's daily log, under Issues — the client's log when you share the reason, else an internal one.
  await addToDailyLog({
    projectId: project.id,
    date,
    authorId: user.id,
    field: "issues",
    line: `Delayed ${days} workday${days === 1 ? "" : "s"} — ${reason}${notes ? `: ${notes}` : ""}`,
    clientVisible: share,
  });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "schedule.delayed",
    description: `Delayed ${days} workday${days === 1 ? "" : "s"} from ${fmtDate(date)} — ${reason} (${updates.length} task${updates.length === 1 ? "" : "s"} moved)`,
  });
  await revalidate(project.id);
  redirect(`${schedulePath(project.id)}?delayed=${updates.length}`);
}

/** Lays a schedule template onto the job from a start date. */
export async function startFromTemplate(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const start = parseDateInput(fd.get("start"));
  if (!start) throw new Error("Pick a start date");
  const { template, count } = await applyScheduleTemplate(project.id, str(fd, "templateId"), start);
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.template_applied", description: `Added ${count} tasks from schedule template "${template.name}"` });
  await revalidate(project.id);
  redirect(schedulePath(project.id));
}

/** This job's schedule as a new template. */
export async function saveAsScheduleTemplate(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const name = str(fd, "name");
  if (!name) throw new Error("Give the template a name");
  const { template, count } = await saveScheduleAsTemplate(project.id, name);
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.template_saved", description: `Saved the schedule as template "${name}" (${count} tasks)` });
  revalidatePath("/settings/schedule-templates");
  redirect(`/settings/schedule-templates?edit=${template.id}`);
}

/**
 * Drag and drop: puts a task just before or after another, as the schedule shows them
 * (grouped by phase). Dropped beside a task in another phase, it joins that phase. Dates and
 * what it waits on don't change.
 */
export async function moveTask(projectId: string, id: string, targetId: string, after: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireStaff();
  const project = await getProject(projectId);
  const tasks = await db.scheduleTask.findMany({ where: { projectId: project.id } });
  const task = tasks.find((t) => t.id === id);
  const target = tasks.find((t) => t.id === targetId);
  if (!task || !target || id === targetId) return { ok: false, error: "Task not found" };
  await placeNear(project.id, id, targetId, after, true);
  if (task.phase !== target.phase)
    await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_updated", description: `Moved "${task.name}" to ${target.phase}` });
  revalidatePath(schedulePath(project.id));
  revalidatePath(`/projects/${project.id}`);
  revalidatePath("/schedule", "layout");
  return { ok: true };
}

/** Lists `id` just before or after `targetId`, as the schedule shows them (by phase); `joinPhase` takes the target's phase. */
async function placeNear(projectId: string, id: string, targetId: string, after: boolean, joinPhase: boolean) {
  const tasks = await db.scheduleTask.findMany({ where: { projectId } });
  const task = tasks.find((t) => t.id === id);
  const target = tasks.find((t) => t.id === targetId);
  if (!task || !target || id === targetId) return;
  const phase = joinPhase ? target.phase : task.phase;
  const order = groupByPhase(tasks.map((t) => (t.id === id ? { ...t, phase } : t)))
    .flatMap((g) => g.tasks)
    .filter((t) => t.id !== id);
  // A task in another phase than the one it's placed by can't sit beside it: it stays in its phase's group.
  const at = order.findIndex((t) => t.id === targetId);
  order.splice(at + (after ? 1 : 0), 0, { ...task, phase });
  await db.$transaction(order.map((t, i) => db.scheduleTask.update({ where: { id: t.id }, data: { sortOrder: i, ...(t.id === id && phase !== task.phase ? { phase } : {}) } })));
}

/**
 * Starts the job's schedule over: every task goes (with what waits on what and the reminders
 * tied to them). Selections tied to a task keep the deadline they had. The delay log stays.
 */
export async function deleteSchedule(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const { count } = await db.scheduleTask.deleteMany({ where: { projectId: project.id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.deleted", description: `Deleted the schedule (${count} task${count === 1 ? "" : "s"})` });
  await revalidate(project.id);
  redirect(schedulePath(project.id));
}

/** A task under way: "Started: Framing & header" in today's daily log, under Work completed. */
async function logStarted(projectId: string, name: string, userId: string) {
  await addToDailyLog({ projectId, date: new Date(), authorId: userId, field: "workCompleted", line: `Started: ${name}`, clientVisible: true });
}

/** "Mark started": a task not started yet is under way (1%), and today's daily log says so. */
export async function startTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const task = await db.scheduleTask.findFirst({ where: { id, projectId: project.id } });
  if (!task) throw new Error("Task not found");
  if (task.percentComplete === 0) {
    await db.scheduleTask.update({ where: { id }, data: { percentComplete: 1 } });
    await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_started", description: `Started task "${task.name}"` });
    await logStarted(project.id, task.name, user.id);
  }
  await revalidate(project.id);
  redirect(`${schedulePath(project.id)}?task=${id}`);
}

/** A task finished: "Completed: Framing & header" in today's daily log, under Work completed. */
async function logCompleted(projectId: string, name: string, userId: string) {
  await addToDailyLog({ projectId, date: new Date(), authorId: userId, field: "workCompleted", line: `Completed: ${name}`, clientVisible: true });
}
