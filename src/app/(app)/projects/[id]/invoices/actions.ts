"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { contractValue, nextInvoiceNumber } from "@/lib/projects";
import { PAYMENT_METHODS } from "@/lib/constants";
import { money, numField, parseDateInput, str, strOrNull } from "@/lib/utils";
import { deriveInvoiceStatus, invoiceTotal, paymentsTotal } from "@/lib/finance";
import { changeOrderTotals } from "@/lib/change-orders";
import { billedChangeOrderIds, syncInvoiceTax } from "@/lib/billing-flow";

function invoicePath(projectId: string, invoiceId?: string) {
  return `/projects/${projectId}/invoices${invoiceId ? `/${invoiceId}` : ""}`;
}

function revalidate(projectId: string, invoiceId?: string) {
  revalidatePath(invoicePath(projectId));
  if (invoiceId) {
    revalidatePath(invoicePath(projectId, invoiceId));
    revalidatePath(`${invoicePath(projectId, invoiceId)}/print`);
  }
  revalidatePath("/invoices");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

async function loadInvoice(projectId: string, invoiceId: string) {
  const inv = await db.invoice.findFirst({ where: { id: invoiceId, projectId }, include: { items: true, payments: true } });
  if (!inv) throw new Error("Invoice not found");
  return inv;
}

async function syncStatus(invoiceId: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { items: true, payments: true } });
  if (!inv) return;
  const next = deriveInvoiceStatus(inv.status, invoiceTotal(inv.items), paymentsTotal(inv.payments));
  if (next !== inv.status) await db.invoice.update({ where: { id: invoiceId }, data: { status: next } });
}

function itemData(fd: FormData) {
  const description = str(fd, "description");
  if (!description) throw new Error("Description is required");
  return { description, quantity: numField(fd, "quantity", 1), unitPrice: numField(fd, "unitPrice", 0) };
}

export async function createInvoice(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");

  const title = str(formData, "title") || "Invoice";
  const issueDate = parseDateInput(formData.get("issueDate")) ?? new Date();
  const dueDate = parseDateInput(formData.get("dueDate"));
  const notes = strOrNull(formData, "notes");

  const items: { description: string; quantity: number; unitPrice: number; sortOrder: number; changeOrderId?: string }[] = [];
  const number = await invoiceNumberFrom(formData);

  // Approved change orders selected for billing (never one that's already on an invoice).
  const coIds = formData.getAll("changeOrderIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (coIds.length) {
    const billed = await billedChangeOrderIds(projectId);
    const cos = await db.changeOrder.findMany({ where: { id: { in: coIds }, projectId, status: "APPROVED" }, include: { items: true }, orderBy: { number: "asc" } });
    for (const co of cos.filter((c) => !billed.has(c.id))) {
      items.push({
        description: `Change Order #${co.number} — ${co.title}`,
        quantity: 1,
        unitPrice: changeOrderTotals(co, co.items).total,
        sortOrder: items.length,
        changeOrderId: co.id,
      });
    }
  }

  // Percent-of-contract progress draw.
  const pctOfContract = numField(formData, "percentOfContract", 0);
  if (pctOfContract > 0) {
    const contract = await contractValue(projectId, project.contractAmount);
    const amount = Math.round(contract * pctOfContract) / 100;
    items.push({ description: `Progress draw (${pctOfContract}%)`, quantity: 1, unitPrice: amount, sortOrder: items.length });
  }

  // Blank rows.
  const descriptions = formData.getAll("itemDescription");
  const quantities = formData.getAll("itemQuantity");
  const prices = formData.getAll("itemUnitPrice");
  descriptions.forEach((d, i) => {
    const description = typeof d === "string" ? d.trim() : "";
    if (!description) return;
    const q = Number(typeof quantities[i] === "string" ? quantities[i] : 1) || 1;
    const p = Number(typeof prices[i] === "string" ? String(prices[i]).replace(/[$,\s]/g, "") : 0) || 0;
    items.push({ description, quantity: q, unitPrice: p, sortOrder: items.length });
  });

  const inv = await db.invoice.create({
    data: { projectId, number, title, issueDate, dueDate, notes, items: { create: items } },
  });
  await logActivity({ projectId, userId: user.id, type: "invoice.created", description: `Invoice #${number} "${title}" created (${money(invoiceTotal(items))})` });
  revalidate(projectId, inv.id);
  redirect(invoicePath(projectId, inv.id));
}

