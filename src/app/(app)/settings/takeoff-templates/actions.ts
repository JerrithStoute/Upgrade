"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { resolveMaterialItem } from "@/lib/material-items";
import { assemblyFields, conditionFields } from "@/lib/takeoff-forms";
import { str, strOrNull } from "@/lib/utils";

const PATH = "/settings/takeoff-templates";

function detail(templateId: string, hash = "") {
  return `${PATH}/${templateId}${hash}`;
}

async function loadTemplate(id: string) {
  const t = await db.takeoffTemplate.findUnique({ where: { id } });
  if (!t) throw new Error("Template not found");
  return t;
}

async function loadTemplateCondition(templateId: string, id: string) {
  const c = await db.takeoffTemplateCondition.findFirst({ where: { id, templateId } });
  if (!c) throw new Error("Takeoff not found");
  return c;
}

export async function createTakeoffTemplate(fd: FormData) {
  const admin = await requireAdmin();
  const name = str(fd, "name");
  if (!name) throw new Error("Template name is required");
  const t = await db.takeoffTemplate.create({ data: { name, description: strOrNull(fd, "description") } });
  await logActivity({ userId: admin.id, type: "takeoff_template.created", description: `Created takeoff template "${name}"` });
  revalidatePath(PATH);
  redirect(detail(t.id));
}

export async function updateTakeoffTemplate(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "templateId");
  await loadTemplate(id);
  const name = str(fd, "name");
  if (!name) throw new Error("Template name is required");
  await db.takeoffTemplate.update({ where: { id }, data: { name, description: strOrNull(fd, "description") } });
  revalidatePath(PATH);
  redirect(detail(id));
}

/** Jobs that used the template keep their conditions. */
export async function deleteTakeoffTemplate(fd: FormData) {
  const admin = await requireAdmin();
  const t = await loadTemplate(str(fd, "templateId"));
  await db.takeoffTemplate.delete({ where: { id: t.id } });
  await logActivity({ userId: admin.id, type: "takeoff_template.deleted", description: `Deleted takeoff template "${t.name}"` });
  revalidatePath(PATH);
  redirect(PATH);
}

// --- Conditions ------------------------------------------------------------------

export async function createTemplateCondition(fd: FormData) {
  await requireAdmin();
  const templateId = str(fd, "templateId");
  await loadTemplate(templateId);
  const data = await conditionFields(fd);
  const last = await db.takeoffTemplateCondition.findFirst({ where: { templateId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const c = await db.takeoffTemplateCondition.create({ data: { ...data, templateId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidatePath(detail(templateId));
  redirect(detail(templateId, `#condition-${c.id}`));
}

export async function updateTemplateCondition(fd: FormData) {
  await requireAdmin();
  const templateId = str(fd, "templateId");
  const existing = await loadTemplateCondition(templateId, str(fd, "id"));
  const data = await conditionFields(fd);
  await db.$transaction([
    db.takeoffTemplateCondition.update({ where: { id: existing.id }, data }),
    ...(data.type !== existing.type ? [db.takeoffTemplateItem.updateMany({ where: { conditionId: existing.id }, data: { metric: data.metric } })] : []),
  ]);
  revalidatePath(detail(templateId));
  redirect(detail(templateId, `#condition-${existing.id}`));
}

export async function deleteTemplateCondition(fd: FormData) {
  await requireAdmin();
  const templateId = str(fd, "templateId");
  const c = await loadTemplateCondition(templateId, str(fd, "id"));
  await db.takeoffTemplateCondition.delete({ where: { id: c.id } });
  revalidatePath(detail(templateId));
  redirect(detail(templateId));
}

// --- Assembly items ----------------------------------------------------------------

async function itemData(fd: FormData, conditionType: string) {
  const data = await assemblyFields(fd, conditionType);
  // Same as on a job: link to the Item List by name, adding new names to it.
  const { id, name } = await resolveMaterialItem(db, data);
  return { ...data, description: name, materialItemId: id };
}

export async function createTemplateItem(fd: FormData) {
  await requireAdmin();
  const templateId = str(fd, "templateId");
  const c = await loadTemplateCondition(templateId, str(fd, "conditionId"));
  const data = await itemData(fd, c.type);
  const last = await db.takeoffTemplateItem.findFirst({ where: { conditionId: c.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.takeoffTemplateItem.create({ data: { ...data, conditionId: c.id, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidatePath(detail(templateId));
  revalidatePath("/settings/items");
  redirect(detail(templateId, `#condition-${c.id}`));
}

async function loadTemplateItem(templateId: string, id: string) {
  const item = await db.takeoffTemplateItem.findFirst({ where: { id, condition: { templateId } }, include: { condition: true } });
  if (!item) throw new Error("Item not found");
  return item;
}

export async function updateTemplateItem(fd: FormData) {
  await requireAdmin();
  const templateId = str(fd, "templateId");
  const item = await loadTemplateItem(templateId, str(fd, "id"));
  await db.takeoffTemplateItem.update({ where: { id: item.id }, data: await itemData(fd, item.condition.type) });
  revalidatePath(detail(templateId));
  revalidatePath("/settings/items");
  redirect(detail(templateId, `#condition-${item.conditionId}`));
}

export async function deleteTemplateItem(fd: FormData) {
  await requireAdmin();
  const templateId = str(fd, "templateId");
  const item = await loadTemplateItem(templateId, str(fd, "id"));
  await db.takeoffTemplateItem.delete({ where: { id: item.id } });
  revalidatePath(detail(templateId));
  redirect(detail(templateId, `#condition-${item.conditionId}`));
}
