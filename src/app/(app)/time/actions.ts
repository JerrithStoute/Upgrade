"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { friendly } from "@/lib/friendly-action";
import { canManageTime, clockIn, clockOut, currentRate, postLabor } from "@/lib/time-clock";
import { weekKey } from "@/lib/time-math";
import { intField, numField, str, strOrNull } from "@/lib/utils";

function refresh() {
  revalidatePath("/time");
  revalidatePath("/time/sheets");
  revalidatePath("/dashboard");
}

async function checkJob(projectId: string) {
  if (!projectId) throw new Error("Pick the job you're working on first");
  const project = await db.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (!project) throw new Error("That job isn't there any more — pick another");
  if (project.status === "CANCELLED") throw new Error("That job is cancelled — pick another");
}

async function checkCode(costCodeId: string | null) {
  if (costCodeId && !(await db.costCode.findUnique({ where: { id: costCodeId }, select: { id: true } }))) throw new Error("That cost code isn't there any more — pick another");
}

/** Clock in — or, when already on the clock, switch to this job / cost code. */
export const clockInAction = friendly(async function clockInAction(fd: FormData) {
  const user = await requireStaff();
  const projectId = str(fd, "projectId");
  const costCodeId = strOrNull(fd, "costCodeId");
  await checkJob(projectId);
  await checkCode(costCodeId);
  await clockIn(user.id, projectId, costCodeId, strOrNull(fd, "notes"));
  refresh();
});

export const clockOutAction = friendly(async function clockOutAction() {
  const user = await requireStaff();
  await clockOut(user.id);
  refresh();
});

// --- Timesheets (people who manage time) ------------------------------------------

async function requireTimeManager() {
  const user = await requireStaff();
  if (!canManageTime(user)) throw new Error("Only admins (or people allowed to manage time) can change other people's time");
  return user;
}

/** "2026-10-05" + "07:30" → that moment, local time. */
function at(date: string, time: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})/);
  if (!d || !t) return null;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
}

/** Add or fix a stretch of time (Timesheets). An out time before the in time is the next morning. */
export const saveTimeEntry = friendly(async function saveTimeEntry(fd: FormData) {
  const manager = await requireTimeManager();
  const id = str(fd, "id");
  const userId = str(fd, "userId");
  const projectId = str(fd, "projectId");
  const costCodeId = strOrNull(fd, "costCodeId");
  await checkJob(projectId);
  await checkCode(costCodeId);
  const date = str(fd, "date");
  const inAt = at(date, str(fd, "in"));
  if (!inAt) throw new Error("Put in the day and the time they started");
  const outText = str(fd, "out");
  let outAt = outText ? at(date, outText) : null;
  if (outText && !outAt) throw new Error("That end time doesn't look right");
  if (outAt && outAt <= inAt) outAt = new Date(outAt.getTime() + 24 * 3_600_000); // worked past midnight
  if (outAt && outAt.getTime() - inAt.getTime() > 24 * 3_600_000) throw new Error("A stretch can't be longer than a day — split it into two");
  const breakMinutes = Math.max(0, intField(fd, "breakMinutes", 0));
  if (outAt && breakMinutes >= (outAt.getTime() - inAt.getTime()) / 60_000) throw new Error("The break is as long as the whole stretch");
  const notes = strOrNull(fd, "notes");

  if (id) {
    const had = await db.timeEntry.findUnique({ where: { id } });
    if (!had) throw new Error("That time isn't there any more");
    if (!outAt && had.clockOut) throw new Error("Put in the time they stopped");
    await db.timeEntry.update({ where: { id }, data: { projectId, costCodeId, clockIn: inAt, clockOut: outAt, breakMinutes, notes, editedById: manager.id } });
    await postLabor([had.clockIn, inAt]);
  } else {
    if (!userId) throw new Error("Pick who the time is for");
    if (!outAt) throw new Error("Put in the time they stopped");
    const person = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!person) throw new Error("That person isn't there any more");
    await db.timeEntry.create({
      data: { userId, projectId, costCodeId, clockIn: inAt, clockOut: outAt, breakMinutes, notes, rate: await currentRate(userId), editedById: manager.id },
    });
    await postLabor([inAt]);
  }
  refresh();
  redirect(`/time/sheets?week=${weekKey(inAt)}`);
});

export const deleteTimeEntry = friendly(async function deleteTimeEntry(fd: FormData) {
  await requireTimeManager();
  const had = await db.timeEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!had) return;
  await db.timeEntry.delete({ where: { id: had.id } });
  await postLabor([had.clockIn]);
  refresh();
  redirect(`/time/sheets?week=${weekKey(had.clockIn)}`);
});

/** Clock someone out who forgot (at the time given, on the day they clocked in). */
export const clockOutFor = friendly(async function clockOutFor(fd: FormData) {
  await requireTimeManager();
  const had = await db.timeEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!had || had.clockOut) return;
  const day = `${had.clockIn.getFullYear()}-${String(had.clockIn.getMonth() + 1).padStart(2, "0")}-${String(had.clockIn.getDate()).padStart(2, "0")}`;
  let outAt = at(day, str(fd, "out"));
  if (!outAt) throw new Error("Put in the time they stopped");
  if (outAt <= had.clockIn) outAt = new Date(outAt.getTime() + 24 * 3_600_000);
  await db.timeEntry.update({ where: { id: had.id }, data: { clockOut: outAt } });
  await postLabor([had.clockIn]);
  refresh();
});

/** The labor burden (payroll taxes, workers' comp, insurance) — Timesheets settings. */
export const saveLaborBurden = friendly(async function saveLaborBurden(fd: FormData) {
  await requireTimeManager();
  const pct = numField(fd, "laborBurden", 0);
  if (pct < 0 || pct > 200) throw new Error("The burden is a percent of pay — usually between 10 and 40");
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("Save the company profile first (Settings)");
  await db.company.update({ where: { id: company.id }, data: { laborBurden: pct } });
  refresh();
});
