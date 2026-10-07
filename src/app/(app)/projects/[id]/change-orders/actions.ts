"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { intField, money, str, strOrNull } from "@/lib/utils";
import { parseApprovals, parseCoDefaults, type CoDefaults } from "@/lib/change-orders";
import { applyDecline, coTotal, finalizeIfApproved, unaddedChoices } from "@/lib/change-orders-server";
import { newChangeOrder } from "@/lib/billing-flow";
import { noteChange } from "@/lib/selection-activity";
import { deleteUpload, saveUpload } from "@/lib/uploads";

type Result = { ok: true } | { ok: false; error: string };

function coPath(projectId: string, coId?: string) {
  return `/projects/${projectId}/change-orders${coId ? `/${coId}` : ""}`;
}

function revalidate(projectId: string, coId?: string) {
  revalidatePath(coPath(projectId));
  if (coId) revalidatePath(coPath(projectId, coId));
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/invoices`);
  revalidatePath(`/projects/${projectId}/selections`);
  revalidatePath(`/projects/${projectId}`);
}

async function loadCO(projectId: string, coId: string) {
  const co = await db.changeOrder.findFirst({ where: { id: coId, projectId }, include: { items: true } });
  if (!co) throw new Error("Change order not found");
  return co;
}

async function draftCO(projectId: string, coId: string) {
  const co = await loadCO(projectId, coId);
  if (co.status !== "DRAFT") throw new Error("Only a draft change order can be changed");
  return co;
}

const err = (e: unknown): Result => ({ ok: false, error: (e as Error).message });

/** New change order: title from the form; intro, closing text, terms, profit and "if declined" from your defaults. */
export async function createChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const title = str(formData, "title");
  if (!title) redirect(`${coPath(projectId)}/new`);
  const co = await newChangeOrder(projectId, {
    title,
    description: strOrNull(formData, "description"),
    reason: strOrNull(formData, "reason"),
    scheduleImpactDays: intField(formData, "scheduleImpactDays", 0),
  });
  await logActivity({ projectId, userId: user.id, type: "change_order.created", description: `Change Order #${co.number} "${title}" created` });
  revalidate(projectId, co.id);
  redirect(coPath(projectId, co.id));
}

const fields = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(200),
    description: z.string().max(10000),
    reason: z.string().max(100),
    introText: z.string().max(20000),
    closingText: z.string().max(20000),
    terms: z.string().max(5000),
    profitMode: z.enum(["NONE", "PCT", "AMOUNT"]),
    profitValue: z.number().finite().min(-1e9).max(1e9),
    profitLabel: z.string().trim().max(60),
    profitShown: z.enum(["LINE", "FOLDED"]),
    taxPct: z.number().finite().min(0).max(100),
    taxLabel: z.string().trim().max(60),
    taxShown: z.enum(["LINE", "FOLDED"]),
    scheduleImpactDays: z.number().int().min(-3650).max(3650),
    priorCompletion: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    newCompletion: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    approverIds: z.array(z.string()).max(100),
    clientApproval: z.boolean(),
    ifDeclined: z.enum(["KEEP", "CLEAR"]),
    showItems: z.boolean(),
    showPrices: z.boolean(),
  })
  .partial();

const day = (s: string) => (s ? new Date(`${s}T12:00:00`) : null);

/** Saves changes to a draft change order (any of its fields). */
export async function saveChangeOrder(projectId: string, coId: string, raw: unknown): Promise<Result> {
  await requireStaff();
  const parsed = fields.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields" };
  try {
    const current = await draftCO(projectId, coId);
    const { priorCompletion, newCompletion, approverIds, description, reason, introText, closingText, terms, profitLabel, taxLabel, ...rest } = parsed.data;
    // Tax added to a change order that had none: its items (not extra charges) are taxed — untick any you don't pay tax on.
    if (rest.taxPct !== undefined && rest.taxPct > 0 && !(current.taxPct > 0))
      await db.changeOrderItem.updateMany({ where: { changeOrderId: current.id, kind: { not: "CHARGE" } }, data: { taxed: true } });
    const text = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    await db.changeOrder.update({
      where: { id: coId },
      data: {
        ...rest,
        description: text(description),
        reason: text(reason),
        introText: text(introText),
        closingText: text(closingText),
        terms: text(terms),
        ...(profitLabel !== undefined ? { profitLabel: profitLabel || "Builder's fee" } : {}),
        ...(taxLabel !== undefined ? { taxLabel: taxLabel || "Sales tax" } : {}),
        ...(priorCompletion !== undefined ? { priorCompletion: day(priorCompletion) } : {}),
        ...(newCompletion !== undefined ? { newCompletion: day(newCompletion) } : {}),
        ...(approverIds !== undefined ? { approverIds: JSON.stringify(approverIds) } : {}),
      },
    });
  } catch (e) {
    return err(e);
  }
  revalidate(projectId, coId);
  return { ok: true };
}