export async function updateInvoice(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const inv = await loadInvoice(projectId, id);
  // A draft's number can be changed (it has to be one no other invoice uses).
  const typed = str(formData, "number") ? Math.round(numField(formData, "number", inv.number)) : inv.number;
  if (typed !== inv.number) {
    if (inv.status !== "DRAFT") throw new Error("Only a draft invoice's number can change");
    await assertNumberFree(typed);
  }
  await db.invoice.update({
    where: { id },
    data: {
      number: typed,
      title: str(formData, "title") || "Invoice",
      issueDate: parseDateInput(formData.get("issueDate")) ?? new Date(),
      dueDate: parseDateInput(formData.get("dueDate")),
      notes: strOrNull(formData, "notes"),
    },
  });
  revalidate(projectId, id);
  redirect(invoicePath(projectId, id));
}

export async function markInvoiceSent(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const inv = await loadInvoice(projectId, id);
  if (inv.status !== "DRAFT") throw new Error("Only draft invoices can be sent");
  await db.invoice.update({ where: { id }, data: { status: "SENT" } });
  await syncStatus(id);
  await logActivity({ projectId, userId: user.id, type: "invoice.sent", description: `Invoice #${inv.number} sent (${money(invoiceTotal(inv.items))})` });
  revalidate(projectId, id);
  redirect(invoicePath(projectId, id));
}

export async function voidInvoice(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const inv = await loadInvoice(projectId, id);
  if (inv.status === "VOID") throw new Error("Invoice is already void");
  await db.invoice.update({ where: { id }, data: { status: "VOID" } });
  await logActivity({ projectId, userId: user.id, type: "invoice.voided", description: `Invoice #${inv.number} voided` });
  revalidate(projectId, id);
  redirect(invoicePath(projectId, id));
}

export async function deleteInvoice(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const inv = await loadInvoice(projectId, id);
  if (inv.status !== "DRAFT") throw new Error("Only draft invoices can be deleted");
  await db.invoice.delete({ where: { id } });
  await logActivity({ projectId, userId: user.id, type: "invoice.deleted", description: `Invoice #${inv.number} deleted` });
  revalidate(projectId);
  redirect(invoicePath(projectId));
}

// --- Items --------------------------------------------------------------------

export async function createInvoiceItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const inv = await loadInvoice(projectId, invoiceId);
  if (inv.status !== "DRAFT") throw new Error("Invoice is not editable");
  const sortOrder = inv.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  await db.invoiceItem.create({ data: { invoiceId, sortOrder, ...itemData(formData) } });
  await syncInvoiceTax(invoiceId);
  revalidate(projectId, invoiceId);
  redirect(invoicePath(projectId, invoiceId));
}

export async function updateInvoiceItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const id = str(formData, "id");
  const inv = await loadInvoice(projectId, invoiceId);
  if (inv.status !== "DRAFT") throw new Error("Invoice is not editable");
  if (!inv.items.some((i) => i.id === id && !i.isTax)) throw new Error("Item not found");
  await db.invoiceItem.update({ where: { id }, data: itemData(formData) });
  await syncInvoiceTax(invoiceId);
  revalidate(projectId, invoiceId);
  redirect(invoicePath(projectId, invoiceId));
}

