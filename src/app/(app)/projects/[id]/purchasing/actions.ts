"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { saveUpload } from "@/lib/uploads";
import { money, parseDateInput, str, strOrNull } from "@/lib/utils";
import { approveBill, billTotal, canApproveBills, markBillPaid, nextPoNumber, poTotal, unapproveBill, vendorByName } from "@/lib/purchasing";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const base = (projectId: string) => `/projects/${projectId}/purchasing`;

function revalidate(projectId: string) {
  revalidatePath(base(projectId), "layout");
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/bills");
  revalidatePath("/vendor", "layout");
}

/** The estimate the budget comes from: the approved one, else the newest. */
async function budgetEstimate(projectId: string) {
  return db.estimate.findFirst({
    where: { projectId },
    orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { version: "desc" }],
    include: { items: { where: { isOptional: false }, orderBy: { sortOrder: "asc" } } },
  });
}

// --- Purchase orders -------------------------------------------------------------------

/**
 * A new PO: blank, from the budget (the estimate's lines of the cost codes you pick, at
 * cost), or from a bid you took (that vendor's quoted lines and prices for its cost code).
 */
export async function createPurchaseOrder(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const source = str(fd, "source");
  let vendorName = str(fd, "vendor");
  let vendorId: string | null = null;
  let bidId: string | null = null;
  let lines: { description: string; costCodeId: string | null; quantity: number; unit: string; unitCost: number }[] = [];

  if (source === "bid") {
    const [awardBidId, codeKey] = str(fd, "award").split("|");
    const bid = await db.bid.findFirst({ where: { id: awardBidId, projectId: project.id }, include: { lines: { where: { codeKey }, orderBy: { sortOrder: "asc" } } } });
    if (!bid) throw new Error("Pick a bid you took");
    bidId = bid.id;
    vendorName = bid.vendorName;
    vendorId = bid.vendorId;
    lines = bid.lines
      .filter((l) => l.unitPrice != null && l.quantity > 0)
      .map((l) => ({
        description: l.substitute ? `${l.name} (sub: ${l.substitute})` : l.name,
        costCodeId: l.codeKey === "none" ? null : l.codeKey,
        quantity: l.quantity,
        unit: l.unit,
        unitCost: l.unitPrice!,
      }));
  } else if (source === "budget") {
    const codes = fd.getAll("code").map(String);
    const est = await budgetEstimate(project.id);
    lines = (est?.items ?? [])
      .filter((i) => codes.includes(i.costCodeId ?? "none"))
      .map((i) => ({ description: i.description, costCodeId: i.costCodeId, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost }));
    if (!lines.length) throw new Error("Pick the budget's cost codes for this PO");
  }
  if (!vendorName) throw new Error("Who is it to?");
  if (!vendorId) vendorId = (await vendorByName(vendorName))?.id ?? null;
  const title = str(fd, "title") || (lines[0]?.description ?? "Purchase order");
  const po = await db.purchaseOrder.create({
    data: {
      projectId: project.id,
      vendorId,
      vendorName,
      number: await nextPoNumber(),
      title,
      bidId,
      createdById: user.id,
      lines: { create: lines.map((l, i) => ({ ...l, sortOrder: i })) },
    },
  });
  await logActivity({ projectId: project.id, userId: user.id, type: "po.created", description: `PO-${po.number} to ${vendorName} created (${money(poTotal(lines))})` });
  revalidate(project.id);
  redirect(`${base(project.id)}/po/${po.id}`);
}

const poInput = z.object({
  title: z.string().trim().min(1, "Give it a title").max(200),
  vendor: z.string().trim().min(1, "Who is it to?").max(200),
  scope: z.string().max(10000),
  deliveryDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Every line needs a description").max(500),
        costCodeId: z.string().nullable(),
        quantity: z.number().finite().min(-1e9).max(1e9),
        unit: z.string().trim().max(20),
        unitCost: z.number().finite().min(-1e9).max(1e9),
      }),
    )
    .max(500),
});

