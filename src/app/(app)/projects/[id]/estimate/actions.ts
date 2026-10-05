"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { money, numField, str, strOrNull } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import { copyIntoEstimate, copyIntoTemplate, createProjectEstimate, ensureEstimateSpecs, loadTemplate, nextSortOrder, saveEstimateSheet } from "@/lib/estimate-lines";
import { saveSheetInput } from "@/lib/estimate-sheet";
import { learnDivisions } from "@/lib/estimate-categories";
import { projectValues, saveProjectValues } from "@/lib/estimate-parameters";
import { saveCover } from "@/lib/project-cover";
import { deleteUpload } from "@/lib/uploads";
import { proposalOptionsSchema } from "@/lib/proposal-options";
import { markupTableSchema } from "@/lib/markup";
import { lockJobPrices } from "@/lib/job-prices";

function estimatePath(projectId: string, estimateId?: string) {
  return `/projects/${projectId}/estimate${estimateId ? `?estimate=${estimateId}` : ""}`;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/estimate`);
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/invoices`);
  revalidatePath(`/projects/${projectId}/selections`);
  revalidatePath(`/projects/${projectId}`);
}

async function loadProject(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  return project;
}

async function loadEstimate(projectId: string, estimateId: string) {
  await ensureEstimateSpecs(estimateId);
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, include: { items: true, specs: true } });
  if (!est) throw new Error("Estimate not found");
  return est;
}

async function loadDraftEstimate(projectId: string, estimateId: string) {
  const est = await loadEstimate(projectId, estimateId);
  if (est.status !== "DRAFT") throw new Error("Estimate is not editable");
  return est;
}

async function nextVersion(projectId: string) {
  const last = await db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  return (last?.version ?? 0) + 1;
}

export type SaveEstimateResult = { ok: true; estimateId: string; version: number; learned: string[] } | { ok: false; error: string };

/**
 * Saves the estimate sheet. "over" writes into this estimate (drafts only);
 * "new" makes the next version from what's on screen and leaves this one as it was.
 */
export async function saveEstimate(projectId: string, estimateId: string, raw: unknown, mode: "over" | "new"): Promise<SaveEstimateResult> {
  const user = await requireStaff();
  const parsed = saveSheetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Some numbers on the sheet aren't valid — check the highlighted cells." };
  const input = parsed.data;
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId } });
  if (!est) return { ok: false, error: "Estimate not found" };
  if (mode === "over" && est.status !== "DRAFT") return { ok: false, error: `v${est.version} is ${est.status.toLowerCase()} — save it as a new version.` };
  if (mode === "over" && est.lockedAt) return { ok: false, error: `v${est.version} is locked — unlock it to save changes, or save them as a new version.` };
  // The Markup, Margin & Tax table: saved with the sheet (a new version starts from what's on screen).
  const header = {
    basePrice: input.basePrice,
    totalSqFt: input.totalSqFt,
    ...(input.markupTable ? { markupTable: JSON.stringify(input.markupTable) } : {}),
  };

  const saved = await db.$transaction(
    async (tx) => {
      if (mode === "over") {
        // Saved: the "what changed" note starts over.
        await tx.estimate.update({ where: { id: est.id }, data: { ...header, autoNote: null } });
        await saveEstimateSheet(tx, est.id, est.id, input);
        if (input.parameterValues) await saveProjectValues(tx, projectId, input.parameterValues);
        return est;
      }
      const created = await tx.estimate.create({
        data: {
          projectId,
          name: est.name,
          version: await nextVersion(projectId),
          status: "DRAFT",
          notes: est.notes,
          terms: est.terms,
          defaultMarkup: est.defaultMarkup,
          markupTable: est.markupTable,
          ...header,
        },
      });
      await saveEstimateSheet(tx, est.id, created.id, input);
      if (input.parameterValues) await saveProjectValues(tx, projectId, input.parameterValues);
      return created;
    },
    { timeout: 60000 },
  );
  await logActivity({
    projectId,
    userId: user.id,
    type: mode === "over" ? "estimate.updated" : "estimate.version",
    description: mode === "over" ? `Estimate v${saved.version} saved` : `Estimate v${saved.version} created from v${est.version}`,
  });
  revalidate(projectId);
  // Arranging categories into divisions here updates your Settings (admins).
  const learned = user.role === "ADMIN" ? await learnDivisions(input.specs) : [];
  return { ok: true, estimateId: saved.id, version: saved.version, learned };
}

