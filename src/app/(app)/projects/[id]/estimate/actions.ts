"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { money, numField, str, strOrNull } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import {
  allowanceFields,
  allowanceNameFromLine,
  copyIntoEstimate,
  copyIntoTemplate,
  createProjectEstimate,
  lineFields,
  loadTemplate,
  nextSortOrder,
  starterCostCodes,
} from "@/lib/estimate-lines";

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
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, include: { items: true, allowances: true } });
  if (!est) throw new Error("Estimate not found");
  return est;
}

type LoadedEstimate = Awaited<ReturnType<typeof loadEstimate>>;

async function loadDraftEstimate(projectId: string, estimateId: string) {
  const est = await loadEstimate(projectId, estimateId);
  if (est.status !== "DRAFT") throw new Error("Estimate is not editable");
  return est;
}

function itemData(fd: FormData, est: LoadedEstimate) {
  return lineFields(fd, est.allowances);
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
    description: `Estimate "${est.name}" v${est.version} approved (${money(totals.price)})`,
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
  const last = await db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
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

// --- Line items ---------------------------------------------------------------

export async function createEstimateItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const est = await loadDraftEstimate(projectId, estimateId);
  const data = itemData(formData, est);
  await db.estimateItem.create({ data: { estimateId, sortOrder: nextSortOrder(est), ...data } });
  revalidate(projectId);
  redirect(`${estimatePath(projectId, estimateId)}${data.allowanceId ? `#allowance-${data.allowanceId}` : ""}`);
}

export async function updateEstimateItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  const est = await loadDraftEstimate(projectId, estimateId);
  if (!est.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.estimateItem.update({ where: { id }, data: itemData(formData, est) });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}

export async function deleteEstimateItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  const est = await loadDraftEstimate(projectId, estimateId);
  if (!est.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.estimateItem.delete({ where: { id } });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}

// --- Allowances ---------------------------------------------------------------
// An allowance (e.g. "Flooring") is built up from line items, each with its own
// cost code (tile material, hardwood material, install labor…). The client sees a
// single allowance amount; budget / job costing still tracks each cost code.

export async function createAllowance(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const est = await loadDraftEstimate(projectId, estimateId);
  const fields = allowanceFields(formData);
  const costCodes = await starterCostCodes(formData);
  const sortOrder = nextSortOrder(est);
  const allowance = await db.estimateAllowance.create({
    data: {
      estimateId,
      sortOrder,
      ...fields,
      items: {
        create: costCodes.map((c, i) => ({
          estimateId,
          costCodeId: c.id,
          group: fields.group,
          description: c.name,
          quantity: 1,
          unit: "ls",
          unitCost: 0,
          markupPct: est.defaultMarkup,
          isAllowance: true,
          sortOrder: sortOrder + 1 + i,
        })),
      },
    },
  });
  revalidate(projectId);
  // No starter lines → open the "add line" form inside the new allowance.
  redirect(`${estimatePath(projectId, estimateId)}${costCodes.length ? "" : `&addTo=${allowance.id}`}#allowance-${allowance.id}`);
}

export async function updateAllowance(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  const est = await loadDraftEstimate(projectId, estimateId);
  if (!est.allowances.some((a) => a.id === id)) throw new Error("Allowance not found");
  const fields = allowanceFields(formData);
  await db.$transaction([
    db.estimateAllowance.update({ where: { id }, data: fields }),
    // Lines follow their allowance into its group.
    db.estimateItem.updateMany({ where: { allowanceId: id }, data: { group: fields.group } }),
  ]);
  revalidate(projectId);
  redirect(`${estimatePath(projectId, estimateId)}#allowance-${id}`);
}

/** Removes the allowance wrapper. Its lines stay on the estimate as regular (non-allowance) lines. */
export async function deleteAllowance(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  const est = await loadDraftEstimate(projectId, estimateId);
  if (!est.allowances.some((a) => a.id === id)) throw new Error("Allowance not found");
  await db.$transaction([
    db.estimateItem.updateMany({ where: { allowanceId: id }, data: { allowanceId: null, isAllowance: false } }),
    db.estimateAllowance.delete({ where: { id } }),
  ]);
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}

/** Turns a single-line allowance item into a built-up allowance containing that line. */
export async function convertItemToAllowance(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  const est = await loadDraftEstimate(projectId, estimateId);
  const item = est.items.find((i) => i.id === id);
  if (!item) throw new Error("Item not found");
  if (item.allowanceId) throw new Error("Item is already part of an allowance");
  const allowance = await db.estimateAllowance.create({
    data: { estimateId, name: allowanceNameFromLine(item.description), group: item.group, sortOrder: item.sortOrder },
  });
  await db.estimateItem.update({ where: { id }, data: { allowanceId: allowance.id, isAllowance: true } });
  revalidate(projectId);
  redirect(`${estimatePath(projectId, estimateId)}&addTo=${allowance.id}#allowance-${allowance.id}`);
}

/**
 * Pushes the allowance amount (client price of its lines) to a selection, creating
 * the selection the first time. Works on any estimate status so an approved
 * estimate's allowances can feed the selections the client will make.
 */
export async function syncAllowanceToSelection(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  await loadEstimate(projectId, estimateId);
  const allowance = await db.estimateAllowance.findFirst({
    where: { id, estimateId },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, selection: true },
  });
  if (!allowance) throw new Error("Allowance not found");
  const amount = Math.round(lineTotals(allowance.items).price * 100) / 100;
  const linked = allowance.selection && allowance.selection.projectId === projectId ? allowance.selection : null;
  if (linked) {
    await db.selection.update({ where: { id: linked.id }, data: { allowance: amount } });
    await logActivity({
      projectId,
      userId: user.id,
      type: "selection.updated",
      description: `Allowance for "${linked.title}" set to ${money(amount)} from estimate`,
    });
  } else {
    const selection = await db.selection.create({
      data: {
        projectId,
        title: allowance.name,
        category: allowance.name,
        description: allowance.description,
        costCodeId: allowance.items.find((i) => i.costCodeId)?.costCodeId ?? null,
        allowance: amount,
      },
    });
    await db.estimateAllowance.update({ where: { id }, data: { selectionId: selection.id } });
    await logActivity({
      projectId,
      userId: user.id,
      type: "selection.created",
      description: `Selection "${selection.title}" created from estimate allowance (${money(amount)})`,
    });
  }
  revalidate(projectId);
  redirect(`${estimatePath(projectId, estimateId)}#allowance-summary`);
}

