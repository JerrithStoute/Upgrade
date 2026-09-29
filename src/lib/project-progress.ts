import "server-only";
import { db } from "./db";

/** Average percentComplete across tasks (0 when there are none). */
export function avgTaskProgress(tasks: { percentComplete: number }[]) {
  if (tasks.length === 0) return 0;
  return Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / tasks.length);
}

/** Map of projectId -> average schedule progress for the given projects. */
export async function scheduleProgressByProject(projectIds: string[]) {
  const map = new Map<string, number>();
  if (projectIds.length === 0) return map;
  const tasks = await db.scheduleTask.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, percentComplete: true },
  });
  const grouped = new Map<string, { percentComplete: number }[]>();
  for (const t of tasks) {
    const list = grouped.get(t.projectId) ?? [];
    list.push(t);
    grouped.set(t.projectId, list);
  }
  for (const id of projectIds) map.set(id, avgTaskProgress(grouped.get(id) ?? []));
  return map;
}