/** New estimate version — blank, or pre-filled from an estimate template. */
export async function createEstimate(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  await loadProject(projectId);
  const { estimate: est, template } = await createProjectEstimate(projectId, strOrNull(formData, "templateId"));
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.created",
    description: `Estimate v${est.version} created${template ? ` from template "${template.name}"` : ""}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, est.id));
}

export async function updateEstimateDetails(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  await loadEstimate(projectId, id);
  const name = str(formData, "name");
  const data: { name?: string; notes?: string | null; terms?: string | null; defaultMarkup?: number } = {};
  if (formData.has("name")) data.name = name || "Estimate";
  if (formData.has("notes")) data.notes = strOrNull(formData, "notes");
  if (formData.has("terms")) data.terms = strOrNull(formData, "terms");
  if (formData.has("defaultMarkup")) data.defaultMarkup = numField(formData, "defaultMarkup", 20);
  await db.estimate.update({ where: { id }, data });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
}

export async function markEstimateSent(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "DRAFT") throw new Error("Only draft estimates can be sent");
  await db.estimate.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  // The client has a number now: the job's prices stop following the Item List.
  await lockJobPrices(projectId);
  const project = await loadProject(projectId);
  if (project.status === "LEAD" || project.status === "ESTIMATING") {
    await db.project.update({ where: { id: projectId }, data: { status: "PROPOSAL_SENT" } });
  }
  await logActivity({ projectId, userId: user.id, type: "estimate.sent", description: `Estimate "${est.name}" v${est.version} marked sent` });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
}

export async function markEstimateApproved(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "SENT") throw new Error("Only sent estimates can be approved");
  await db.estimate.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
  const project = await loadProject(projectId);
  if (["LEAD", "ESTIMATING", "PROPOSAL_SENT"].includes(project.status)) {
    await db.project.update({ where: { id: projectId }, data: { status: "CONTRACTED" } });
  }
  const totals = lineTotals(est.items);
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.approved",
    description: `Estimate "${est.name}" v${est.version} approved (${money(est.basePrice ?? totals.price)})`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
}

export async function markEstimateDeclined(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "SENT") throw new Error("Only sent estimates can be declined");
  await db.estimate.update({ where: { id }, data: { status: "DECLINED" } });
  await logActivity({ projectId, userId: user.id, type: "estimate.declined", description: `Estimate "${est.name}" v${est.version} declined` });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
}

export async function createEstimateVersion(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const source = await loadEstimate(projectId, id);
  const version = await nextVersion(projectId);
  const est = await db.$transaction(async (tx) => {
    const created = await tx.estimate.create({
      data: {
        projectId,
        name: source.name,
        version,
        status: "DRAFT",
        notes: source.notes,
        terms: source.terms,
        defaultMarkup: source.defaultMarkup,
        basePrice: source.basePrice,
        markupTable: source.markupTable,
        totalSqFt: source.totalSqFt,
      },
    });
    await copyIntoEstimate(tx, created.id, source, { keepSelectionLinks: true });
    return created;
  });
  await logActivity({ projectId, userId: user.id, type: "estimate.version", description: `Estimate v${version} created from v${source.version}` });
  revalidate(projectId);
  redirect(estimatePath(projectId, est.id));
}

export async function deleteEstimate(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "DRAFT") throw new Error("Only draft estimates can be deleted");
  await db.estimate.delete({ where: { id } });
  await logActivity({ projectId, userId: user.id, type: "estimate.deleted", description: `Estimate v${est.version} deleted` });
  revalidate(projectId);
  redirect(estimatePath(projectId));
}

// --- Templates ----------------------------------------------------------------

/** Appends a template's spec items and lines to a draft estimate (e.g. a "Bathroom" template onto a kitchen job). */
export async function addTemplateToEstimate(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const templateId = str(formData, "templateId");
  if (!templateId) throw new Error("Pick a template");
  const est = await loadDraftEstimate(projectId, estimateId);
  const template = await loadTemplate(templateId);
  const values = await projectValues(projectId);
  await db.$transaction((tx) => copyIntoEstimate(tx, estimateId, template, { sortOffset: nextSortOrder(est), values }), { timeout: 30000 });
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.template_added",
    description: `Added template "${template.name}" (${template.items.length} lines) to estimate v${est.version}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}

/** Admins: copy this estimate (spec items, lines, notes, terms, markup) into a new template. */
export async function saveEstimateAsTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const est = await loadEstimate(projectId, estimateId);
  const name = str(formData, "name") || est.name;
  const template = await db.$transaction(async (tx) => {
    const created = await tx.estimateTemplate.create({
      data: { name, notes: est.notes, terms: est.terms, defaultMarkup: est.defaultMarkup, markupTable: est.markupTable },
    });
    await copyIntoTemplate(tx, created.id, est);
    return created;
  });
  await logActivity({ userId: admin.id, type: "estimate_template.created", description: `Saved estimate v${est.version} as template "${name}"` });
  revalidatePath("/settings/estimate-templates");
  redirect(`/settings/estimate-templates/${template.id}`);
}

