"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/utils";
import { wouldLoop } from "@/lib/workdays";
import { SAMPLE_NEW_HOME, SAMPLE_NEW_HOME_NAME, phaseColor } from "@/lib/sample-schedule";

const path = "/settings/schedule-templates";

export async function createScheduleTemplate(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) throw new Error("Give it a name");
  const t = await db.scheduleTemplate.create({ data: { name } });
  revalidatePath(path);
  redirect(`${path}?edit=${t.id}`);
}

export async function deleteScheduleTemplate(fd: FormData) {
  await requireAdmin();
  await db.scheduleTemplate.delete({ where: { id: str(fd, "id") } }).catch(() => null);
  revalidatePath(path);
  redirect(path);
}

const taskInput = z.object({
  key: z.string().max(60),
  name: z.string().trim().min(1, "Every task needs a name").max(200),
  phase: z.string().trim().max(60),
  duration: z.number().int().min(1).max(999),
  isMilestone: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  assigneeId: z.string().nullable(),
  links: z.array(z.object({ key: z.string(), lag: z.number().int().min(0).max(365) })).max(50),
});
const templateInput = z.object({ name: z.string().trim().min(1, "Give it a name").max(120), tasks: z.array(taskInput).max(500) });

/** Saves the whole template: its tasks in order, each with what it waits on (by the editor's row keys). */
export async function saveScheduleTemplate(id: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = templateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the tasks" };
  const { name } = parsed.data;
  // What waits on what, without loops (a link that would make one is dropped).
  const kept: { taskId: string; predecessorId: string }[] = [];
  const tasks = parsed.data.tasks.map((t) => ({
    ...t,
    links: t.links.filter((l) => {
      if (l.key === t.key || !parsed.data.tasks.some((x) => x.key === l.key) || wouldLoop(kept, t.key, l.key)) return false;
      kept.push({ taskId: t.key, predecessorId: l.key });
      return true;
    }),
  }));
  const template = await db.scheduleTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!template) return { ok: false, error: "Template not found" };
  await db.$transaction(async (tx) => {
    await tx.scheduleTemplate.update({ where: { id }, data: { name } });
    await tx.scheduleTemplateTask.deleteMany({ where: { templateId: id } });
    const ids = new Map<string, string>();
    for (const [i, t] of tasks.entries()) {
      const made = await tx.scheduleTemplateTask.create({
        data: {
          templateId: id,
          name: t.name,
          phase: t.phase || "General",
          duration: t.isMilestone ? 1 : t.duration,
          isMilestone: t.isMilestone,
          color: t.color,
          assigneeId: t.assigneeId || null,
          sortOrder: i,
        },
      });
      ids.set(t.key, made.id);
    }
    for (const t of tasks) {
      const links = t.links.filter((l) => ids.has(l.key) && l.key !== t.key).map((l) => ({ id: ids.get(l.key)!, lag: l.lag }));
      if (links.length) await tx.scheduleTemplateTask.update({ where: { id: ids.get(t.key)! }, data: { links: JSON.stringify(links) } });
    }
  });
  revalidatePath(path);
  return { ok: true };
}

/** Adds the sample new-home template (a fresh copy each time) and opens it to edit. */
export async function addSampleScheduleTemplate() {
  await requireAdmin();
  const count = await db.scheduleTemplate.count({ where: { name: { startsWith: SAMPLE_NEW_HOME_NAME } } });
  const t = await db.$transaction(async (tx) => {
    const template = await tx.scheduleTemplate.create({ data: { name: count ? `${SAMPLE_NEW_HOME_NAME} (${count + 1})` : SAMPLE_NEW_HOME_NAME } });
    const ids = new Map<string, string>();
    for (const [i, s] of SAMPLE_NEW_HOME.entries()) {
      const made = await tx.scheduleTemplateTask.create({
        data: {
          templateId: template.id,
          name: s.name,
          phase: s.phase,
          duration: s.milestone ? 1 : s.days,
          isMilestone: !!s.milestone,
          color: phaseColor(s.phase, s.milestone),
          sortOrder: i,
        },
      });
      ids.set(s.key, made.id);
    }
    for (const s of SAMPLE_NEW_HOME) {
      const links = (s.after ?? []).map((a) => (typeof a === "string" ? { id: ids.get(a)!, lag: 0 } : { id: ids.get(a[0])!, lag: a[1] })).filter((l) => l.id);
      if (links.length) await tx.scheduleTemplateTask.update({ where: { id: ids.get(s.key)! }, data: { links: JSON.stringify(links) } });
    }
    return template;
  });
  revalidatePath(path);
  redirect(`${path}?edit=${t.id}`);
}
