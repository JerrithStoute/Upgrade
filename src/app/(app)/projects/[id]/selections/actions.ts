"use server";

import { syncSelectionChangeOrder } from "@/lib/billing-flow";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { boolField, numField, parseDateInput, str, strOrNull } from "@/lib/utils";
import { SELECTION_STATUSES } from "@/lib/constants";
import { tiedDeadline } from "@/lib/deadlines";
import { addComment, noteChange, saveChoicePicture, saveSelectionFiles, saveChoiceFiles } from "@/lib/selection-activity";
import { deleteUpload } from "@/lib/uploads";

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
  // A new allowance changes the overage or credit on a draft change order.
  await syncSelectionChangeOrder(sel.id, user);
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
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "selectionId"));
  const id = str(fd, "id");
  if (!sel.options.some((o) => o.id === id)) throw new Error("Option not found");
  await db.selectionOption.update({ where: { id }, data: readOptionFields(fd) });
  if (sel.chosenOptionId === id) await syncSelectionChangeOrder(sel.id, user);
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}

export async function deleteOption(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const sel = await loadSelection(project.id, str(fd, "selectionId"));
  const id = str(fd, "id");
  if (!sel.options.some((o) => o.id === id)) throw new Error("Option not found");
  await db.selectionOption.delete({ where: { id } });
  if (sel.chosenOptionId === id) {
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: null, status: "PENDING", chosenAt: null, approvedAt: null } });
    await syncSelectionChangeOrder(sel.id, user);
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
  await syncSelectionChangeOrder(sel.id, user);
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
  if (status === "PENDING") await syncSelectionChangeOrder(sel.id, user);
  revalidate(project.id, sel.id);
  redirect(detailPath(project.id, sel.id));
}

// --- The selections board (selections that come from the estimate) -----------------

type Result = { ok: true } | { ok: false; error: string };

const choiceInput = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "Give the choice a name").max(500),
  description: z.string().trim().max(5000),
  price: z.number().finite().min(-1e9).max(1e9),
  cost: z.number().finite().min(-1e9).max(1e9).nullable(),
  vendor: z.string().trim().max(200),
  modelNumber: z.string().trim().max(200),
});

async function boardSelection(projectId: string, selectionId: string) {
  const sel = await db.selection.findFirst({ where: { id: selectionId, projectId }, include: { options: true } });
  if (!sel) throw new Error("Selection not found");
  return sel;
}

/** Adds a choice, or saves changes to one. */
export async function saveChoice(projectId: string, selectionId: string, raw: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireStaff();
  const parsed = choiceInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the choice's fields" };
  const sel = await boardSelection(projectId, selectionId);
  const { id, ...c } = parsed.data;
  const data = { name: c.name, description: c.description || null, price: c.price, cost: c.cost, vendor: c.vendor || null, modelNumber: c.modelNumber || null };
  if (id) {
    if (!sel.options.some((o) => o.id === id)) return { ok: false, error: "Choice not found" };
    await db.selectionOption.update({ where: { id }, data });
    await noteChange(sel.id, user, `Changed choice "${c.name}"`);
    revalidate(projectId, sel.id);
    return { ok: true, id };
  } else {
    const created = await db.selectionOption.create({ data: { ...data, selectionId: sel.id, sortOrder: Math.max(-1, ...sel.options.map((o) => o.sortOrder)) + 1 } });
    await logActivity({ projectId, userId: user.id, type: "selection.option_added", description: `Added choice "${c.name}" to "${sel.title}"` });
    await noteChange(sel.id, user, `Added choice "${c.name}" (${c.price.toLocaleString("en-US", { style: "currency", currency: "USD" })})`);
    revalidate(projectId, sel.id);
    return { ok: true, id: created.id };
  }
}