export async function deleteInvoiceItem(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const id = str(formData, "id");
  const inv = await loadInvoice(projectId, invoiceId);
  if (inv.status !== "DRAFT") throw new Error("Invoice is not editable");
  if (!inv.items.some((i) => i.id === id && !i.isTax)) throw new Error("Item not found");
  await db.invoiceItem.delete({ where: { id } });
  await syncInvoiceTax(invoiceId);
  revalidate(projectId, invoiceId);
  redirect(invoicePath(projectId, invoiceId));
}

/** "Add tax": on or off for this invoice, at the rate you pick. */
export async function setInvoiceTax(formData: FormData) {
  await requireStaff();
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const inv = await loadInvoice(projectId, invoiceId);
  if (inv.status !== "DRAFT") throw new Error("Invoice is not editable");
  const on = formData.get("on") === "on";
  const pct = numField(formData, "taxPct", 0);
  if (on && !(pct > 0 && pct <= 100)) throw new Error("Enter a tax rate between 0 and 100");
  await db.invoice.update({ where: { id: invoiceId }, data: { taxPct: on ? pct : null, taxLabel: str(formData, "taxLabel").slice(0, 60) || "Sales tax" } });
  await syncInvoiceTax(invoiceId);
  revalidate(projectId, invoiceId);
  redirect(invoicePath(projectId, invoiceId));
}

// --- Payments -----------------------------------------------------------------

export async function recordPayment(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const inv = await loadInvoice(projectId, invoiceId);
  if (inv.status === "VOID") throw new Error("Cannot record a payment on a void invoice");
  const amount = numField(formData, "amount", 0);
  if (amount <= 0) throw new Error("Payment amount must be greater than zero");
  const method = str(formData, "method");
  await db.payment.create({
    data: {
      invoiceId,
      amount,
      date: parseDateInput(formData.get("date")) ?? new Date(),
      method: (PAYMENT_METHODS as readonly string[]).includes(method) ? method : "OTHER",
      reference: strOrNull(formData, "reference"),
    },
  });
  await syncStatus(invoiceId);
  await logActivity({ projectId, userId: user.id, type: "invoice.payment", description: `Payment of ${money(amount)} recorded on Invoice #${inv.number}` });
  revalidate(projectId, invoiceId);
  redirect(invoicePath(projectId, invoiceId));
}

export async function deletePayment(formData: FormData) {
  const user = await requireStaff();
  const projectId = str(formData, "projectId");
  const invoiceId = str(formData, "invoiceId");
  const id = str(formData, "id");
  const inv = await loadInvoice(projectId, invoiceId);
  const payment = inv.payments.find((p) => p.id === id);
  if (!payment) throw new Error("Payment not found");
  await db.payment.delete({ where: { id } });
  // Re-derive: if nothing is paid any more, fall back to SENT (it must have been sent to be paid).
  const remaining = paymentsTotal(inv.payments.filter((p) => p.id !== id));
  if (inv.status !== "VOID") {
    const total = invoiceTotal(inv.items);
    const next = remaining <= 0 ? (inv.status === "DRAFT" ? "DRAFT" : "SENT") : deriveInvoiceStatus("SENT", total, remaining);
    await db.invoice.update({ where: { id: invoiceId }, data: { status: next } });
  }
  await logActivity({ projectId, userId: user.id, type: "invoice.payment_removed", description: `Payment of ${money(payment.amount)} removed from Invoice #${inv.number}` });
  revalidate(projectId, invoiceId);
  redirect(invoicePath(projectId, invoiceId));
}

/** No two invoices share a number. */
async function assertNumberFree(number: number) {
  if (!(Number.isInteger(number) && number > 0)) throw new Error("Invoice numbers are whole numbers above 0");
  const used = await db.invoice.findUnique({ where: { number }, select: { id: true } });
  if (used) throw new Error(`Invoice #${number} is already used — pick another number`);
}

/** The new invoice's number: the one you typed (when you number them yourself), else the next automatic one. */
async function invoiceNumberFrom(formData: FormData) {
  const typed = str(formData, "number");
  if (!typed) return nextInvoiceNumber();
  const n = Math.round(Number(typed));
  await assertNumberFree(n);
  return n;
}
