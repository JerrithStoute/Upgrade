"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { nextChangeOrderNumber } from "@/lib/projects";
import { intField, money, numField, str, strOrNull } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";

function coPath(projectId: string, coId?: string) {
  return `/projects/${projectId}/change-orders${coId ? `/${coId}` : ""}`;
}

function revalidate(projectId: string, coId?: string) {
  revalidatePath(coPath(projectId));
  if (coId) revalidatePath(coPath(projectId, coId));
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/invoices`);
  revalidatePath(`/projects/${projectId}`);
}

async function loadCO(projectId: string, coId: string) {
  const co = await db.changeOrder.findFirst({ where: { id: coId, projectId }, include: { items: true } });
  if (!co) throw new Error("Change order not found");
  return co;
}

function itemData(fd: FormData) {
  const description = str(fd, "description");
  if (!description) throw new Error("Description is required");
  return {
    costCodeId: strOrNull(fd, "costCodeId"),
    description,
    quantity: numField(fd, "quantity", 1),
    unit: str(fd, "unit") || "ea",
    unitCost: numField(fd, "unitCost", 0),
    markupPct: numField(fd, "markupPct", 0),
  };
}

export async function createChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const title = str(formData, "title");
  if (!title) redirect(`${coPath(projectId)}/new`);
  const number = await nextChangeOrderNumber(projectId);
  const co = await db.changeOrder.create({
    data: {
      projectId,
      number,
      title,
      description: strOrNull(formData, "description"),
      reason: strOrNull(formData, "reason"),
      scheduleImpactDays: intField(formData, "scheduleImpactDays", 0),
    },
  });
  await logActivity({ projectId, userId: user.id, type: "change_order.created", description: `Change Order #${number} "${title}" created` });
  revalidate(projectId, co.id);
  redirect(coPath(projectId, co.id));
}

export async function updateChangeOrder(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  await loadCO(projectId, id);
  const title = str(formData, "title");
  if (!title) throw new Error("Title is required");
  await db.changeOrder.update({
    where: { id },
    data: {
      title,
      description: strOrNull(formData, "description"),
      reason: strOrNull(formData, "reason"),
      scheduleImpactDays: intField(formData, "scheduleImpactDays", 0),
    },
  });
  revalidate(projectId, id);
  redirect(coPath(projectId, id));
}

export async function sendChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "DRAFT") throw new Error("Only draft change orders can be sent");
  await db.changeOrder.update({ where: { id }, data: { status: "PENDING_APPROVAL", sentAt: new Date() } });
  await logActivity({ projectId, userId: user.id, type: "change_order.sent", description: `Change Order #${co.number} sent for approval` });
  revalidate(projectId, id);
  redirect(coPath(projectId, id));
}

export async function approveChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "PENDING_APPROVAL") throw new Error("Change order is not pending approval");
  const decidedBy = str(formData, "decidedBy") || user.name;
  await db.changeOrder.update({
    where: { id },
    data: { status: "APPROVED", decidedAt: new Date(), decidedBy, decisionNote: strOrNull(formData, "decisionNote") },
  });
  const totals = lineTotals(co.items);
  await logActivity({
    projectId,
    userId: user.id,
    type: "change_order.approved",
    description: `Change Order #${co.number} approved by ${decidedBy} (${money(totals.price)})`,
  });
  revalidate(projectId, id);
  redirect(coPath(projectId, id));
}

export async function declineChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "PENDING_APPROVAL") throw new Error("Change order is not pending approval");
  const decidedBy = str(formData, "decidedBy") || user.name;
  await db.changeOrder.update({
    where: { id },
    data: { status: "DECLINED", decidedAt: new Date(), decidedBy, decisionNote: strOrNull(formData, "decisionNote") },
  });
  await logActivity({ projectId, userId: user.id, type: "change_order.declined", description: `Change Order #${co.number} declined by ${decidedBy}` });
  revalidate(projectId, id);
  redirect(coPath(projectId, id));
}

export async function voidChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "APPROVED" && co.status !== "DECLINED") throw new Error("Only approved or declined change orders can be voided");
  await db.changeOrder.update({ where: { id }, data: { status: "VOID" } });
  await logActivity({ projectId, userId: user.id, type: "change_order.voided", description: `Change Order #${co.number} voided` });
  revalidate(projectId, id);
  redirect(coPath(projectId, id));
}

export async function deleteChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "DRAFT") throw new Error("Only draft change orders can be deleted");
  await db.changeOrder.delete({ where: { id } });
  await logActivity({ projectId, userId: user.id, type: "change_order.deleted", description: `Change Order #${co.number} deleted` });
  revalidate(projectId);
  redirect(coPath(projectId));
}

// --- Line items ---------------------------------------------------------------

export async function createChangeOrderItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const changeOrderId = str(formData, "changeOrderId");
  const co = await loadCO(projectId, changeOrderId);
  if (co.status !== "DRAFT") throw new Error("Change order is not editable");
  const sortOrder = co.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  await db.changeOrderItem.create({ data: { changeOrderId, sortOrder, ...itemData(formData) } });
  revalidate(projectId, changeOrderId);
  redirect(coPath(projectId, changeOrderId));
}

export async function updateChangeOrderItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const changeOrderId = str(formData, "changeOrderId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, changeOrderId);
  if (co.status !== "DRAFT") throw new Error("Change order is not editable");
  if (!co.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.changeOrderItem.update({ where: { id }, data: itemData(formData) });
  revalidate(projectId, changeOrderId);
  redirect(coPath(projectId, changeOrderId));
}

export async function deleteChangeOrderItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const changeOrderId = str(formData, "changeOrderId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, changeOrderId);
  if (co.status !== "DRAFT") throw new Error("Change order is not editable");
  if (!co.items.some((i) => i.id === id)) throw new Error("Item not found");
  await db.changeOrderItem.delete({ where: { id } });
  revalidate(projectId, changeOrderId);
  redirect(coPath(projectId, changeOrderId));
}
