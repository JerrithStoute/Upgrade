import "server-only";
import { addDays } from "date-fns";
import { db } from "./db";
import { lineCost, linePrice } from "./utils";
import { changeOrderTotals } from "./change-orders";
import { parseMarkupTable, tableExtras } from "./markup";
import { invoiceTotal, paymentsTotal } from "./finance";
import { billTotal } from "./purchasing";
import { agingBucket, daysLate, jobNumbers, periodOf, periods, type AgingKey, type JobNumbers } from "./report-math";

/** Jobs that have a contract: sold, building, on hold, or finished. */
export const ACTIVE = ["CONTRACTED", "IN_PROGRESS", "ON_HOLD"];
export const SOLD = [...ACTIVE, "COMPLETED"];

/** Who sees Reports: admins, and team members you've allowed (Settings → Team). */
export function canSeeReports(user: { role: string; canSeeReports?: boolean | null }) {
  return user.role === "ADMIN" || !!user.canSeeReports;
}

export type JobRow = JobNumbers & {
  id: string;
  number: number | null;
  name: string;
  status: string;
  client: string | null;
  hasBudget: boolean;
};

/**
 * Every sold job's money as of a date: contract, budget, cost so far, billed, collected —
 * and from those its projected profit and WIP (see report-math).
 */
export async function jobRows(statuses: string[] = SOLD, asOf = new Date()) {
  const projects = await db.project.findMany({
    where: { status: { in: statuses } },
    orderBy: [{ number: "asc" }],
    include: {
      client: { select: { firstName: true, lastName: true } },
      estimates: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1, include: { items: true } },
      changeOrders: { where: { status: "APPROVED" }, include: { items: true } },
      expenses: { where: { date: { lte: asOf } }, select: { amount: true } },
      invoices: { where: { status: { notIn: ["DRAFT", "VOID"] }, issueDate: { lte: asOf } }, include: { items: true, payments: { where: { date: { lte: asOf } } } } },
    },
  });
  return projects.map((p): JobRow => {
    const est = p.estimates[0];
    const estItems = (est?.items ?? []).filter((i) => !i.isOptional);
    const estPrice = est
      ? (est.basePrice ?? estItems.reduce((n, i) => n + linePrice(i), 0) + tableExtras(parseMarkupTable(est.markupTable, est.defaultMarkup), est.items).overheadTotal)
      : 0;
    const cos = p.changeOrders.filter((c) => !c.decidedAt || c.decidedAt <= asOf);
    const coPrice = cos.reduce((n, c) => n + changeOrderTotals(c, c.items).total, 0);
    const coCost = cos.reduce((n, c) => n + c.items.reduce((t, i) => t + lineCost(i), 0), 0);
    const budgetCost = estItems.reduce((n, i) => n + lineCost(i), 0) + coCost;
    const nums = jobNumbers({
      contract: (est ? estPrice : p.contractAmount) + coPrice,
      budgetCost,
      actualCost: p.expenses.reduce((n, e) => n + e.amount, 0),
      billed: p.invoices.reduce((n, i) => n + invoiceTotal(i.items), 0),
      collected: p.invoices.reduce((n, i) => n + paymentsTotal(i.payments), 0),
      completed: p.status === "COMPLETED",
    });
    return {
      ...nums,
      id: p.id,
      number: p.number,
      name: p.name,
      status: p.status,
      client: p.client ? `${p.client.firstName} ${p.client.lastName}`.trim() : null,
      hasBudget: budgetCost > 0,
    };
  });
}

/** Column totals of job rows. */
export function sumRows(rows: JobRow[]) {
  const s = (k: keyof JobNumbers) => rows.reduce((n, r) => n + ((r[k] as number) ?? 0), 0);
  const contract = s("contract");
  return {
    contract,
    budgetCost: s("budgetCost"),
    actualCost: s("actualCost"),
    projectedCost: s("projectedCost"),
    budgetProfit: s("budgetProfit"),
    projectedProfit: s("projectedProfit"),
    projectedMargin: contract > 0 ? s("projectedProfit") / contract : null,
    fade: s("fade"),
    billed: s("billed"),
    collected: s("collected"),
    owed: s("owed"),
    earned: s("earned"),
    overBilled: rows.reduce((n, r) => n + Math.max(0, r.overUnder), 0),
    underBilled: rows.reduce((n, r) => n + Math.min(0, r.overUnder), 0),
    costToFinish: s("costToFinish"),
    profitToDate: s("profitToDate"),
    profitToCome: s("profitToCome"),
  };
}

// --- AR aging -------------------------------------------------------------------------------

export type AgingRow = {
  id: string;
  number: number;
  projectId: string;
  project: string;
  client: string;
  issueDate: Date;
  due: Date;
  days: number;
  bucket: AgingKey;
  total: number;
  balance: number;
};

