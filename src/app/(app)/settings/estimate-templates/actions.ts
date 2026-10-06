"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { numField, str, strOrNull } from "@/lib/utils";
import { copyIntoTemplate, loadTemplate, saveTemplateSheet } from "@/lib/estimate-lines";
import { saveSheetInput } from "@/lib/estimate-sheet";
import { learnDivisions } from "@/lib/estimate-categories";

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
        markupTable: source.markupTable,
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

// --- The sheet -------------------------------------------------------------------

export async function saveTemplate(templateId: string, raw: unknown): Promise<{ ok: true; learned: string[] } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = saveSheetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Some numbers on the sheet aren't valid — check the highlighted cells." };
  await loadTemplate(templateId);
  await db.$transaction(
    async (tx) => {
      await saveTemplateSheet(tx, templateId, parsed.data);
      if (parsed.data.markupTable) await tx.estimateTemplate.update({ where: { id: templateId }, data: { markupTable: JSON.stringify(parsed.data.markupTable) } });
      await tx.estimateTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
    },
    { timeout: 60000 },
  );
  revalidate(templateId);
  return { ok: true, learned: await learnDivisions(parsed.data.specs) };
}

/**
 * A template's parameter values (saved when its Parameters panel closes). They're copied
 * into each estimate started from the template; changing them never touches a job.
 */
export async function saveTemplateValues(templateId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = z.record(z.string(), z.number().finite().min(-1e9).max(1e9)).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "One of the numbers isn't valid." };
  const known = new Set((await db.estimateParameter.findMany({ select: { id: true } })).map((p) => p.id));
  const values = Object.fromEntries(Object.entries(parsed.data).filter(([id]) => known.has(id)));
  const t = await db.estimateTemplate.findUnique({ where: { id: templateId }, select: { id: true } });
  if (!t) return { ok: false, error: "Template not found" };
  await db.estimateTemplate.update({ where: { id: t.id }, data: { paramValues: Object.keys(values).length ? JSON.stringify(values) : null } });
  revalidatePath(`/settings/estimate-templates/${t.id}`);
  return { ok: true };
}
