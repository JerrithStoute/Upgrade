import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "./db";

const dayRange = (d: Date) => ({ gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()), lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) });

/**
 * Adds a line to the job's daily log for that day — to "Work completed" or "Issues" —
 * starting the day's log when there isn't one. A line meant for the client goes in the
 * day's client-visible log; one that isn't (a delay whose reason you keep to yourself)
 * goes in an internal log for the day, so it's never shown. The same line isn't added twice.
 */
export async function addToDailyLog(opts: { projectId: string; date: Date; authorId: string; field: "workCompleted" | "issues"; line: string; clientVisible: boolean }) {
  const { projectId, date, authorId, field, line, clientVisible } = opts;
  const log =
    (await db.dailyLog.findFirst({ where: { projectId, date: dayRange(date), clientVisible }, orderBy: { createdAt: "asc" } })) ??
    (await db.dailyLog.create({ data: { projectId, date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12), authorId, clientVisible } }));
  const have = log[field] ?? "";
  if (have.split("\n").some((l) => l.trim() === line.trim())) return log;
  await db.dailyLog.update({ where: { id: log.id }, data: { [field]: have ? `${have}\n${line}` : line } });
  revalidatePath(`/projects/${projectId}/daily-logs`);
  revalidatePath(`/projects/${projectId}`);
  return log;
}
