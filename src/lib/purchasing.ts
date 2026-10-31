import "server-only";
import { db } from "./db";
import { asWholeCompany } from "./tenant";

/**
 * Purchase orders and vendor bills for subs and vendors (their paperwork: paperwork.ts).
 *
 *  - A PO says what a sub or vendor will do or supply on a job, at what price.
 *  - A bill is what they charge, matched to a PO when there is one (billed so far / left).
 *  - An approved bill is the job's actual cost: one expense per cost code, so the budget
 *    shows it. Un-approving takes those back off. Paid marks them paid.
 */

export const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CLOSED: "Closed",
  VOID: "Void",
};
export const BILL_STATUS_LABEL: Record<string, string> = { PENDING: "Waiting for approval", APPROVED: "Approved — not paid", PAID: "Paid", REJECTED: "Rejected" };

const cents = (n: number) => Math.round(n * 100) / 100;

export function poTotal(lines: { quantity: number; unitCost: number }[]) {
  return cents(lines.reduce((n, l) => n + l.quantity * l.unitCost, 0));
}
export function billTotal(lines: { amount: number }[]) {
  return cents(lines.reduce((n, l) => n + l.amount, 0));
}

/** PO numbers count up across all jobs: PO-1001, PO-1002… */
export async function nextPoNumber() {
  // Across every job — even for someone who sees only their own.
  const last = await asWholeCompany(() => db.purchaseOrder.findFirst({ orderBy: { number: "desc" }, select: { number: true } }));
  return (last?.number ?? 1000) + 1;
}

/** Billed against a PO so far (bills that aren't rejected), and what's left. */
export async function poBilling(poId: string) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true, bills: { where: { status: { not: "REJECTED" } }, include: { lines: true } } } });
  if (!po) return null;
  const total = poTotal(po.lines);
  const billed = cents(po.bills.reduce((n, b) => n + billTotal(b.lines), 0));
  return { total, billed, left: cents(total - billed), over: billed > total + 0.004 };
}

/** Who approves bills: admins, and team members you've allowed. */
export function canApproveBills(user: { role: string; access?: { approveBills: boolean } | null }) {
  return user.role === "ADMIN" || !!user.access?.approveBills;
}

/**
 * Approves a bill: its lines become the job's actual cost — one expense per cost code
 * (unpaid until the bill is paid). `userId` null: approved where it came from (QuickBooks).
 */
export async function approveBill(billId: string, userId: string | null) {
  const bill = await db.vendorBill.findUnique({ where: { id: billId }, include: { lines: true, purchaseOrder: { select: { number: true, bidId: true } } } });
  if (!bill) throw new Error("Bill not found");
  if (bill.status !== "PENDING" && bill.status !== "REJECTED") throw new Error("This bill is already approved");
  const byCode = new Map<string, { costCodeId: string | null; amount: number; description: string[] }>();
  for (const l of bill.lines) {
    const k = l.costCodeId ?? "none";
    const row = byCode.get(k) ?? { costCodeId: l.costCodeId, amount: 0, description: [] };
    row.amount += l.amount;
    row.description.push(l.description);
    byCode.set(k, row);
  }
  await db.$transaction([
    db.expense.deleteMany({ where: { billId } }),
    ...[...byCode.values()].map((r) =>
      db.expense.create({
        data: {
          projectId: bill.projectId,
          billId,
          costCodeId: r.costCodeId,
          date: bill.billDate,
          vendor: bill.vendorName,
          description: `${bill.purchaseOrder ? `PO-${bill.purchaseOrder.number} · ` : ""}${r.description.join("; ").slice(0, 300)}`,
          // A PO from a bid you took is a supplier's material; otherwise a sub's work.
          category: bill.purchaseOrder?.bidId ? "MATERIAL" : "SUBCONTRACTOR",
          amount: cents(r.amount),
          status: "UNPAID",
          reference: bill.billNumber,
          enteredById: userId,
        },
      }),
    ),
    db.vendorBill.update({ where: { id: billId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: userId, rejectedNote: null } }),
  ]);
}

/** Back to waiting for approval: its cost comes off the job's actuals. */
export async function unapproveBill(billId: string) {
  await db.$transaction([
    db.expense.deleteMany({ where: { billId } }),
    db.vendorBill.update({ where: { id: billId }, data: { status: "PENDING", approvedAt: null, approvedById: null, paidAt: null, paidMethod: null, paidReference: null } }),
  ]);
}

export async function markBillPaid(billId: string, paid: { date: Date; method: string | null; reference: string | null }) {
  const bill = await db.vendorBill.findUnique({ where: { id: billId }, select: { status: true } });
  if (bill?.status !== "APPROVED") throw new Error("Approve the bill before marking it paid");
  await db.$transaction([
    db.vendorBill.update({ where: { id: billId }, data: { status: "PAID", paidAt: paid.date, paidMethod: paid.method, paidReference: paid.reference } }),
    db.expense.updateMany({ where: { billId }, data: { status: "PAID" } }),
  ]);
}

/** A vendor by name — the one you have, or a new one (onboarding builds as you go). */
export async function vendorByName(name: string) {
  const clean = name.trim();
  if (!clean) return null;
  const all = await db.vendor.findMany({ select: { id: true, name: true } });
  const have = all.find((v) => v.name.trim().toLowerCase() === clean.toLowerCase());
  return have ?? (await db.vendor.create({ data: { name: clean }, select: { id: true, name: true } }));
}