/** "Use as default": new change orders start with this value. */
export async function saveCoDefault(field: keyof CoDefaults, value: string | number | null): Promise<Result> {
  await requireStaff();
  if (!["introText", "closingText", "terms", "ifDeclined", "profitMode", "profitValue", "profitShown"].includes(field)) return { ok: false, error: "Unknown default" };
  const company = await db.company.findFirst({ select: { id: true, changeOrderDefaults: true } });
  if (!company) return { ok: false, error: "Set up your company first (Settings)." };
  const d = parseCoDefaults(company.changeOrderDefaults) as Record<string, unknown>;
  if (value === null || value === "") delete d[field];
  else d[field] = value;
  await db.company.update({ where: { id: company.id }, data: { changeOrderDefaults: JSON.stringify(d) } });
  return { ok: true };
}

/** Adds client choices (not on a change order yet) as lines: Client Price − Allowance = Difference. */
export async function addChoicesToChangeOrder(projectId: string, coId: string, selectionIds: string[]): Promise<Result> {
  const user = await requireStaff();
  try {
    const co = await draftCO(projectId, coId);
    const open = (await unaddedChoices(projectId)).filter((c) => selectionIds.includes(c.selectionId));
    let order = co.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
    for (const c of open) {
      await db.changeOrderItem.create({
        data: {
          changeOrderId: co.id,
          kind: "SELECTION",
          selectionId: c.selectionId,
          category: c.category,
          description: c.title,
          choiceName: c.choiceName,
          clientPrice: c.clientPrice,
          allowance: c.allowance,
          quantity: 1,
          unit: "ls",
          unitCost: c.difference,
          markupPct: 0,
          costCodeId: c.costCodeId,
          taxed: co.taxPct > 0,
          sortOrder: order++,
        },
      });
      await noteChange(c.selectionId, user, `Added to change order #${co.number}`);
    }
  } catch (e) {
    return err(e);
  }
  revalidate(projectId, coId);
  return { ok: true };
}

const lineInput = z.object({
  id: z.string().nullable(),
  kind: z.enum(["LINE", "CHARGE"]),
  description: z.string().trim().min(1, "Describe it").max(500),
  amount: z.number().finite().min(-1e9).max(1e9),
  costCodeId: z.string().nullable().optional(),
});

/** An item ("New Item", its client price) or an extra charge (e.g. a change order fee). */
export async function saveChangeOrderLine(projectId: string, coId: string, raw: unknown): Promise<Result> {
  await requireStaff();
  const parsed = lineInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the line" };
  try {
    const co = await draftCO(projectId, coId);
    const { id, kind, description, amount, costCodeId } = parsed.data;
    const code = costCodeId ? await db.costCode.findUnique({ where: { id: costCodeId }, select: { id: true } }) : null;
    const data = {
      kind,
      description,
      quantity: 1,
      unit: "ls",
      unitCost: amount,
      markupPct: 0,
      clientPrice: kind === "LINE" ? amount : null,
      ...(costCodeId !== undefined ? { costCodeId: code?.id ?? null } : {}),
    };
    if (id) {
      if (!co.items.some((i) => i.id === id && i.kind !== "SELECTION")) return { ok: false, error: "Line not found" };
      await db.changeOrderItem.update({ where: { id }, data });
    } else
      await db.changeOrderItem.create({
        // A new item is taxed when the change order has tax; an extra charge (a fee) isn't.
        data: { ...data, taxed: kind === "LINE" && co.taxPct > 0, changeOrderId: co.id, sortOrder: co.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1 },
      });
  } catch (e) {
    return err(e);
  }
  revalidate(projectId, coId);
  return { ok: true };
}

/** An item's cost code — your bookkeeping (the budget uses it), so it can change even after approval. Clients never see it. */
export async function setChangeOrderLineCode(projectId: string, coId: string, itemId: string, costCodeId: string | null): Promise<Result> {
  await requireStaff();
  const item = await db.changeOrderItem.findFirst({ where: { id: itemId, changeOrder: { id: coId, projectId } }, select: { id: true } });
  if (!item) return { ok: false, error: "Line not found" };
  const code = costCodeId ? await db.costCode.findUnique({ where: { id: costCodeId }, select: { id: true } }) : null;
  if (costCodeId && !code) return { ok: false, error: "Cost code not found" };
  await db.changeOrderItem.update({ where: { id: item.id }, data: { costCodeId: code?.id ?? null } });
  revalidate(projectId, coId);
  revalidatePath(`/projects/${projectId}/budget`);
  return { ok: true };
}

/** A line's own profit (draft only): CO follows the change order's; NONE, PCT (a %) or AMOUNT (a $). */
export async function setChangeOrderLineProfit(projectId: string, coId: string, itemId: string, mode: string, value: number): Promise<Result> {
  await requireStaff();
  if (!["CO", "NONE", "PCT", "AMOUNT"].includes(mode) || !Number.isFinite(value) || Math.abs(value) > 1e9) return { ok: false, error: "Check the profit" };
  try {
    const co = await draftCO(projectId, coId);
    if (!co.items.some((i) => i.id === itemId)) return { ok: false, error: "Line not found" };
    await db.changeOrderItem.update({ where: { id: itemId }, data: { profitMode: mode, profitValue: mode === "PCT" || mode === "AMOUNT" ? value : 0 } });
  } catch (e) {
    return err(e);
  }
  revalidate(projectId, coId);
  return { ok: true };
}

