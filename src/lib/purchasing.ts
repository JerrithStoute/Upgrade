import "server-only";
import { db } from "./db";

/**
 * Purchase orders, vendor bills and insurance (COI) for subs and vendors.
 *
 *  - A PO says what a sub or vendor will do or supply on a job, at what price.
 *  - A bill is what they charge, matched to a PO when there is one (billed so far / left).
 *  - An approved bill is the job's actual cost: one expense per cost code, so the budget
 *    shows it. Un-approving takes those back off. Paid marks them paid.
 *  - Insurance: certificates with expiration dates; anyone missing a required one, or with
 *    one expired or running out within 30 days, is flagged.
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

export const COVERAGE_TYPES = [
  { value: "GL", label: "General liability" },
  { value: "WC", label: "Workers' comp" },
  { value: "AUTO", label: "Auto" },
  { value: "UMBRELLA", label: "Umbrella" },
  { value: "OTHER", label: "Other" },
] as const;
export const coverageLabel = (t: string) => COVERAGE_TYPES.find((c) => c.value === t)?.label ?? t;

const cents = (n: number) => Math.round(n * 100) / 100;

export function poTotal(lines: { quantity: number; unitCost: number }[]) {
  return cents(lines.reduce((n, l) => n + l.quantity * l.unitCost, 0));
}
export function billTotal(lines: { amount: number }[]) {
  return cents(lines.reduce((n, l) => n + l.amount, 0));
}

/** PO numbers count up across all jobs: PO-1001, PO-1002… */
export async function nextPoNumber() {
  const last = await db.purchaseOrder.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
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
export function canApproveBills(user: { role: string; canApproveBills?: boolean | null }) {
  return user.role === "ADMIN" || !!user.canApproveBills;
}

/**
 * Approves a bill: its lines become the job's actual cost — one expense per cost code
 * (unpaid until the bill is paid).
 */
export async function approveBill(billId: string, userId: string) {
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

// --- Insurance (COI) ---------------------------------------------------------------------

export const SOON_DAYS = 30;

export type CoverageState = { missing: string[]; expired: { type: string; expiresAt: Date }[]; expiring: { type: string; expiresAt: Date }[]; unconfirmed: number; ok: boolean };

/**
 * Where a vendor's insurance stands today: required types they have no confirmed certificate
 * for, ones expired, and ones running out within 30 days. Each type counts its latest certificate.
 */
export function coverageState(certs: { type: string; expiresAt: Date; confirmed: boolean }[], required: string[], today = new Date()): CoverageState {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const soon = new Date(day.getTime() + SOON_DAYS * 86400000);
  const latest = new Map<string, Date>();
  for (const c of certs) if (c.confirmed && (!latest.has(c.type) || c.expiresAt > latest.get(c.type)!)) latest.set(c.type, c.expiresAt);
  const missing = required.filter((t) => !latest.has(t));
  const expired: CoverageState["expired"] = [];
  const expiring: CoverageState["expiring"] = [];
  for (const [type, expiresAt] of latest) {
    if (expiresAt < day) expired.push({ type, expiresAt });
    else if (expiresAt <= soon) expiring.push({ type, expiresAt });
  }
  const unconfirmed = certs.filter((c) => !c.confirmed).length;
  return { missing, expired, expiring, unconfirmed, ok: !missing.length && !expired.length && !expiring.length };
}

export function parseRequired(text: string | null | undefined) {
  return (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One line for a warning: "Workers' comp expired Sep 30 · General liability missing". */
export function coverageWarning(s: CoverageState, fmt: (d: Date) => string) {
  return [
    ...s.expired.map((e) => `${coverageLabel(e.type)} expired ${fmt(e.expiresAt)}`),
    ...s.missing.map((t) => `${coverageLabel(t)} missing`),
    ...s.expiring.map((e) => `${coverageLabel(e.type)} expires ${fmt(e.expiresAt)}`),
  ].join(" · ");
}

/**
 * Whether you need a vendor's insurance: what you set on their page, else automatically —
 * yes once they're on a PO for work (not a supplier's bid you took) or have a certificate on file.
 */
export function needsInsurance(v: { insuranceRequired: boolean | null }, workPos: number, certs: number) {
  return v.insuranceRequired ?? (workPos > 0 || certs > 0);
}

const WORK_POS = { where: { bidId: null, status: { not: "VOID" } }, select: { id: true }, take: 1 } as const;

/** Every vendor's insurance state (for lists and the dashboard); `state` is null when you don't need theirs. */
export async function vendorsCoverage() {
  const [company, vendors] = await Promise.all([
    db.company.findFirst({ select: { requiredCoverage: true } }),
    db.vendor.findMany({ include: { insurance: true, purchaseOrders: WORK_POS }, orderBy: { name: "asc" } }),
  ]);
  const required = parseRequired(company?.requiredCoverage);
  return vendors.map((v) => ({
    vendor: v,
    needed: needsInsurance(v, v.purchaseOrders.length, v.insurance.length),
    state: needsInsurance(v, v.purchaseOrders.length, v.insurance.length) ? coverageState(v.insurance, required) : null,
  }));
}

/** One vendor's insurance state — null when there's no vendor or you don't need theirs. */
export async function vendorCoverage(vendorId: string | null) {
  if (!vendorId) return null;
  const [company, v] = await Promise.all([
    db.company.findFirst({ select: { requiredCoverage: true } }),
    db.vendor.findUnique({ where: { id: vendorId }, include: { insurance: true, purchaseOrders: WORK_POS } }),
  ]);
  if (!v || !needsInsurance(v, v.purchaseOrders.length, v.insurance.length)) return null;
  return coverageState(v.insurance, parseRequired(company?.requiredCoverage));
}

/** A vendor by name — the one you have, or a new one (onboarding builds as you go). */
export async function vendorByName(name: string) {
  const clean = name.trim();
  if (!clean) return null;
  const all = await db.vendor.findMany({ select: { id: true, name: true } });
  const have = all.find((v) => v.name.trim().toLowerCase() === clean.toLowerCase());
  return have ?? (await db.vendor.create({ data: { name: clean }, select: { id: true, name: true } }));
}
