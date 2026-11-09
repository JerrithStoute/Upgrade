import "server-only";
import { db } from "@/lib/db";
import { changeOrderTotals } from "@/lib/change-orders";
import { parseMarkupTable, tableExtras } from "@/lib/markup";
import { PO_STATUS_LABEL } from "@/lib/purchasing";
import { awardCode, SUB_AWARD } from "@/lib/sub-bids";
import { invoiceLineTotal } from "@/lib/finance";
import { fmtDate, lineCost, linePrice } from "@/lib/utils";

/** One thing behind a number on the Budget: a line of the estimate, a bill, a PO, an invoice… */
export type BudgetSource = { label: string; note?: string; date?: string; amount: number; href?: string };

export type BudgetLine = {
  /** The cost code's id, or NONE for costs with no cost code. */
  key: string;
  code: string;
  name: string;
  division: string;
  sortOrder: number;
  budget: number;
  committed: number | null;
  spent: number;
  price: number;
  invoiced: number;
  done: boolean;
  /** What's committed, in a few words ("Bid #2 · ABC Lumber"). */
  commitNote: string | null;
  /** On the approved estimate, so a PO can be made from it. */
  onEstimate: boolean;
  src: { budget: BudgetSource[]; committed: BudgetSource[]; spent: BudgetSource[]; price: BudgetSource[]; invoiced: BudgetSource[] };
};

export const NONE = "none";
/** PO statuses that commit money: sent to the vendor and not declined or void. */
const LIVE_PO = ["SENT", "ACCEPTED", "CLOSED"];
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Everything on a job's Budget tab, by cost code, with what makes up each number.
 * Budget = the approved estimate's cost + approved change orders. Committed = the bids you took
 * and sent POs (a PO made from a bid replaces that bid). Spent = every expense (bills, crew time,
 * inventory, carrying costs, receipts). Invoiced = sent invoices' lines.
 */
