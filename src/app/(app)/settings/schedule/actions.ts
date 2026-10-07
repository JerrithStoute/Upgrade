"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/utils";

function done() {
  revalidatePath("/settings/schedule");
  revalidatePath("/schedule", "layout");
  revalidatePath("/projects", "layout");
}

/** The days you work. Schedules count them from now on (dates already set stay). */
export async function saveWorkDays(fd: FormData) {
  await requireAdmin();
  const days = fd
    .getAll("day")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!days.length) throw new Error("Pick at least one workday");
  const company = await db.company.findFirst({ select: { id: true } });
  if (company) await db.company.update({ where: { id: company.id }, data: { workDays: Array.from(new Set(days)).sort().join(",") } });
  done();
}

export async function addDelayReason(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) return;
  const last = await db.delayReason.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.delayReason.create({ data: { name, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  done();
}

export async function renameDelayReason(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (name) await db.delayReason.update({ where: { id: str(fd, "id") }, data: { name } });
  done();
}

/** Delays already logged keep their reason's name. */
export async function deleteDelayReason(fd: FormData) {
  await requireAdmin();
  await db.delayReason.delete({ where: { id: str(fd, "id") } }).catch(() => null);
  done();
}