/** Taxed or not (draft only): you pay sales tax on it at the change order's rate. */
export async function setChangeOrderLineTax(projectId: string, coId: string, itemId: string, taxed: boolean): Promise<Result> {
  await requireStaff();
  try {
    const co = await draftCO(projectId, coId);
    if (!co.items.some((i) => i.id === itemId)) return { ok: false, error: "Line not found" };
    await db.changeOrderItem.update({ where: { id: itemId }, data: { taxed } });
  } catch (e) {
    return err(e);
  }
  revalidate(projectId, coId);
  return { ok: true };
}

export async function removeChangeOrderLine(projectId: string, coId: string, itemId: string): Promise<Result> {
  const user = await requireStaff();
  try {
    const co = await draftCO(projectId, coId);
    const item = co.items.find((i) => i.id === itemId);
    if (!item) return { ok: false, error: "Line not found" };
    await db.changeOrderItem.delete({ where: { id: item.id } });
    if (item.selectionId) await noteChange(item.selectionId, user, `Taken off change order #${co.number}`);
  } catch (e) {
    return err(e);
  }
  revalidate(projectId, coId);
  return { ok: true };
}

export async function sendChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "DRAFT") throw new Error("Only draft change orders can be sent");
  await db.changeOrder.update({ where: { id }, data: { status: "PENDING_APPROVAL", sentAt: new Date() } });
  await logActivity({ projectId, userId: user.id, type: "change_order.sent", description: `Change Order #${co.number} sent for approval` });
  // Nothing left to approve (no client, no team members listed)? It's approved now.
  await finalizeIfApproved(co.id, user);
  revalidate(projectId, id);
  redirect(coPath(projectId, id));
}

/** Records the client's approval (signed on paper, by email…). Approved once every listed team member has too. */
export async function approveChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "PENDING_APPROVAL") throw new Error("Change order is not waiting for approval");
  const decidedBy = str(formData, "decidedBy") || user.name;
  await db.changeOrder.update({ where: { id }, data: { clientApprovedAt: new Date(), decidedBy, decisionNote: strOrNull(formData, "decisionNote") } });
  await logActivity({ projectId, userId: user.id, type: "change_order.approved", description: `Change Order #${co.number} approved by ${decidedBy} (${money(coTotal(co))})` });
  await finalizeIfApproved(co.id, user);
  revalidate(projectId, id);
  redirect(coPath(projectId, id));
}

/** A listed team member approves. */
export async function teamApproveChangeOrder(projectId: string, coId: string): Promise<Result> {
  const user = await requireStaff();
  const co = await loadCO(projectId, coId);
  if (co.status !== "PENDING_APPROVAL") return { ok: false, error: "Change order is not waiting for approval" };
  const done = parseApprovals(co.teamApprovals);
  done[user.id] = new Date().toISOString();
  await db.changeOrder.update({ where: { id: co.id }, data: { teamApprovals: JSON.stringify(done) } });
  await logActivity({ projectId, userId: user.id, type: "change_order.team_approved", description: `${user.name} approved Change Order #${co.number}` });
  await finalizeIfApproved(co.id, user);
  revalidate(projectId, coId);
  return { ok: true };
}

export async function declineChangeOrder(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const co = await loadCO(projectId, id);
  if (co.status !== "PENDING_APPROVAL") throw new Error("Change order is not waiting for approval");
  const decidedBy = str(formData, "decidedBy") || user.name;
  await db.changeOrder.update({ where: { id }, data: { status: "DECLINED", decidedAt: new Date(), decidedBy, decisionNote: strOrNull(formData, "decisionNote") } });
  await applyDecline(co.id, user);
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

// --- Files --------------------------------------------------------------------

export async function addChangeOrderFiles(projectId: string, coId: string, fd: FormData): Promise<Result> {
  const user = await requireStaff();
  try {
    const co = await loadCO(projectId, coId);
    for (const file of fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)) {
      const meta = await saveUpload(file, projectId);
      await db.fileAsset.create({ data: { ...meta, projectId, changeOrderId: co.id, uploadedById: user.id, folder: "Contracts", clientVisible: true } });
    }
  } catch (e) {
    return err(e);
  }
  revalidate(projectId, coId);
  revalidatePath(`/projects/${projectId}/files`);
  return { ok: true };
}

export async function removeChangeOrderFile(projectId: string, fileId: string): Promise<Result> {
  await requireStaff();
  const file = await db.fileAsset.findFirst({ where: { id: fileId, projectId, changeOrderId: { not: null } } });
  if (!file) return { ok: false, error: "File not found" };
  await db.fileAsset.delete({ where: { id: file.id } });
  await deleteUpload(file.storagePath);
  revalidate(projectId, file.changeOrderId ?? undefined);
  return { ok: true };
}