// --- Templates ----------------------------------------------------------------

/** Appends a template's lines and allowances to a draft estimate (e.g. a "Bathroom" template onto a kitchen job). */
export async function addTemplateToEstimate(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const templateId = str(formData, "templateId");
  if (!templateId) throw new Error("Pick a template");
  const est = await loadDraftEstimate(projectId, estimateId);
  const template = await loadTemplate(templateId);
  await db.$transaction((tx) => copyIntoEstimate(tx, estimateId, template, { sortOffset: nextSortOrder(est) }));
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.template_added",
    description: `Added template "${template.name}" (${template.items.length} lines) to estimate v${est.version}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}

/** Admins: copy this estimate (lines, allowances, notes, terms, markup) into a new template. */
export async function saveEstimateAsTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const est = await loadEstimate(projectId, estimateId);
  const name = str(formData, "name") || est.name;
  const template = await db.$transaction(async (tx) => {
    const created = await tx.estimateTemplate.create({
      data: { name, notes: est.notes, terms: est.terms, defaultMarkup: est.defaultMarkup },
    });
    await copyIntoTemplate(tx, created.id, est);
    return created;
  });
  await logActivity({ userId: admin.id, type: "estimate_template.created", description: `Saved estimate v${est.version} as template "${name}"` });
  revalidatePath("/settings/estimate-templates");
  redirect(`/settings/estimate-templates/${template.id}`);
}
