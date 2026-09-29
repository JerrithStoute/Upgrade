"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { boolField, intField, parseDateInput, str, strOrNull } from "@/lib/utils";
import { cascadeSuccessors, shiftChain, wouldCycle, type DateUpdate } from "@/lib/schedule";

function schedulePath(projectId: string) {
  return `/projects/${projectId}/schedule`;
}

function revalidate(projectId: string) {
  revalidatePath(schedulePath(projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/schedule");
}

async function applyUpdates(updates: DateUpdate[]) {
  if (updates.length === 0) return;
  await db.$transaction(
    updates.map((u) => db.scheduleTask.update({ where: { id: u.id }, data: { startDate: u.startDate, endDate: u.endDate } })),
  );
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
    predecessorId: strOrNull(fd, "predecessorId"),
  };
}

export async function createTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const data = readTaskFields(fd);
  if (data.predecessorId) {
    const pred = await db.scheduleTask.findFirst({ where: { id: data.predecessorId, projectId: project.id } });
    if (!pred) data.predecessorId = null;
  }
  const last = await db.scheduleTask.findFirst({ where: { projectId: project.id }, orderBy: { sortOrder: "desc" } });
  await db.scheduleTask.create({ data: { ...data, projectId: project.id, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_created", description: `Added task "${data.name}"` });
  revalidate(project.id);
  redirect(schedulePath(project.id));
}

export async function updateTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const existing = await db.scheduleTask.findFirst({ where: { id, projectId: project.id } });
  if (!existing) throw new Error("Task not found");
  const data = readTaskFields(fd);
  const all = await db.scheduleTask.findMany({ where: { projectId: project.id } });
  if (data.predecessorId === id || wouldCycle(all, id, data.predecessorId)) data.predecessorId = null;
  if (data.predecessorId && !all.some((t) => t.id === data.predecessorId)) data.predecessorId = null;

  await db.scheduleTask.update({ where: { id }, data });
  // Cascade: push successors that would now start before this task ends.
  const updatedAll = all.map((t) => (t.id === id ? { ...t, ...data } : t));
  await applyUpdates(cascadeSuccessors(updatedAll, id, data.endDate));
  await logActivity({ projectId: project.id, userId: user.id, type: "schedule.task_updated", description: `Updated task "${data.name}"` });
  revalidate(project.id);
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
  revalidate(project.id);
  redirect(schedulePath(project.id));
}

/** Shift a task and its whole successor chain by N days. */
export async function shiftTask(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const days = intField(fd, "days", 0);
  if (!days) redirect(`${schedulePath(project.id)}?task=${id}`);
  const all = await db.scheduleTask.findMany({ where: { projectId: project.id } });
  const task = all.find((t) => t.id === id);
  if (!task) throw new Error("Task not found");
  const updates = shiftChain(all, id, days);
  await applyUpdates(updates);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "schedule.shifted",
    description: `Shifted "${task.name}" and ${updates.length - 1} dependent task(s) by ${days > 0 ? "+" : ""}${days} day(s)`,
  });
  revalidate(project.id);
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
  revalidate(project.id);
  redirect(schedulePath(project.id));
}

/** Convenience used by the add-task form defaults. */
export async function defaultTaskDates() {
  const today = new Date();
  return { start: today, end: addDays(today, 2) };
}
