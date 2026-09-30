"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { boolField, money, numField, str, strOrNull } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";

function estimatePath(projectId: string, estimateId?: string) {
  return `/projects/${projectId}/estimate${estimateId ? `?estimate=${estimateId}` : ""}`;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/estimate`);
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/invoices`);
  revalidatePath(`/projects/${projectId}`);
}

async function loadProject(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  return project;
}

async function loadEstimate(projectId: string, estimateId: string) {
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, include: { items: true } });
  if (!est) throw new Error("Estimate not found");
  return est;
}

function itemData(fd: FormData) {
  const description = str(fd, "description");
  if (!description) throw new Error("Description is required");
  return {
    costCodeId: strOrNull(fd, "costCodeId"),
    group: str(fd, "group") || "General",
    description,
    quantity: numField(fd, "quantity", 1),
    unit: str(fd, "unit") || "ea",
    unitCost: numField(fd, "unitCost", 0),
    markupPct: numField(fd, "markupPct", 0),
    isAllowance: boolField(fd, "isAllowance"),
    isOptional: boolField(fd, "isOptional"),
  };
}

export async function createEstimate(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const project = await loadProject(projectId);
  const company = await db.company.findFirst();
  const last = await db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  const est = await db.estimate.create({
    data: {
      projectId,
      name: "Estimate",
      version: (last?.version ?? 0) + 1,
      status: "DRAFT",
      defaultMarkup: company?.defaultMarkup ?? 20,
    },
  });
  if (project.status === "LEAD") {
    await db.project.update({ where: { id: projectId }, data: { status: "ESTIMATING" } });
  }
  await logActivity({ projectId, userId: user.id, type: "estimate.created", description: `Estimate v${est.version} created` });
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
  const est = await db.estimate.create({
    data: {
      projectId,
      name: source.name,
      version,
      status: "DRAFT",
      notes: source.notes,
      terms: source.terms,
      defaultMarkup: source.defaultMarkup,
      items: {
        create: source.items.map((i) => ({
          costCodeId: i.costCodeId,
          group: i.group,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unitCost: i.unitCost,
          markupPct: i.markupPct,
          isAllowance: i.isAllowance,
          isOptional: i.isOptional,
          sortOrder: i.sortOrder,
        })),
      },
    },
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
  const est = await loadEstimate(projectId, estimateId);
  if (est.status !== "DRAFT") throw new Error("Estimate is not editable");
  const sortOrder = est.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  await db.estimateItem.create({ data: { estimateId, sortOrder, ...itemData(formData) } });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}

export async function updateEstimateItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, estimateId);
  if (est.status !== "DRAFT") throw new Error("Estimate is not editable");
  if (!est.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.estimateItem.update({ where: { id }, data: itemData(formData) });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}

export async function deleteEstimateItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, estimateId);
  if (est.status !== "DRAFT") throw new Error("Estimate is not editable");
  if (!est.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.estimateItem.delete({ where: { id } });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
}