/** Files dropped on a choice (form field "files"): pictures become its picture, PDFs and the rest its documents. */
export async function addChoiceFiles(projectId: string, selectionId: string, optionId: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  const sel = await boardSelection(projectId, selectionId);
  const opt = sel.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: "Choice not found" };
  try {
    const names = await saveChoiceFiles(
      projectId,
      opt.id,
      fd.getAll("files").filter((f): f is File => f instanceof File),
      user.id,
    );
    if (names.length) await noteChange(sel.id, user, `Added ${names.length === 1 ? `"${names[0]}"` : `${names.length} files`} to "${opt.name}"`);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidate(projectId, sel.id);
  revalidatePath(`/projects/${projectId}/files`);
  return { ok: true };
}

export async function removeChoice(projectId: string, selectionId: string, choiceId: string): Promise<Result> {
  const user = await requireStaff();
  const sel = await boardSelection(projectId, selectionId);
  if (!sel.options.some((o) => o.id === choiceId)) return { ok: false, error: "Choice not found" };
  await db.$transaction([
    ...(sel.chosenOptionId === choiceId
      ? [db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: null, status: "PENDING", chosenAt: null, approvedAt: null } })]
      : []),
    db.selectionOption.delete({ where: { id: choiceId } }),
  ]);
  await noteChange(sel.id, user, `Removed choice "${sel.options.find((o) => o.id === choiceId)?.name ?? ""}"`);
  if (sel.chosenOptionId === choiceId) await syncSelectionChangeOrder(sel.id, user);
  revalidate(projectId, sel.id);
  return { ok: true };
}

/** Makes the choice (a choice's id), "DECLINED" ("I do not want this selection"), or null to undo. */
export async function makeChoice(projectId: string, selectionId: string, choice: string | null): Promise<Result> {
  const user = await requireStaff();
  const sel = await boardSelection(projectId, selectionId);
  if (choice === null) {
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: null, status: "PENDING", chosenAt: null, approvedAt: null } });
    await logActivity({ projectId, userId: user.id, type: "selection.reset", description: `Choice cleared for "${sel.title}"` });
    await noteChange(sel.id, user, "Cleared the choice");
  } else if (choice === "DECLINED") {
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: null, status: "DECLINED", chosenAt: new Date(), approvedAt: null } });
    await logActivity({ projectId, userId: user.id, type: "selection.declined", description: `"${sel.title}": I do not want this selection` });
    await noteChange(sel.id, user, "Chose: I do not want this selection");
  } else {
    const opt = sel.options.find((o) => o.id === choice);
    if (!opt) return { ok: false, error: "Choice not found" };
    await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: opt.id, status: "CHOSEN", chosenAt: new Date(), approvedAt: null } });
    await logActivity({ projectId, userId: user.id, type: "selection.chosen", description: `Chose "${opt.name}" for "${sel.title}"` });
    await noteChange(sel.id, user, `Chose "${opt.name}"`);
  }
  // Over or under the allowance: onto a draft change order (or off it, when cleared).
  await syncSelectionChangeOrder(sel.id, user);
  revalidate(projectId, sel.id);
  revalidatePath(`/projects/${projectId}/estimate`, "layout");
  return { ok: true };
}

/** Profit in (true), out (false), or the company default (null) for one allowance. */
export async function setAllowanceProfit(projectId: string, specId: string, value: boolean | null): Promise<Result> {
  const user = await requireStaff();
  const spec = await db.estimateSpec.findFirst({ where: { id: specId, estimate: { projectId } }, select: { id: true, selectionId: true } });
  if (!spec) return { ok: false, error: "Allowance not found" };
  await db.estimateSpec.update({ where: { id: spec.id }, data: { allowanceProfit: value } });
  if (spec.selectionId) await noteChange(spec.selectionId, user, `Allowance set to ${value === null ? "the company default" : value ? "profit in" : "profit out (at cost)"}`);
  revalidate(projectId);
  revalidatePath(`/projects/${projectId}/estimate`, "layout");
  return { ok: true };
}

const deadlineInput = z
  .array(
    z.object({
      selectionId: z.string(),
      mode: z.enum(["none", "date", "task"]),
      date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
      taskId: z.string().nullable(),
      leadDays: z.number().int().min(0).max(365),
    }),
  )
  .max(500);

