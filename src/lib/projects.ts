import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { linePrice } from "./utils";
import { changeOrderTotals } from "./change-orders";
import { parseMarkupTable, tableExtras } from "./markup";

/** Load a project or 404. */
export async function getProject(id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: { client: true, manager: true },
  });
  if (!project) notFound();
  return project;
}

/**
 * Approved-estimate total: its base price (what was quoted), or the price of its
 * lines (sales tax and profit in) plus the table's overhead.
 */
export async function approvedEstimateTotal(projectId: string) {
  const est = await db.estimate.findFirst({
    where: { projectId, status: "APPROVED" },
    orderBy: { version: "desc" },
    include: { items: true },
  });
  if (!est) return 0;
  const extras = tableExtras(parseMarkupTable(est.markupTable, est.defaultMarkup), est.items);
  const lines = est.items.filter((i) => !i.isOptional).reduce((s, i) => s + linePrice(i), 0);
  return est.basePrice ?? lines + extras.overheadTotal;
}

/** Approved change-order total (lines, profit and tax). */
export async function approvedChangeOrderTotal(projectId: string) {
  const cos = await db.changeOrder.findMany({
    where: { projectId, status: "APPROVED" },
    include: { items: true },
  });
  return cos.reduce((s, co) => s + changeOrderTotals(co, co.items).total, 0);
}

/** Contract value = approved estimate + approved change orders (falls back to project.contractAmount). */
export async function contractValue(projectId: string, fallback = 0) {
  const est = await approvedEstimateTotal(projectId);
  const cos = await approvedChangeOrderTotal(projectId);
  return est > 0 ? est + cos : fallback + cos;
}

/** Financial summary used on the project overview and dashboard. */
export async function projectFinancials(projectId: string, fallbackContract = 0) {
  const [contract, expenses, invoices] = await Promise.all([
    contractValue(projectId, fallbackContract),
    db.expense.aggregate({ where: { projectId }, _sum: { amount: true } }),
    db.invoice.findMany({
      where: { projectId, status: { not: "VOID" } },
      include: { items: true, payments: true },
    }),
  ]);
  const invoiced = invoices.reduce((s, inv) => s + inv.items.reduce((t, i) => t + i.quantity * i.unitPrice, 0), 0);
  const paid = invoices.reduce((s, inv) => s + inv.payments.reduce((t, p) => t + p.amount, 0), 0);
  const spent = expenses._sum.amount ?? 0;
  return { contract, spent, invoiced, paid, outstanding: invoiced - paid, remainingToInvoice: contract - invoiced };
}

export async function nextProjectNumber() {
  const last = await db.project.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 1000) + 1;
}

/** The next invoice number: your starting number (Settings → Billing), or one past the highest used, whichever is more. */
export async function nextInvoiceNumber() {
  const [last, company] = await Promise.all([
    db.invoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } }),
    db.company.findFirst({ select: { invoiceNextNumber: true } }),
  ]);
  return Math.max((last?.number ?? 1000) + 1, company?.invoiceNextNumber ?? 1001);
}

export async function nextChangeOrderNumber(projectId: string) {
  const last = await db.changeOrder.findFirst({ where: { projectId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

export async function staffUsers() {
  return db.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}

export async function activeCostCodes() {
  return db.costCode.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
}
