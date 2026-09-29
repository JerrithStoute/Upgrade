"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { boolField, numField, parseDateInput, str, strOrNull } from "@/lib/utils";
import { SELECTION_STATUSES } from "@/lib/constants";

function listPath(projectId: string) {
  return `/projects/${projectId}/selections`;
}
function detailPath(projectId: string, selectionId: string) {
  return `${listPath(projectId)}/${selectionId}`;
}
function revalidate(projectId: string, selectionId?: string) {
  revalidatePath(listPath(projectId));
  revalidatePath(`/projects/${projectId}`);
  if (selectionId) revalidatePath(detailPath(projectId, selectionId));
}

async function loadSelection(projectId: string, id: string) {
  const sel = await db.selection.findFirst({ where: { id, projectId }, include: { options: true } });
  if (!sel) throw new Error("Selection not found");
  return sel;
}

function readSelectionFields(fd: FormData) {
  const title = str(fd, "title");
  if (!title) throw new Error("Title is required");
  return {
    title,
    category: str(fd, "category") || "General",
    location: strOrNull(fd, "location"),
    costCodeId: strOrNull(fd, "costCodeId"),
    allowance: numField(fd, "allowance", 0),
    dueDate: parseDateInput(fd.get("dueDate")),
    description: strOrNull(fd, "description"),
    notes: strOrNull(fd, "notes"),
  };
}

export async function createSelection(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const data = readSelectionFields(fd);
  const sel = await db.selection.create({ data: { ...data, projectId: project.id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "selection.created", description: `Added selection "${sel.title}"` });
  revalidate(project.id);
  redirect(detailPath(project.id, sel.id));
}

export async function updateSelection(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "id"));
  const data = readSelectionFields(fd);
  await db.selection.update({ where: { id: sel.id }, data });
  await logActivity({ projectId: project.id, userId: user.id, type: "selection.updated", description: `Updated selection "${data.title}"` });
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}

export async function deleteSelection(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "id"));
  await db.selection.delete({ where: { id: sel.id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "selection.deleted", description: `Deleted selection "${sel.title}"` });
  revalidate(project.id);
  redirect(listPath(project.id));
}

function readOptionFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Option name is required");
  return {
    name,
    vendor: strOrNull(fd, "vendor"),
    modelNumber: strOrNull(fd, "modelNumber"),
    price: numField(fd, "price", 0),
    description: strOrNull(fd, "description"),
    imageUrl: strOrNull(fd, "imageUrl"),
    isRecommended: boolField(fd, "isRecommended"),
  };
}

export async function addOption(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "selectionId"));
  const data = readOptionFields(fd);
  const sortOrder = sel.options.reduce((m, o) => Math.max(m, o.sortOrder), -1) + 1;
  await db.selectionOption.create({ data: { ...data, selectionId: sel.id, sortOrder } });
  await logActivity({ projectId: project.id, userId: user.id, type: "selection.option_added", description: `Added option "${data.name}" to "${sel.title}"` });
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}

export async function updateOption(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "selectionId"));
  const id = str(fd, "id");
  if (!sel.options.some((o) => o.id === id)) throw new Error("Option not found");
  await db.selectionOption.update({ where: { id }, data: readOptionFields(fd) });
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}

export async function deleteOption(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "selectionId"));
  const id = str(fd, "id");
  if (!sel.options.some((o) => o.id === id)) throw new Error("Option not found");
  await db.selectionOption.delete({ where: { id } });
  if (sel.chosenOptionId === id) {
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: null, status: "PENDING", chosenAt: null, approvedAt: null } });
  }
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}

export async function chooseOption(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "selectionId"));
  const id = str(fd, "id");
  const opt = sel.options.find((o) => o.id === id);
  if (!opt) throw new Error("Option not found");
  await db.selection.update({
    where: { id: sel.id },
    data: { chosenOptionId: opt.id, status: "CHOSEN", chosenAt: new Date(), approvedAt: null },
  });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "selection.chosen",
    description: `Chose "${opt.name}" for "${sel.title}"`,
  });
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}

/** Status transitions: APPROVED (from CHOSEN), ORDERED (from APPROVED), INSTALLED (from ORDERED), PENDING (reset from any). */
export async function setSelectionStatus(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "id"));
  const status = str(fd, "status");
  if (!(SELECTION_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid status");
  const allowed: Record<string, string[]> = { APPROVED: ["CHOSEN"], ORDERED: ["APPROVED"], INSTALLED: ["ORDERED"], PENDING: [...SELECTION_STATUSES], CHOSEN: [] };
  if (!allowed[status]?.includes(sel.status)) throw new Error(`Cannot move from ${sel.status} to ${status}`);
  const data: { status: string; approvedAt?: Date | null; chosenOptionId?: null; chosenAt?: null } = { status };
  if (status === "APPROVED") data.approvedAt = new Date();
  if (status === "PENDING") {
    data.chosenOptionId = null;
    data.chosenAt = null;
    data.approvedAt = null;
  }
  await db.selection.update({ where: { id: sel.id }, data });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: `selection.${status.toLowerCase()}`,
    description: `Selection "${sel.title}" marked ${status.toLowerCase()}`,
  });
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}
