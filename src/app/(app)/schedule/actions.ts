"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { boolField, intField, parseDateInput, str, strOrNull } from "@/lib/utils";
import { addWorkdays, delaySchedule, workdaysBetween } from "@/lib/workdays";
import { applyDateUpdates, jobLinks, loadWorkCal, refreshTaskReminders } from "@/lib/work-calendar";
import { refreshTiedDeadlines } from "@/lib/selections";

const TIME_OFF_TYPES = ["VACATION", "SICK", "PERSONAL"] as const;

/** Back to the page the form was on (this app's pages only). */
function back(fd: FormData, fallback = "/schedule/calendar") {
  const b = str(fd, "back");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
}

function revalidateCalendar() {
  revalidatePath("/schedule", "layout");
  revalidatePath("/todos");
  revalidatePath("/dashboard");
}

/**
 * A reminder: a To-Do for someone, due on a day — or tied to a task ("3 workdays before it
 * starts"), moving with it.
 */
export async function addReminder(fd: FormData) {
  const user = await requireStaff();
  const title = str(fd, "title");
  if (!title) throw new Error("What's the reminder?");
  const taskId = str(fd, "taskId");
  const task = taskId ? await db.scheduleTask.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, startDate: true, name: true } }) : null;
  let dueDate = parseDateInput(fd.get("date"));
  let taskOffset: number | null = null;
  if (task) {
    taskOffset = Math.max(0, Math.min(365, intField(fd, "offset", 0))) * (str(fd, "dir") === "after" ? 1 : -1);
    dueDate = addWorkdays(await loadWorkCal(), task.startDate, taskOffset);
  }
  if (!dueDate) throw new Error("Pick a day");
  const assigneeId = str(fd, "assigneeId") || user.id;
  const projectId = task?.projectId ?? (str(fd, "projectId") || null);
  await db.todo.create({
    data: {
      title,
      description: strOrNull(fd, "notes"),
      dueDate,
      assigneeId,
      createdById: user.id,
      projectId,
      taskId: task?.id ?? null,
      taskOffset,
    },
  });
  if (projectId) await logActivity({ projectId, userId: user.id, type: "todo.created", description: `Reminder "${title}"${task ? ` for "${task.name}"` : ""}` });
  revalidateCalendar();
  if (projectId) revalidatePath(`/projects/${projectId}/schedule`);
  redirect(back(fd));
}

/**
 * A company holiday: schedules skip it. With "move work", every active job with work
 * on those days is delayed by the workdays lost (logged as a delay).
 */
export async function addHoliday(fd: FormData) {
  const user = await requireAdmin();
  const title = str(fd, "title") || "Holiday";
  const startDate = parseDateInput(fd.get("start"));
  if (!startDate) throw new Error("Pick a day");
  const endDate = parseDateInput(fd.get("end")) ?? startDate;
  if (endDate < startDate) throw new Error("The last day is before the first");
  const before = await loadWorkCal();
  const lost = workdaysBetween(before, startDate, endDate);
  await db.calendarEvent.create({ data: { kind: "HOLIDAY", title, startDate, endDate } });
  let jobs = 0;
  if (boolField(fd, "moveWork") && lost > 0) {
    const cal = await loadWorkCal();
    const projects = await db.project.findMany({
      where: { status: { in: ["CONTRACTED", "IN_PROGRESS", "ON_HOLD"] }, tasks: { some: { percentComplete: { lt: 100 }, endDate: { gte: startDate } } } },
      select: { id: true },
    });
    for (const p of projects) {
      const [tasks, links] = await Promise.all([db.scheduleTask.findMany({ where: { projectId: p.id } }), jobLinks(p.id)]);
      const updates = delaySchedule(cal, tasks, links, startDate, lost);
      if (!updates.length) continue;
      await applyDateUpdates(updates);
      await db.jobDelay.create({ data: { projectId: p.id, date: startDate, days: lost, reason: `Holiday — ${title}`, moved: updates.length, userId: user.id } });
      await refreshTiedDeadlines(p.id);
      await refreshTaskReminders(p.id, cal);
      revalidatePath(`/projects/${p.id}/schedule`);
      jobs++;
    }
  }
  revalidateCalendar();
  redirect(`${back(fd)}${back(fd).includes("?") ? "&" : "?"}holiday=${jobs}`);
}

/** Time off for a team member (you can add your own; admins anyone's). */
export async function addTimeOff(fd: FormData) {
  const user = await requireStaff();
  const userId = str(fd, "userId") || user.id;
  if (userId !== user.id && user.role !== "ADMIN") throw new Error("Only an admin can add time off for someone else");
  const startDate = parseDateInput(fd.get("start"));
  if (!startDate) throw new Error("Pick the first day");
  const endDate = parseDateInput(fd.get("end")) ?? startDate;
  if (endDate < startDate) throw new Error("The last day is before the first");
  const type = (TIME_OFF_TYPES as readonly string[]).includes(str(fd, "type")) ? str(fd, "type") : "VACATION";
  const who = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!who) throw new Error("Team member not found");
  await db.calendarEvent.create({
    data: {
      kind: "TIME_OFF",
      title: `${who.name} — ${type.charAt(0) + type.slice(1).toLowerCase()}`,
      startDate,
      endDate,
      userId,
      timeOffType: type,
      notes: strOrNull(fd, "notes"),
    },
  });
  revalidateCalendar();
  redirect(back(fd));
}

/** Removes a holiday or time off (a holiday's moved work stays where it is). */
export async function deleteCalendarEvent(fd: FormData) {
  const user = await requireStaff();
  const ev = await db.calendarEvent.findUnique({ where: { id: str(fd, "id") } });
  if (!ev) redirect(back(fd));
  if (user.role !== "ADMIN" && !(ev.kind === "TIME_OFF" && ev.userId === user.id)) throw new Error("Only an admin can remove that");
  await db.calendarEvent.delete({ where: { id: ev.id } });
  revalidateCalendar();
  redirect(back(fd));
}
