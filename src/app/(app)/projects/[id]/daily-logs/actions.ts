"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { saveUpload, deleteUpload } from "@/lib/uploads";
import { boolField, intField, numField, parseDateInput, str, strOrNull, fmtDate } from "@/lib/utils";

function listPath(projectId: string) {
  return `/projects/${projectId}/daily-logs`;
}
function revalidate(projectId: string, logId?: string) {
  revalidatePath(listPath(projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/files`);
  if (logId) revalidatePath(`${listPath(projectId)}/${logId}/edit`);
}

function readLogFields(fd: FormData) {
  const date = parseDateInput(fd.get("date"));
  if (!date) throw new Error("Date is required");
  const tempHigh = str(fd, "tempHigh") ? intField(fd, "tempHigh") : null;
  const tempLow = str(fd, "tempLow") ? intField(fd, "tempLow") : null;
  return {
    date,
    weather: strOrNull(fd, "weather"),
    tempHigh,
    tempLow,
    crewCount: Math.max(0, intField(fd, "crewCount", 0)),
    hoursWorked: Math.max(0, numField(fd, "hoursWorked", 0)),
    workCompleted: strOrNull(fd, "workCompleted"),
    issues: strOrNull(fd, "issues"),
    notes: strOrNull(fd, "notes"),
    clientVisible: boolField(fd, "clientVisible"),
  };
}

function photoFiles(fd: FormData) {
  return fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
}

async function savePhotos(files: File[], projectId: string, dailyLogId: string, userId: string, clientVisible: boolean) {
  for (const file of files) {
    const meta = await saveUpload(file, projectId);
    await db.fileAsset.create({ data: { ...meta, projectId, dailyLogId, uploadedById: userId, folder: "Photos", clientVisible } });
  }
}

export async function createLog(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const data = readLogFields(fd);
  const log = await db.dailyLog.create({ data: { ...data, projectId: project.id, authorId: user.id } });
  const photos = photoFiles(fd);
  await savePhotos(photos, project.id, log.id, user.id, data.clientVisible);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "daily_log.created",
    description: `Daily log for ${fmtDate(data.date)}${photos.length ? ` with ${photos.length} photo${photos.length === 1 ? "" : "s"}` : ""}`,
  });
  revalidate(project.id);
  redirect(listPath(project.id));
}

export async function updateLog(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const log = await db.dailyLog.findFirst({ where: { id, projectId: project.id } });
  if (!log) throw new Error("Log not found");
  const data = readLogFields(fd);
  await db.dailyLog.update({ where: { id }, data });
  const photos = photoFiles(fd);
  await savePhotos(photos, project.id, id, user.id, data.clientVisible);
  await logActivity({ projectId: project.id, userId: user.id, type: "daily_log.updated", description: `Updated daily log for ${fmtDate(data.date)}` });
  revalidate(project.id, id);
  redirect(listPath(project.id));
}

export async function deleteLog(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const log = await db.dailyLog.findFirst({ where: { id, projectId: project.id }, include: { files: true } });
  if (!log) throw new Error("Log not found");
  for (const f of log.files) await deleteUpload(f.storagePath);
  await db.fileAsset.deleteMany({ where: { dailyLogId: id } });
  await db.dailyLog.delete({ where: { id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "daily_log.deleted", description: `Deleted daily log for ${fmtDate(log.date)}` });
  revalidate(project.id);
  redirect(listPath(project.id));
}

export async function deleteLogPhoto(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const logId = str(fd, "logId");
  const fileId = str(fd, "id");
  const file = await db.fileAsset.findFirst({ where: { id: fileId, projectId: project.id, dailyLogId: logId } });
  if (!file) throw new Error("Photo not found");
  await deleteUpload(file.storagePath);
  await db.fileAsset.delete({ where: { id: fileId } });
  revalidate(project.id, logId);
  redirect(`${listPath(project.id)}/${logId}/edit`);
}
