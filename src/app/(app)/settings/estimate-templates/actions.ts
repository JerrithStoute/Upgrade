"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { numField, str, strOrNull } from "@/lib/utils";
import { allowanceFields, allowanceNameFromLine, copyIntoTemplate, lineFields, loadTemplate, nextSortOrder, starterCostCodes } from "@/lib/estimate-lines";

const LIST = "/settings/estimate-templates";

function templatePath(id: string) {
  return `${LIST}/${id}`;
}

function revalidate(id?: string) {
  revalidatePath(LIST);
  if (id) revalidatePath(templatePath(id));
  // Template pickers live on the new-project form and every estimate page.
  revalidatePath("/projects", "layout");
}

// --- Templates ----------------------------------------------------------------

export async function createTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const name = str(formData, "name");
  if (!name) throw new Error("Template name is required");
  const company = await db.company.findFirst();
  const template = await db.estimateTemplate.create({
    data: { name, description: strOrNull(formData, "description"), defaultMarkup: company?.defaultMarkup ?? 20 },
  });
  await logActivity({ userId: admin.id, type: "estimate_template.created", description: `Created estimate template "${name}"` });
  revalidate();
  redirect(templatePath(template.id));
}

export async function updateTemplateDetails(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "templateId");
  await loadTemplate(id);
  const data: { name?: string; description?: string | null; notes?: string | null; terms?: string | null; defaultMarkup?: number } = {};
  if (formData.has("name")) data.name = str(formData, "name") || "Untitled template";
  if (formData.has("description")) data.description = strOrNull(formData, "description");
  if (formData.has("notes")) data.notes = strOrNull(formData, "notes");
  if (formData.has("terms")) data.terms = strOrNull(formData, "terms");
  if (formData.has("defaultMarkup")) data.defaultMarkup = numField(formData, "defaultMarkup", 20);
  await db.estimateTemplate.update({ where: { id }, data });
  revalidate(id);
  redirect(templatePath(id));
}

export async function duplicateTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const source = await loadTemplate(str(formData, "templateId"));
  const copy = await db.$transaction(async (tx) => {
    const created = await tx.estimateTemplate.create({
      data: {
        name: `${source.name} (copy)`,
        description: source.description,
        notes: source.notes,
        terms: source.terms,
        defaultMarkup: source.defaultMarkup,
      },
    });
    await copyIntoTemplate(tx, created.id, source);
    return created;
  });
  await logActivity({ userId: admin.id, type: "estimate_template.created", description: `Duplicated estimate template "${source.name}"` });
  revalidate();
  redirect(templatePath(copy.id));
}

export async function deleteTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const template = await loadTemplate(str(formData, "templateId"));
  await db.estimateTemplate.delete({ where: { id: template.id } });
  await logActivity({ userId: admin.id, type: "estimate_template.deleted", description: `Deleted estimate template "${template.name}"` });
  revalidate();
  redirect(LIST);
}

// --- Template lines -----------------------------------------------------------

export async function createTemplateItem(formData: FormData) {
  await requireAdmin();
  const templateId = str(formData, "templateId");
  const template = await loadTemplate(templateId);
  const data = lineFields(formData, template.allowances);
  await db.estimateTemplateItem.create({ data: { templateId, sortOrder: nextSortOrder(template), ...data } });
  revalidate(templateId);
  redirect(`${templatePath(templateId)}${data.allowanceId ? `#allowance-${data.allowanceId}` : ""}`);
}

export async function updateTemplateItem(formData: FormData) {
  await requireAdmin();
  const templateId = str(formData, "templateId");
  const id = str(formData, "id");
  const template = await loadTemplate(templateId);
  if (!template.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.estimateTemplateItem.update({ where: { id }, data: lineFields(formData, template.allowances) });
  revalidate(templateId);
  redirect(templatePath(templateId));
}

export async function deleteTemplateItem(formData: FormData) {
  await requireAdmin();
  const templateId = str(formData, "templateId");
  const id = str(formData, "id");
  const template = await loadTemplate(templateId);
  if (!template.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.estimateTemplateItem.delete({ where: { id } });
  revalidate(templateId);
  redirect(templatePath(templateId));
}

// --- Template allowances ------------------------------------------------------

export async function createTemplateAllowance(formData: FormData) {
  await requireAdmin();
  const templateId = str(formData, "templateId");
  const template = await loadTemplate(templateId);
  const fields = allowanceFields(formData);
  const costCodes = await starterCostCodes(formData);
  const sortOrder = nextSortOrder(template);
  const allowance = await db.estimateTemplateAllowance.create({
    data: {
      templateId,
      sortOrder,
      ...fields,
      items: {
        create: costCodes.map((c, i) => ({
          templateId,
          costCodeId: c.id,
          group: fields.group,
          description: c.name,
          quantity: 1,
          unit: "ls",
          unitCost: 0,
          markupPct: template.defaultMarkup,
          isAllowance: true,
          sortOrder: sortOrder + 1 + i,
        })),
      },
    },
  });
  revalidate(templateId);
  redirect(`${templatePath(templateId)}${costCodes.length ? "" : `?addTo=${allowance.id}`}#allowance-${allowance.id}`);
}

export async function updateTemplateAllowance(formData: FormData) {
  await requireAdmin();
  const templateId = str(formData, "templateId");
  const id = str(formData, "id");
  const template = await loadTemplate(templateId);
  if (!template.allowances.some((a) => a.id === id)) throw new Error("Allowance not found");
  const fields = allowanceFields(formData);
  await db.$transaction([
    db.estimateTemplateAllowance.update({ where: { id }, data: fields }),
    db.estimateTemplateItem.updateMany({ where: { allowanceId: id }, data: { group: fields.group } }),
  ]);
  revalidate(templateId);
  redirect(`${templatePath(templateId)}#allowance-${id}`);
}

/** Removes the allowance wrapper; its lines stay on the template as regular lines. */
export async function deleteTemplateAllowance(formData: FormData) {
  await requireAdmin();
  const templateId = str(formData, "templateId");
  const id = str(formData, "id");
  const template = await loadTemplate(templateId);
  if (!template.allowances.some((a) => a.id === id)) throw new Error("Allowance not found");
  await db.$transaction([
    db.estimateTemplateItem.updateMany({ where: { allowanceId: id }, data: { allowanceId: null, isAllowance: false } }),
    db.estimateTemplateAllowance.delete({ where: { id } }),
  ]);
  revalidate(templateId);
  redirect(templatePath(templateId));
}

export async function convertTemplateItemToAllowance(formData: FormData) {
  await requireAdmin();
  const templateId = str(formData, "templateId");
  const id = str(formData, "id");
  const template = await loadTemplate(templateId);
  const item = template.items.find((i) => i.id === id);
  if (!item) throw new Error("Item not found");
  if (item.allowanceId) throw new Error("Item is already part of an allowance");
  const allowance = await db.estimateTemplateAllowance.create({
    data: { templateId, name: allowanceNameFromLine(item.description), group: item.group, sortOrder: item.sortOrder },
  });
  await db.estimateTemplateItem.update({ where: { id }, data: { allowanceId: allowance.id, isAllowance: true } });
  revalidate(templateId);
  redirect(`${templatePath(templateId)}?addTo=${allowance.id}#allowance-${allowance.id}`);
}