/** Saves a PO (its details and lines) — until it's closed or void. */
export async function savePurchaseOrder(projectId: string, poId: string, raw: unknown): Promise<Result> {
  const user = await requireStaff();
  const parsed = poInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the PO" };
  const po = await db.purchaseOrder.findFirst({ where: { id: poId, projectId } });
  if (!po) return { ok: false, error: "PO not found" };
  if (po.status === "CLOSED" || po.status === "VOID") return { ok: false, error: "A closed or void PO can't change" };
  const d = parsed.data;
  const codes = new Set((await db.costCode.findMany({ select: { id: true } })).map((c) => c.id));
  const vendor = d.vendor === po.vendorName ? { id: po.vendorId } : await vendorByName(d.vendor);
  await db.$transaction([
    db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: po.id } }),
    db.purchaseOrder.update({
      where: { id: po.id },
      data: {
        title: d.title,
        vendorName: d.vendor,
        vendorId: vendor?.id ?? null,
        scope: d.scope.trim() || null,
        deliveryDate: d.deliveryDate ? new Date(`${d.deliveryDate}T12:00:00`) : null,
        lines: {
          create: d.lines.map((l, i) => ({ ...l, unit: l.unit || "ls", costCodeId: l.costCodeId && codes.has(l.costCodeId) ? l.costCodeId : null, sortOrder: i })),
        },
      },
    }),
  ]);
  if (po.status !== "DRAFT")
    await logActivity({ projectId, userId: user.id, type: "po.updated", description: `PO-${po.number} changed after it was sent (${money(poTotal(d.lines))})` });
  revalidate(projectId);
  return { ok: true };
}

const NEXT: Record<string, string[]> = {
  SENT: ["DRAFT", "DECLINED"],
  ACCEPTED: ["SENT", "DRAFT", "DECLINED"],
  DECLINED: ["SENT"],
  CLOSED: ["ACCEPTED", "SENT"],
  VOID: ["DRAFT", "SENT", "ACCEPTED", "DECLINED"],
  DRAFT: ["VOID"],
};
const VERB: Record<string, string> = { SENT: "sent", ACCEPTED: "marked accepted", DECLINED: "marked declined", CLOSED: "closed", VOID: "voided", DRAFT: "reopened" };

/** Sent / accepted (for them) / declined / closed / void / reopened. */
export async function setPurchaseOrderStatus(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const status = str(fd, "status");
  const po = await db.purchaseOrder.findFirst({ where: { id: str(fd, "id"), projectId: project.id } });
  if (!po) throw new Error("PO not found");
  if (!NEXT[status]?.includes(po.status)) throw new Error(`A ${po.status.toLowerCase()} PO can't be ${VERB[status] ?? status}`);
  await db.purchaseOrder.update({
    where: { id: po.id },
    data: {
      status,
      ...(status === "SENT" ? { sentAt: new Date() } : {}),
      ...(status === "ACCEPTED" || status === "DECLINED" ? { respondedAt: new Date(), responseNote: strOrNull(fd, "note") } : {}),
    },
  });
  await logActivity({ projectId: project.id, userId: user.id, type: "po.status", description: `PO-${po.number} ${VERB[status]}` });
  revalidate(project.id);
  redirect(`${base(project.id)}/po/${po.id}`);
}

export async function deletePurchaseOrder(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const po = await db.purchaseOrder.findFirst({ where: { id: str(fd, "id"), projectId: project.id }, include: { _count: { select: { bills: true } } } });
  if (!po) throw new Error("PO not found");
  if (po.status !== "DRAFT" || po._count.bills) throw new Error("Only a draft PO with no bills can be deleted — void it instead");
  await db.purchaseOrder.delete({ where: { id: po.id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "po.deleted", description: `PO-${po.number} deleted` });
  revalidate(project.id);
  redirect(base(project.id));
}

// --- Bills -----------------------------------------------------------------------------

const billLines = z
  .array(
    z.object({
      description: z.string().trim().min(1, "Every line needs a description").max(500),
      costCodeId: z.string().nullable(),
      amount: z.number().finite().min(-1e9).max(1e9),
    }),
  )
  .min(1, "Add what the bill is for")
  .max(500);

function readBillLines(fd: FormData) {
  try {
    return billLines.parse(JSON.parse(str(fd, "lines") || "[]"));
  } catch (e) {
    throw new Error(e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the bill's lines") : "Check the bill's lines");
  }
}

async function saveBillFile(fd: FormData, projectId: string, userId: string | null) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const meta = await saveUpload(file, projectId);
  const asset = await db.fileAsset.create({ data: { ...meta, projectId, uploadedById: userId, folder: "Bills", clientVisible: false } });
  return asset.id;
}

/** A bill from a sub or vendor, matched to one of their POs when picked. Waits for approval. */
export async function createBill(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const lines = readBillLines(fd);
  const poId = str(fd, "purchaseOrderId");
  const po = poId ? await db.purchaseOrder.findFirst({ where: { id: poId, projectId: project.id } }) : null;
  const vendorName = po?.vendorName ?? str(fd, "vendor");
  if (!vendorName) throw new Error("Who is the bill from?");
  const vendorId = po?.vendorId ?? (await vendorByName(vendorName))?.id ?? null;
  const codes = new Set((await db.costCode.findMany({ select: { id: true } })).map((c) => c.id));
  const fileId = await saveBillFile(fd, project.id, user.id);
  const bill = await db.vendorBill.create({
    data: {
      projectId: project.id,
      vendorId,
      vendorName,
      purchaseOrderId: po?.id ?? null,
      billNumber: strOrNull(fd, "billNumber"),
      billDate: parseDateInput(fd.get("billDate")) ?? new Date(),
      dueDate: parseDateInput(fd.get("dueDate")),
      notes: strOrNull(fd, "notes"),
      fileId,
      lines: { create: lines.map((l, i) => ({ ...l, costCodeId: l.costCodeId && codes.has(l.costCodeId) ? l.costCodeId : null, sortOrder: i })) },
    },
  });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "bill.created",
    description: `Bill from ${vendorName}${po ? ` on PO-${po.number}` : ""} entered (${money(billTotal(lines))})`,
  });
  revalidate(project.id);
  redirect(`${base(project.id)}/bills/${bill.id}`);
}

