"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { saveUpload, deleteUpload } from "@/lib/uploads";
import { boolField, str } from "@/lib/utils";
import { FILE_FOLDERS } from "@/lib/constants";

function filesPath(projectId: string) {
  return `/projects/${projectId}/files`;
}
function revalidate(projectId: string) {
  revalidatePath(filesPath(projectId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/daily-logs`);
}
function returnTo(fd: FormData, projectId: string) {
  const r = str(fd, "returnTo");
  return r.startsWith(filesPath(projectId)) ? r : filesPath(projectId);
}

export async function uploadFiles(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const folderRaw = str(fd, "folder");
  const folder = (FILE_FOLDERS as readonly string[]).includes(folderRaw) ? folderRaw : "Documents";
  const clientVisible = boolField(fd, "clientVisible");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(returnTo(fd, project.id));
  for (const file of files) {
    const meta = await saveUpload(file, project.id);
    await db.fileAsset.create({ data: { ...meta, projectId: project.id, uploadedById: user.id, folder, clientVisible } });
  }
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "file.uploaded",
    description: `Uploaded ${files.length} file${files.length === 1 ? "" : "s"} to ${folder}${files.length === 1 ? ` (${files[0].name})` : ""}`,
  });
  revalidate(project.id);
  redirect(returnTo(fd, project.id));
}

export async function toggleFileVisibility(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const file = await db.fileAsset.findFirst({ where: { id, projectId: project.id } });
  if (!file) throw new Error("File not found");
  await db.fileAsset.update({ where: { id }, data: { clientVisible: !file.clientVisible } });
  revalidate(project.id);
  redirect(returnTo(fd, project.id));
}

export async function deleteFile(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const id = str(fd, "id");
  const file = await db.fileAsset.findFirst({ where: { id, projectId: project.id } });
  if (!file) throw new Error("File not found");
  await deleteUpload(file.storagePath);
  await db.fileAsset.delete({ where: { id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "file.deleted", description: `Deleted file "${file.name}"` });
  revalidate(project.id);
  redirect(returnTo(fd, project.id));
}
