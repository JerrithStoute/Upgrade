import "server-only";
import { notFound } from "next/navigation";
import type { Estimate, EstimateItem } from "@prisma/client";
import { db } from "./db";
import { asWholeCompany } from "./tenant";
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
  return est ? estimatePrice(est) : 0;
}

/** What an estimate is priced at: its base price, or its lines (optional ones out) plus the table's overhead. */
function estimatePrice(est: Estimate & { items: EstimateItem[] }) {
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
  const [est, cos] = await Promise.all([approvedEstimateTotal(projectId), approvedChangeOrderTotal(projectId)]);
  return est > 0 ? est + cos : fallback + cos;
}

/**
 * contractValue for many jobs at once, in the same order — two database questions in all,
 * not two per job (the dashboard, Projects and a client's page list many jobs).
 */
export async function contractValues(projects: { id: string; contractAmount: number }[]) {
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const [estimates, cos] = await Promise.all([
    db.estimate.findMany({ where: { projectId: { in: ids }, status: "APPROVED" }, orderBy: { version: "desc" }, include: { items: true } }),
    db.changeOrder.findMany({ where: { projectId: { in: ids }, status: "APPROVED" }, include: { items: true } }),
  ]);
  const est = new Map<string, number>();
  for (const e of estimates) {
    if (!est.has(e.projectId)) est.set(e.projectId, estimatePrice(e)); // the newest approved version only
  }
  const co = new Map<string, number>();
  for (const c of cos) co.set(c.projectId, (co.get(c.projectId) ?? 0) + changeOrderTotals(c, c.items).total);
  return projects.map((p) => {
    const e = est.get(p.id) ?? 0;
    const c = co.get(p.id) ?? 0;
    return e > 0 ? e + c : p.contractAmount + c;
  });
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
  // Across every job — even for someone who sees only their own.
  const last = await asWholeCompany(() => db.project.findFirst({ orderBy: { number: "desc" }, select: { number: true } }));
  return (last?.number ?? 1000) + 1;
}

/** The next invoice number: your starting number (Settings → Invoices), or one past the highest used, whichever is more. */
export async function nextInvoiceNumber() {
  const [last, company] = await Promise.all([
    asWholeCompany(() => db.invoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } })),
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