/** Changes a bill that's still waiting for approval (or was rejected). */
export async function updateBill(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const bill = await db.vendorBill.findFirst({ where: { id: str(fd, "id"), projectId: project.id } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status !== "PENDING" && bill.status !== "REJECTED") throw new Error("Un-approve the bill to change it");
  const lines = readBillLines(fd);
  const codes = new Set((await db.costCode.findMany({ select: { id: true } })).map((c) => c.id));
  const fileId = (await saveBillFile(fd, project.id, user.id)) ?? bill.fileId;
  await db.$transaction([
    db.vendorBillLine.deleteMany({ where: { billId: bill.id } }),
    db.vendorBill.update({
      where: { id: bill.id },
      data: {
        billNumber: strOrNull(fd, "billNumber"),
        billDate: parseDateInput(fd.get("billDate")) ?? bill.billDate,
        dueDate: parseDateInput(fd.get("dueDate")),
        notes: strOrNull(fd, "notes"),
        fileId,
        lines: { create: lines.map((l, i) => ({ ...l, costCodeId: l.costCodeId && codes.has(l.costCodeId) ? l.costCodeId : null, sortOrder: i })) },
      },
    }),
  ]);
  revalidate(project.id);
  redirect(`${base(project.id)}/bills/${bill.id}`);
}

/** Approve / reject / un-approve / paid — approve and pay by those allowed (Settings → Team). */
export async function decideBill(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const bill = await db.vendorBill.findFirst({ where: { id: str(fd, "id"), projectId: project.id }, include: { lines: true } });
  if (!bill) throw new Error("Bill not found");
  const what = str(fd, "decision");
  if (!canApproveBills(user)) throw new Error("You don't have permission to approve bills — an admin can allow it in Settings → Team");
  if (what === "approve") await approveBill(bill.id, user.id);
  else if (what === "reject") {
    if (bill.status !== "PENDING") throw new Error("Only a bill waiting for approval can be rejected");
    await db.vendorBill.update({ where: { id: bill.id }, data: { status: "REJECTED", rejectedNote: strOrNull(fd, "note") } });
  } else if (what === "unapprove") await unapproveBill(bill.id);
  else if (what === "paid")
    await markBillPaid(bill.id, { date: parseDateInput(fd.get("paidAt")) ?? new Date(), method: strOrNull(fd, "method"), reference: strOrNull(fd, "reference") });
  else throw new Error("Unknown decision");
  const verb = { approve: "approved", reject: "rejected", unapprove: "set back to waiting for approval", paid: "marked paid" }[what];
  await logActivity({ projectId: project.id, userId: user.id, type: `bill.${what}`, description: `Bill from ${bill.vendorName} (${money(billTotal(bill.lines))}) ${verb}` });
  revalidate(project.id);
  redirect(str(fd, "back").startsWith("/") ? str(fd, "back") : `${base(project.id)}/bills/${bill.id}`);
}

export async function deleteBill(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const bill = await db.vendorBill.findFirst({ where: { id: str(fd, "id"), projectId: project.id }, include: { lines: true } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status === "APPROVED" || bill.status === "PAID") throw new Error("Un-approve the bill before deleting it");
  await db.vendorBill.delete({ where: { id: bill.id } });
  await logActivity({ projectId: project.id, userId: user.id, type: "bill.deleted", description: `Bill from ${bill.vendorName} (${money(billTotal(bill.lines))}) deleted` });
  revalidate(project.id);
  redirect(base(project.id));
}