// --- Proposal options ---------------------------------------------------------------

/**
 * What the proposal shows. "estimate": just this estimate. "default": your default for
 * every proposal (this estimate then follows it too). "reset": this estimate goes
 * back to following your default.
 */
export async function saveProposalOptions(
  projectId: string,
  estimateId: string,
  raw: unknown,
  scope: "estimate" | "default" | "reset",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireStaff();
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, select: { id: true } });
  if (!est) return { ok: false, error: "Estimate not found" };
  if (scope === "reset") {
    await db.estimate.update({ where: { id: est.id }, data: { proposalOptions: null } });
  } else {
    const parsed = proposalOptionsSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Those options couldn't be saved." };
    const json = JSON.stringify(parsed.data);
    if (scope === "estimate") await db.estimate.update({ where: { id: est.id }, data: { proposalOptions: json } });
    else {
      if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can change the default for every proposal." };
      const company = await db.company.findFirst({ select: { id: true } });
      if (!company) return { ok: false, error: "Set up your company first (Settings)." };
      await db.$transaction([
        db.company.update({ where: { id: company.id }, data: { proposalOptions: json } }),
        db.estimate.update({ where: { id: est.id }, data: { proposalOptions: null } }),
      ]);
    }
  }
  revalidatePath(`/projects/${projectId}/estimate/${estimateId}/proposal`);
  return { ok: true };
}

// --- Proposal cover picture ---------------------------------------------------------

/** Sets (form has "file") or removes (no file) the job's cover picture. */
export async function setProjectCover(projectId: string, fd: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const project = await db.project.findUnique({ where: { id: projectId }, select: { coverPath: true } });
  if (!project) return { ok: false, error: "Project not found" };
  const file = fd.get("file");
  try {
    if (file instanceof File && file.size > 0) {
      const saved = await saveCover(projectId, file, project.coverPath);
      await db.project.update({ where: { id: projectId }, data: saved });
    } else {
      if (project.coverPath) await deleteUpload(project.coverPath);
      await db.project.update({ where: { id: projectId }, data: { coverPath: null, coverType: null } });
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/projects/${projectId}/estimate`, "layout");
  return { ok: true };
}

// --- Markup, Margin & Tax --------------------------------------------------------------

/** "Save as my default": new estimates start with this table. */
export async function saveMarkupDefault(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = markupTableSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the table's rows" };
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) return { ok: false, error: "Set up your company first (Settings)." };
  await db.company.update({ where: { id: company.id }, data: { markupTable: JSON.stringify(parsed.data) } });
  return { ok: true };
}

/** The job's parameter values — saved when you close the Parameters panel (they belong to the job, not an estimate version). */
export async function saveParameterValues(projectId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaff();
  const parsed = saveSheetInput.shape.parameterValues.unwrap().safeParse(raw);
  if (!parsed.success) return { ok: false, error: "One of the numbers isn't valid." };
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { ok: false, error: "Job not found" };
  await db.$transaction((tx) => saveProjectValues(tx, projectId, parsed.data));
  revalidatePath(`/projects/${projectId}/estimate`);
  return { ok: true };
}

// --- Estimate lock and "what changed" ---------------------------------------------------

/** Locks a draft: no automatic updates from the takeoff and no edits until it's unlocked. */
export async function lockEstimate(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  const locked = formData.get("lock") === "1";
  await db.estimate.update({ where: { id }, data: { lockedAt: locked ? new Date() : null } });
  await logActivity({
    projectId,
    userId: user.id,
    type: locked ? "estimate.locked" : "estimate.unlocked",
    description: `Estimate v${est.version} ${locked ? "locked" : "unlocked"}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
}

/** Clears the "what changed" note (the changes stay — just the note goes). */
export async function dismissAutoNote(projectId: string, estimateId: string): Promise<{ ok: true }> {
  await requireStaff();
  // Without touching the estimate's "updated" time — that would reload the sheet and lose unsaved edits.
  await db.$executeRaw`UPDATE "Estimate" SET "autoNote" = NULL WHERE "id" = ${estimateId} AND "projectId" = ${projectId}`;
  revalidatePath(`/projects/${projectId}/estimate`);
  return { ok: true };
}
