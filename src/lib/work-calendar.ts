import "server-only";
import { addDays } from "date-fns";
import { db } from "./db";
import { addWorkdays, dayKey, parseWorkDays, reflow, type DateUpdate, type WorkCal } from "./workdays";

/** Your work week (Settings → Schedule) and every company holiday. */
export async function loadWorkCal(): Promise<WorkCal> {
  const [company, holidays] = await Promise.all([
    db.company.findFirst({ select: { workDays: true } }),
    db.calendarEvent.findMany({ where: { kind: "HOLIDAY" }, select: { startDate: true, endDate: true } }),
  ]);
  const keys = new Set<string>();
  for (const h of holidays) for (let x = h.startDate, i = 0; dayKey(x) <= dayKey(h.endDate) && i < 366; x = addDays(x, 1), i++) keys.add(dayKey(x));
  return { days: parseWorkDays(company?.workDays), holidays: keys };
}

export function jobLinks(projectId: string) {
  return db.taskLink.findMany({ where: { task: { projectId } }, select: { taskId: true, predecessorId: true, lagDays: true } });
}

export async function applyDateUpdates(updates: DateUpdate[]) {
  if (!updates.length) return;
  await db.$transaction(updates.map((u) => db.scheduleTask.update({ where: { id: u.id }, data: { startDate: u.startDate, endDate: u.endDate } })));
}

/** Pushes a job's tasks to fit what they wait on (after a task moved or got new predecessors). */
export async function reflowJob(projectId: string, cal?: WorkCal) {
  const c = cal ?? (await loadWorkCal());
  const [tasks, links] = await Promise.all([db.scheduleTask.findMany({ where: { projectId } }), jobLinks(projectId)]);
  const updates = reflow(c, tasks, links);
  await applyDateUpdates(updates);
  return updates;
}

/** Reminders tied to a job's tasks keep their place ("3 workdays before Framing starts") as the tasks move. */
export async function refreshTaskReminders(projectId: string, cal?: WorkCal) {
  const todos = await db.todo.findMany({ where: { projectId, taskId: { not: null }, status: { not: "DONE" } }, include: { task: { select: { startDate: true } } } });
  if (!todos.length) return;
  const c = cal ?? (await loadWorkCal());
  for (const t of todos) {
    if (!t.task) continue;
    const due = addWorkdays(c, t.task.startDate, t.taskOffset ?? 0);
    if (!t.dueDate || dayKey(t.dueDate) !== dayKey(due)) await db.todo.update({ where: { id: t.id }, data: { dueDate: due } });
  }
}

/** Who may delay a job: admins, and team members you've allowed. */
export function canDelay(user: { role: string; canDelay?: boolean | null }) {
  return user.role === "ADMIN" || !!user.canDelay;
}