/** Unpaid invoice balances, by how late they are. An invoice with no due date is due when issued. */
export async function agingRows(today = new Date()) {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIAL"] } },
    include: { items: true, payments: true, project: { select: { id: true, name: true, client: { select: { firstName: true, lastName: true } } } } },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
  });
  return invoices
    .map((inv): AgingRow => {
      const total = invoiceTotal(inv.items);
      const due = inv.dueDate ?? inv.issueDate;
      const days = daysLate(due, today);
      return {
        id: inv.id,
        number: inv.number,
        projectId: inv.projectId,
        project: inv.project.name,
        client: inv.project.client ? `${inv.project.client.firstName} ${inv.project.client.lastName}`.trim() : "No client",
        issueDate: inv.issueDate,
        due,
        days,
        bucket: agingBucket(days),
        total,
        balance: Math.round((total - paymentsTotal(inv.payments)) * 100) / 100,
      };
    })
    .filter((r) => r.balance > 0.005);
}

// --- Cash flow ------------------------------------------------------------------------------

export type CashItem = { date: Date; amount: number; label: string; href: string };

/**
 * Money in and out by week or month: what's happened (payments received, costs paid) and
 * what's coming (open invoices by due date, unpaid bills and costs). Anything already late
 * is counted in this period.
 */
export async function cashFlow(by: "week" | "month", today = new Date()) {
  const list = by === "month" ? periods("month", today, 3, 3) : periods("week", today, 6, 8);
  const current = list.find((p) => p.current)!;
  const from = list[0].start;
  const [payments, paidExpenses, openInvoices, unpaidBills, unpaidExpenses] = await Promise.all([
    db.payment.findMany({ where: { date: { gte: from } }, include: { invoice: { select: { number: true, projectId: true, project: { select: { name: true } } } } } }),
    db.expense.findMany({ where: { status: "PAID" }, include: { bill: { select: { paidAt: true } }, project: { select: { name: true } } } }),
    db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIAL"] } }, include: { items: true, payments: true, project: { select: { name: true } } } }),
    db.vendorBill.findMany({ where: { status: { in: ["PENDING", "APPROVED"] } }, include: { lines: true, project: { select: { name: true } } } }),
    db.expense.findMany({ where: { status: "UNPAID", billId: null }, include: { project: { select: { name: true } } } }),
  ]);
  const rows = list.map((p) => ({ ...p, in: 0, out: 0, expectedIn: 0, expectedOut: 0, inItems: [] as CashItem[], outItems: [] as CashItem[] }));
  const put = (date: Date, amount: number, side: "in" | "out", expected: boolean, item: Omit<CashItem, "date" | "amount">) => {
    // Late money that's still coming counts now.
    const when = expected && date < current.start ? current.start : date;
    const p = periodOf(list, when);
    if (!p) return;
    const r = rows.find((x) => x.key === p.key)!;
    if (side === "in") {
      if (expected) r.expectedIn += amount;
      else r.in += amount;
      r.inItems.push({ date, amount, ...item });
    } else {
      if (expected) r.expectedOut += amount;
      else r.out += amount;
      r.outItems.push({ date, amount, ...item });
    }
  };
  for (const pay of payments)
    put(pay.date, pay.amount, "in", false, {
      label: `Payment · Invoice #${pay.invoice.number} · ${pay.invoice.project.name}`,
      href: `/projects/${pay.invoice.projectId}/invoices`,
    });
  for (const e of paidExpenses) put(e.bill?.paidAt ?? e.date, e.amount, "out", false, { label: `${e.vendor} · ${e.project.name}`, href: `/projects/${e.projectId}/budget` });
  for (const inv of openInvoices) {
    const balance = invoiceTotal(inv.items) - paymentsTotal(inv.payments);
    if (balance > 0.005)
      put(inv.dueDate ?? addDays(inv.issueDate, 30), balance, "in", true, {
        label: `Invoice #${inv.number} · ${inv.project.name}`,
        href: `/projects/${inv.projectId}/invoices/${inv.id}`,
      });
  }
  for (const b of unpaidBills)
    put(b.dueDate ?? addDays(b.billDate, 30), billTotal(b.lines), "out", true, {
      label: `${b.vendorName}${b.status === "PENDING" ? " (not approved yet)" : ""} · ${b.project.name}`,
      href: `/projects/${b.projectId}/purchasing/bills/${b.id}`,
    });
  for (const e of unpaidExpenses) put(e.date, e.amount, "out", true, { label: `${e.vendor} · ${e.project.name}`, href: `/projects/${e.projectId}/budget` });
  for (const r of rows) {
    r.inItems.sort((a, b) => a.date.getTime() - b.date.getTime());
    r.outItems.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  return rows;
}
