import "server-only";
import { db } from "./db";
import { loadWorkCal } from "./work-calendar";
import { planTemplate, taskWorkdays } from "./workdays";

export type TemplateLink = { id: string; lag: number };

export function parseTemplateLinks(json: string | null | undefined): TemplateLink[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string").map((x) => ({ id: x.id, lag: Math.max(0, Math.round(Number(x.lag) || 0)) })) : [];
  } catch {
    return [];
  }
}

export function scheduleTemplateOptions() {
  return db.scheduleTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { tasks: true } } } });
}

/**
 * A template onto a job, from `start`: each task as early as what it waits on allows, on
 * your workdays (holidays skipped). Added after any tasks the job already has.
 */
export async function applyScheduleTemplate(projectId: string, templateId: string, start: Date) {
  const template = await db.scheduleTemplate.findUnique({ where: { id: templateId }, include: { tasks: { orderBy: { sortOrder: "asc" } } } });
  if (!template) throw new Error("Template not found");
  const cal = await loadWorkCal();
  const plan = planTemplate(
    cal,
    template.tasks.map((t) => ({ key: t.id, duration: t.duration, isMilestone: t.isMilestone, links: parseTemplateLinks(t.links).map((l) => ({ key: l.id, lag: l.lag })) })),
    start,
  );
  const users = new Set((await db.user.findMany({ where: { active: true }, select: { id: true } })).map((u) => u.id));
  const last = await db.scheduleTask.findFirst({ where: { projectId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  let order = (last?.sortOrder ?? -1) + 1;
  await db.$transaction(async (tx) => {
    const ids = new Map<string, string>();
    for (const t of template.tasks) {
      const p = plan.get(t.id)!;
      const made = await tx.scheduleTask.create({
        data: {
          projectId,
          name: t.name,
          phase: t.phase,
          startDate: p.startDate,
          endDate: p.endDate,
          isMilestone: t.isMilestone,
          color: t.color,
          notes: t.notes,
          assigneeId: t.assigneeId && users.has(t.assigneeId) ? t.assigneeId : null,
          sortOrder: order++,
        },
      });
      ids.set(t.id, made.id);
    }
    for (const t of template.tasks)
      for (const l of parseTemplateLinks(t.links))
        if (ids.has(l.id) && l.id !== t.id) await tx.taskLink.create({ data: { taskId: ids.get(t.id)!, predecessorId: ids.get(l.id)!, lagDays: l.lag } });
  });
  return { template, count: template.tasks.length };
}

/** A job's schedule as a new template: lengths in workdays, what waits on what. */
export async function saveScheduleAsTemplate(projectId: string, name: string) {
  const [tasks, links, cal] = await Promise.all([
    db.scheduleTask.findMany({ where: { projectId }, orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }] }),
    db.taskLink.findMany({ where: { task: { projectId } } }),
    loadWorkCal(),
  ]);
  if (!tasks.length) throw new Error("This job has no schedule to save");
  return db.$transaction(async (tx) => {
    const template = await tx.scheduleTemplate.create({ data: { name } });
    const ids = new Map<string, string>();
    for (const [i, t] of tasks.entries()) {
      const made = await tx.scheduleTemplateTask.create({
        data: {
          templateId: template.id,
          name: t.name,
          phase: t.phase,
          duration: taskWorkdays(cal, t),
          isMilestone: t.isMilestone,
          color: t.color,
          notes: t.notes,
          assigneeId: t.assigneeId,
          sortOrder: i,
        },
      });
      ids.set(t.id, made.id);
    }
    for (const t of tasks) {
      const mine = links.filter((l) => l.taskId === t.id && ids.has(l.predecessorId)).map((l) => ({ id: ids.get(l.predecessorId)!, lag: l.lagDays }));
      if (mine.length) await tx.scheduleTemplateTask.update({ where: { id: ids.get(t.id)! }, data: { links: JSON.stringify(mine) } });
    }
    return { template, count: tasks.length };
  });
}