export async function jobBudget(project: { id: string; contractAmount: number | null; budgetDone: string[] }) {
  const base = `/projects/${project.id}`;
  const [estimate, cos, expenses, pos, awards, invoices, codes] = await Promise.all([
    db.estimate.findFirst({ where: { projectId: project.id, status: "APPROVED" }, orderBy: { version: "desc" }, include: { items: { orderBy: { sortOrder: "asc" } } } }),
    db.changeOrder.findMany({ where: { projectId: project.id, status: "APPROVED" }, orderBy: { number: "asc" }, include: { items: true } }),
    db.expense.findMany({
      where: { projectId: project.id },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: { bill: { select: { billNumber: true } }, carryingCost: { select: { name: true } } },
    }),
    db.purchaseOrder.findMany({ where: { projectId: project.id, status: { in: LIVE_PO } }, orderBy: { number: "asc" }, include: { lines: true } }),
    db.bidAward.findMany({ where: { projectId: project.id }, include: { bid: { include: { lines: true } } } }),
    db.invoice.findMany({ where: { projectId: project.id, status: { notIn: ["DRAFT", "VOID"] } }, orderBy: { number: "asc" }, include: { items: true } }),
    db.costCode.findMany(),
  ]);
  const codeOf = new Map(codes.map((c) => [c.id, c]));
  const done = new Set(project.budgetDone);

  const lines = new Map<string, BudgetLine>();
  const line = (codeId: string | null | undefined) => {
    const c = codeId ? codeOf.get(codeId) : undefined;
    const key = c ? c.id : NONE;
    let l = lines.get(key);
    if (!l) {
      l = {
        key,
        code: c?.code ?? "",
        name: c?.name ?? "Not sorted",
        division: c?.division ?? "",
        sortOrder: c?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        budget: 0,
        committed: null,
        spent: 0,
        price: 0,
        invoiced: 0,
        done: c ? done.has(c.id) : false,
        commitNote: null,
        onEstimate: false,
        src: { budget: [], committed: [], spent: [], price: [], invoiced: [] },
      };
      lines.set(key, l);
    }
    return l;
  };

  // Budget and price: the approved estimate, its markup-table overhead (price only), approved change orders.
  const estItems = (estimate?.items ?? []).filter((i) => !i.isOptional);
  const estName = estimate ? `${estimate.name} v${estimate.version}` : "";
  const estPrice = new Map<string, number>();
  for (const i of estItems) {
    const l = line(i.costCodeId);
    const cost = lineCost(i);
    l.budget += cost;
    l.onEstimate = true;
    l.src.budget.push({ label: i.description, note: estName, amount: cents(cost), href: `${base}/estimate` });
    estPrice.set(l.key, (estPrice.get(l.key) ?? 0) + linePrice(i));
  }
  if (estimate) {
    for (const x of tableExtras(parseMarkupTable(estimate.markupTable, estimate.defaultMarkup), estimate.items).rows) {
      const l = line(x.row.costCodeId);
      estPrice.set(l.key, (estPrice.get(l.key) ?? 0) + x.amount);
    }
  }
  for (const [key, amount] of estPrice) lines.get(key)!.src.price.push({ label: estName, amount: cents(amount), href: `${base}/estimate` });
  for (const co of cos) {
    const byCode = new Map<string, { cost: number; price: number }>();
    for (const i of co.items) {
      const l = line(i.costCodeId);
      const r = byCode.get(l.key) ?? { cost: 0, price: 0 };
      r.cost += lineCost(i);
      r.price += linePrice(i);
      byCode.set(l.key, r);
    }
    for (const [key, r] of byCode) {
      const l = lines.get(key)!;
      const label = `Change order #${co.number} · ${co.title}`;
      const href = `${base}/change-orders/${co.id}`;
      l.budget += r.cost;
      l.src.budget.push({ label, amount: cents(r.cost), href });
      l.src.price.push({ label, amount: cents(r.price), href });
    }
  }
  for (const l of lines.values()) l.price = cents(l.src.price.reduce((n, s) => n + s.amount, 0));

  // Committed: sent POs, and bids you took that no PO was made from.
  const commit = (l: BudgetLine, s: BudgetSource) => {
    l.committed = cents((l.committed ?? 0) + s.amount);
    l.src.committed.push(s);
    l.commitNote ??= s.label;
  };
  for (const po of pos) {
    const byCode = new Map<string, number>();
    for (const pl of po.lines) {
      const l = line(pl.costCodeId);
      byCode.set(l.key, (byCode.get(l.key) ?? 0) + pl.quantity * pl.unitCost);
    }
    for (const [key, amount] of byCode)
      commit(lines.get(key)!, { label: `PO-${po.number} · ${po.vendorName}`, note: PO_STATUS_LABEL[po.status], date: (po.sentAt ?? po.createdAt).toISOString(), amount: cents(amount), href: `${base}/purchasing/po/${po.id}` });
  }
  const fromBid = new Set(pos.map((p) => p.bidId).filter(Boolean));
  for (const a of awards) {
    if (fromBid.has(a.bidId)) continue;
    const code = awardCode(a.codeKey);
    const amount = a.bid.lines.filter((bl) => bl.codeKey === code && bl.unitPrice != null).reduce((n, bl) => n + bl.quantity * (bl.unitPrice ?? 0), 0);
    if (!amount) continue;
    const sub = a.codeKey.startsWith(SUB_AWARD);
    commit(line(code === NONE ? null : code), {
      label: `${sub ? "Sub bid" : `Bid #${a.bid.number}`} · ${a.bid.vendorName}`,
      note: `Taken ${fmtDate(a.awardedAt)}`,
      date: a.awardedAt.toISOString(),
      amount: cents(amount),
      href: `${base}/bids/${a.bidId}`,
    });
  }

  // Spent: every expense, linked to where it came from.
  const budgetHref = `${base}/budget`;
  const unpaid: BudgetSource[] = [];
  for (const e of expenses) {
    const l = line(e.costCodeId);
    l.spent += e.amount;
    const paid = e.status === "PAID" ? "Paid" : "Unpaid";
    const s: BudgetSource = e.billId
      ? { label: `Bill${e.bill?.billNumber ? ` ${e.bill.billNumber}` : ""} · ${e.vendor}`, note: [e.description, paid].filter(Boolean).join(" · "), href: `${base}/purchasing/bills/${e.billId}`, amount: e.amount }
      : e.laborWeek
        ? { label: `Crew time · week of ${fmtDate(e.laborWeek, "MMM d")}`, note: "From the time clock", href: `/time/sheets?week=${e.laborWeek}`, amount: e.amount }
        : e.carryingCostId
          ? { label: `Carrying cost · ${e.carryingCost?.name ?? e.vendor}`, note: e.carryingMonth ?? undefined, href: `${base}/spec#carrying`, amount: e.amount }
          : e.fromInventory
            ? { label: `Inventory · ${e.description ?? e.vendor}`, note: e.amount < 0 ? "Returned to inventory" : "From your inventory", href: `${base}/materials/inventory`, amount: e.amount }
            : { label: `${e.vendor}${e.reference ? ` · ${e.reference}` : ""}`, note: [e.description, paid].filter(Boolean).join(" · "), href: `${budgetHref}?edit=${e.id}#expenses`, amount: e.amount };
    s.date = e.date.toISOString();
    l.src.spent.push(s);
    if (e.status === "UNPAID") unpaid.push({ ...s, note: l.code ? `${l.code} ${l.name}` : l.name });
  }

  // Invoiced: sent invoices' lines (a line with no cost code, such as tax, goes under Not sorted).
  for (const inv of invoices) {
    const byCode = new Map<string, number>();
    for (const it of inv.items) {
      const l = line(it.costCodeId);
      byCode.set(l.key, (byCode.get(l.key) ?? 0) + invoiceLineTotal(it));
    }
    for (const [key, amount] of byCode) {
      const l = lines.get(key)!;
      l.invoiced += amount;
      l.src.invoiced.push({ label: `Invoice #${inv.number} · ${inv.title}`, date: inv.issueDate.toISOString(), amount: cents(amount), href: `${base}/invoices/${inv.id}` });
    }
  }

  const out = [...lines.values()]
    .map((l) => ({ ...l, budget: cents(l.budget), spent: cents(l.spent), invoiced: cents(l.invoiced) }))
    .filter((l) => l.budget || l.committed || l.spent || l.price || l.invoiced)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  // The contract: the quoted base price when there is one (else what the lines add up to), plus change orders.
  const estimatePrice = estimate ? (estimate.basePrice ?? estItems.reduce((s, i) => s + linePrice(i), 0) + tableExtras(parseMarkupTable(estimate.markupTable, estimate.defaultMarkup), estimate.items).overheadTotal) : null;
  const coPrice = cos.reduce((s, co) => s + changeOrderTotals(co, co.items).total, 0);
  const contract = cents((estimatePrice ?? project.contractAmount ?? 0) + coPrice);

  return { lines: out, contract, coCount: cos.length, estimate: estimate ? { name: estName } : null, unpaid };
}
