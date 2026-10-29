"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/lib/db";
import { getStationUser } from "@/lib/station-auth";

/** A report dealt with (or back to open). Anyone at the Station. */
export async function setReportDone(fd: FormData) {
  if (!(await getStationUser())) return;
  const id = String(fd.get("id") ?? "");
  await systemDb.stationProblem.updateMany({ where: { id }, data: { doneAt: fd.get("done") === "1" ? new Date() : null } });
  revalidatePath("/station/problems");
}

/** An error marked fixed: off the open list until it happens again (then the owner hears about it again). */
export async function setErrorFixed(fd: FormData) {
  if (!(await getStationUser())) return;
  const id = String(fd.get("id") ?? "");
  await systemDb.stationError.updateMany({ where: { id }, data: { fixedAt: fd.get("fixed") === "1" ? new Date() : null } });
  revalidatePath("/station/problems");
}