/** "Requested by" for one or many selections: no deadline, a date, or a schedule item (n days before it starts). */
export async function setDeadlines(projectId: string, raw: unknown): Promise<Result> {
  const user = await requireStaff();
  const parsed = deadlineInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the deadlines" };
  const [sels, tasks] = await Promise.all([
    db.selection.findMany({ where: { projectId, id: { in: parsed.data.map((r) => r.selectionId) } }, select: { id: true } }),
    db.scheduleTask.findMany({ where: { projectId }, select: { id: true, startDate: true } }),
  ]);
  const ok = new Set(sels.map((s) => s.id));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  for (const r of parsed.data) {
    if (!ok.has(r.selectionId)) continue;
    const task = r.mode === "task" && r.taskId ? taskById.get(r.taskId) : undefined;
    if (r.mode === "task" && !task) return { ok: false, error: "Pick a schedule item" };
    if (r.mode === "date" && !r.date) return { ok: false, error: "Pick a date" };
    const data =
      r.mode === "task" && task
        ? { scheduleTaskId: task.id, leadDays: r.leadDays, dueDate: tiedDeadline(task.startDate, r.leadDays) }
        : r.mode === "date"
          ? { scheduleTaskId: null, leadDays: 0, dueDate: new Date(`${r.date}T12:00:00`) }
          : { scheduleTaskId: null, leadDays: 0, dueDate: null };
    await db.selection.update({ where: { id: r.selectionId }, data });
    await noteChange(
      r.selectionId,
      user,
      data.dueDate
        ? `Deadline set to ${data.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}${task ? ` (${r.leadDays} days before a schedule item)` : ""}`
        : "Deadline removed",
    );
  }
  await logActivity({ projectId, userId: user.id, type: "selection.deadlines", description: `Selection deadlines changed (${parsed.data.length})` });
  revalidate(projectId);
  return { ok: true };
}

// --- Comments, files and pictures -------------------------------------------------

export async function commentOnSelection(projectId: string, selectionId: string, body: string, internal: boolean): Promise<Result> {
  const user = await requireStaff();
  const text = body.trim().slice(0, 5000);
  if (!text) return { ok: false, error: "Write a comment first" };
  const sel = await boardSelection(projectId, selectionId);
  await addComment(sel.id, user, text, internal);
  revalidate(projectId, sel.id);
  return { ok: true };
}

/** Adds files (form field "files") to a selection. */
export async function addSelectionFiles(projectId: string, selectionId: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  const sel = await boardSelection(projectId, selectionId);
  try {
    const names = await saveSelectionFiles(
      projectId,
      sel.id,
      fd.getAll("files").filter((f): f is File => f instanceof File),
      user.id,
    );
    if (names.length) await noteChange(sel.id, user, `Added ${names.length === 1 ? `file "${names[0]}"` : `${names.length} files`}`);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidate(projectId, sel.id);
  revalidatePath(`/projects/${projectId}/files`);
  return { ok: true };
}

export async function removeSelectionFile(projectId: string, fileId: string): Promise<Result> {
  const user = await requireStaff();
  const file = await db.fileAsset.findFirst({ where: { id: fileId, projectId, OR: [{ selectionId: { not: null } }, { selectionOptionId: { not: null } }] } });
  if (!file) return { ok: false, error: "File not found" };
  await db.fileAsset.delete({ where: { id: file.id } });
  await deleteUpload(file.storagePath);
  if (file.selectionId) await noteChange(file.selectionId, user, `Removed file "${file.name}"`);
  revalidate(projectId);
  revalidatePath(`/projects/${projectId}/files`);
  return { ok: true };
}

/** A choice's picture (form field "file"). */
export async function setChoicePicture(projectId: string, selectionId: string, optionId: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  const sel = await boardSelection(projectId, selectionId);
  const opt = sel.options.find((o) => o.id === optionId);
  const file = fd.get("file");
  if (!opt || !(file instanceof File) || !file.size) return { ok: false, error: "Pick a picture" };
  try {
    await saveChoicePicture(projectId, opt.id, file, user.id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await noteChange(sel.id, user, `Added a picture to "${opt.name}"`);
  revalidate(projectId, sel.id);
  return { ok: true };
}
