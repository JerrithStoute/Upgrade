"use server";

import { systemDb } from "@/lib/db";
import { getStationUser, stationLog } from "@/lib/station-auth";
import { copyJobAcross } from "@/lib/job-copy-across";

export type CopyState = { error?: string; done?: string } | undefined;

/** The Station owner copies one builder's job into another builder's company (job-copy-across.ts). */
export async function copyJobToBuilder(_prev: CopyState, fd: FormData): Promise<CopyState> {
  const me = await getStationUser();
  if (!me || me.role !== "OWNER") return { error: "Only the Station's owner can copy jobs between builders" };
  const [fromCompanyId, projectId] = String(fd.get("job") ?? "").split(":");
  const toCompanyId = String(fd.get("to") ?? "");
  if (!fromCompanyId || !projectId) return { error: "Pick the job to copy" };
  if (!toCompanyId) return { error: "Pick the builder to copy it to" };
  if (fromCompanyId === toCompanyId) return { error: "Pick a different builder to copy it to — that job is already theirs" };
  const [from, to, job] = await Promise.all([
    systemDb.company.findUnique({ where: { id: fromCompanyId }, select: { name: true } }),
    systemDb.company.findUnique({ where: { id: toCompanyId }, select: { name: true } }),
    systemDb.project.findFirst({ where: { id: projectId, companyId: fromCompanyId }, select: { number: true, name: true } }),
  ]);
  if (!from || !to || !job) return { error: "That job or builder isn't there any more — reload the page" };
  try {
    const made = await copyJobAcross({
      fromCompanyId,
      projectId,
      toCompanyId,
      contract: fd.get("contract") === "on",
      changeOrders: fd.get("changeOrders") === "on",
    });
    await stationLog(me.id, "job.copied", `Copied ${from.name}'s #${job.number} ${job.name} to ${to.name} as #${made.number}`, toCompanyId);
    return { done: `Copied to ${to.name} as #${made.number} ${made.name}.` };
  } catch (err) {
    console.error("Copy a job to another builder:", err);
    return { error: err instanceof Error ? err.message : "The copy didn't work" };
  }
}
