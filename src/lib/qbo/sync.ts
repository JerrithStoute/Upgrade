import "server-only";
import { db, systemDb } from "@/lib/db";
import { runAsCompany } from "@/lib/tenant";
import { ifFirst } from "@/lib/job-lock";
import { logActivity } from "@/lib/activity";
import { applyMatches } from "@/lib/qb/sync";
import type { QbListRow } from "@/lib/qb/qbxml";
import { approveBill, markBillPaid } from "@/lib/purchasing";
import { deriveInvoiceStatus, invoiceTotal, paymentsTotal } from "@/lib/finance";
import { QboError, qboApi } from "./client";
import { billData, billPaid, billParts, fingerprint, listRow, paymentData, paymentMethod, type BillData, type PaymentData } from "./shape";

/**
 * One update from QuickBooks Online, for the current company:
 *   1. Lists — vendors, customers & jobs, items, classes — kept as QbListItem, then linked by name
 *      exactly as the Desktop connection does (src/lib/qb/match.ts).
 *   2. Bills — each one on a linked job becomes an approved bill there (one per job when its lines
 *      are on several), its lines the job's actual cost; paid in QuickBooks = paid here.
 *   3. Payments on invoices sent from here — recorded on those invoices.
 * The first time, bills and payments from the last 12 months are read; after that, only what changed.
 * QuickBooks is where bills and payments are kept: here they follow it.
 */

const FIRST_MONTHS = 12;
/** Intuit's "what changed" goes back 30 days; past that, everything in the window is read again. */
const CHANGES_DAYS = 29;

/** A QuickBooks date ("2026-10-28") as a date here (midday, like a date typed in). */
export function fromQbDate(d: string | null | undefined) {
  const [y, m, day] = (d ?? "").split("-").map(Number);
  return y && m && day ? new Date(y, m - 1, day, 12) : new Date();
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export async function syncQboNow(): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const conn = await db.qboConnection.findFirst();
  if (!conn) return { ok: false, error: "QuickBooks Online isn't connected." };
  const done = await ifFirst(`qbo:${conn.companyId}`, 10 * 60_000, async () => {
    try {
      const summary = await syncOnce(conn);
      await db.qboConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null, lastSummary: summary } });
      return { ok: true as const, summary };
    } catch (e) {
      const error = e instanceof QboError ? e.message : "The update stopped partway — it'll try again in a few minutes.";
      if (!(e instanceof QboError)) console.error("[quickbooks online] update failed:", e);
      await db.qboConnection.update({ where: { id: conn.id }, data: { lastError: error } });
      return { ok: false as const, error };
    }
  });
  return done ?? { ok: false, error: "An update is already running — give it a minute." };
}

async function syncOnce(conn: NonNullable<Awaited<ReturnType<typeof db.qboConnection.findFirst>>>) {
  const api = qboApi(conn);
  const started = new Date();

  // 1. Lists.
  const info = await api.call<{ CompanyInfo?: { CompanyName?: string } }>(`companyinfo/${encodeURIComponent(conn.realmId)}`);
  const lists: [QbListRow["kind"], string][] = [
    ["VENDOR", "Vendor"],
    ["CUSTOMER", "Customer"],
    ["ITEM", "Item"],
    ["CLASS", "Class"],
  ];
  for (const [kind, entity] of lists) {
    const rows = await api.queryAll(entity, `SELECT * FROM ${entity} WHERE Active IN (true, false)`);
    for (const r of rows.map((e) => listRow(kind, e)).filter((r): r is QbListRow => !!r)) {
      const data = { name: r.name, fullName: r.fullName, parentListId: r.parentListId, sublevel: r.sublevel, active: r.active, detail: JSON.stringify(r.detail), seenAt: started };
      await db.qbListItem.upsert({ where: { companyId_kind_listId: { companyId: conn.companyId, kind, listId: r.listId } }, create: { kind, listId: r.listId, ...data }, update: data });
    }
  }
  await db.qbListItem.deleteMany({ where: { seenAt: { lt: started } } });
  await applyMatches();
  if (info.CompanyInfo?.CompanyName && info.CompanyInfo.CompanyName !== conn.qbCompany)
    await db.qboConnection.update({ where: { id: conn.id }, data: { qbCompany: info.CompanyInfo.CompanyName } });

  // 2–3. Bills and payments: what changed (or, the first time and after a long gap, the last 12 months).
  const recent = conn.changesSince && started.getTime() - conn.changesSince.getTime() < CHANGES_DAYS * 86_400_000;
  if (recent) {
    const changed = await api.changes(["Bill", "Payment"], conn.changesSince!);
    for (const [kind, entity] of [["BILL", "Bill"], ["PAYMENT", "Payment"]] as const)
      for (const e of changed[entity]) {
        const txnId = String(e.Id ?? "");
        if (!txnId) continue;
        if (e.status === "Deleted") await db.qbTxn.deleteMany({ where: { kind, txnId } });
        else await keepTxn(conn.companyId, kind, e, started);
      }
  } else {
    const from = new Date(started);
    from.setMonth(from.getMonth() - FIRST_MONTHS);
    const day = from.toISOString().slice(0, 10);
    for (const [kind, entity] of [["BILL", "Bill"], ["PAYMENT", "Payment"]] as const) {
      for (const e of await api.queryAll(entity, `SELECT * FROM ${entity} WHERE TxnDate >= '${day}'`)) await keepTxn(conn.companyId, kind, e, started);
      // Anything in the window that QuickBooks no longer has was deleted there.
      await db.qbTxn.deleteMany({ where: { kind, txnDate: { gte: from }, seenAt: { lt: started } } });
    }
  }
  // (Read "changed since" a little before this update started, so nothing slips between.)
  await db.qboConnection.update({ where: { id: conn.id }, data: { changesSince: new Date(started.getTime() - 60_000) } });

  const bills = await applyBills();
  const payments = await applyPayments();
  const said = [bills.changed && `${plural(bills.changed, "bill")} brought in or changed`, payments.changed && `${plural(payments.changed, "payment")} brought in or changed`].filter(Boolean) as string[];
  if (said.length) await logActivity({ type: "quickbooks.synced", description: `QuickBooks Online: ${said.join(", ")}` });
  return said.join(", ") || "Up to date";
}

async function keepTxn(companyId: string, kind: "BILL" | "PAYMENT", e: Record<string, unknown>, seenAt: Date) {
  const txnId = String(e.Id);
  const data: BillData | PaymentData = kind === "BILL" ? billData(e) : paymentData(e);
  const txnDate = fromQbDate(data.date);
  const row = { txnDate, data: JSON.stringify(data), seenAt };
  await db.qbTxn.upsert({ where: { companyId_kind_txnId: { companyId, kind, txnId } }, create: { kind, txnId, ...row }, update: row });
}

async function linkMaps() {
  const [projects, codes, vendors] = await Promise.all([
    db.project.findMany({ where: { qbListId: { not: null }, isTemplate: false, isSample: false }, select: { id: true, qbListId: true } }),
    db.costCode.findMany({ where: { qbListId: { not: null } }, select: { id: true, qbListId: true } }),
    db.vendor.findMany({ where: { qbListId: { not: null } }, select: { id: true, qbListId: true } }),
  ]);
  const job = new Map(projects.map((p) => [p.qbListId!, p.id]));
  const code = new Map(codes.map((c) => [c.qbListId!, c.id]));
  const vendor = new Map(vendors.map((v) => [v.qbListId!, v.id]));
  return { jobOf: (id: string) => job.get(id) ?? null, codeOf: (id: string) => code.get(id) ?? null, vendorOf: (id: string | null) => (id ? (vendor.get(id) ?? null) : null) };
}

/**
 * Puts each QuickBooks bill on its jobs here — only the ones that changed (in QuickBooks, or in which
 * jobs and cost codes they land on). Bills gone from QuickBooks are taken off.
 */
export async function applyBills() {
  const { jobOf, codeOf, vendorOf } = await linkMaps();
  const txns = await db.qbTxn.findMany({ where: { kind: "BILL" } });
  let changed = 0;
  for (const t of txns) {
    const b = JSON.parse(t.data) as BillData;
    const { parts } = billParts(b, jobOf, codeOf);
    const vendorId = vendorOf(b.vendorId);
    const key = fingerprint({ b, parts, vendorId });
    if (key === t.appliedKey) continue;
    await db.vendorBill.deleteMany({ where: { qbTxnId: t.txnId } });
    for (const p of parts) {
      const bill = await db.vendorBill.create({
        data: {
          projectId: p.projectId,
          vendorId,
          vendorName: b.vendorName,
          billNumber: b.number,
          billDate: fromQbDate(b.date),
          dueDate: b.due ? fromQbDate(b.due) : null,
          notes: b.note,
          qbTxnId: t.txnId,
          lines: { create: p.lines.map((l, i) => ({ ...l, sortOrder: i })) },
        },
      });
      // Entered in QuickBooks = already approved there: its cost goes on the job.
      await approveBill(bill.id, null);
      if (billPaid(b)) await markBillPaid(bill.id, { date: new Date(), method: null, reference: "Paid in QuickBooks" });
    }
    await db.qbTxn.update({ where: { id: t.id }, data: { appliedKey: key } });
    if (parts.length) changed++;
  }
  // Bills deleted in QuickBooks.
  const kept = new Set(txns.map((t) => t.txnId));
  const here = await db.vendorBill.findMany({ where: { qbTxnId: { not: null } }, select: { id: true, qbTxnId: true } });
  const gone = here.filter((b) => !kept.has(b.qbTxnId!));
  if (gone.length) await db.vendorBill.deleteMany({ where: { id: { in: gone.map((b) => b.id) } } });
  return { changed: changed + new Set(gone.map((b) => b.qbTxnId)).size };
}

/** QuickBooks bills on customers not linked to a job here — by customer, for "Bills waiting for a job". */
export async function billsWaiting() {
  const { jobOf, codeOf } = await linkMaps();
  const out = new Map<string, { customerId: string; customerName: string; bills: number; amount: number; latest: string }>();
  for (const t of await db.qbTxn.findMany({ where: { kind: "BILL" } })) {
    const b = JSON.parse(t.data) as BillData;
    for (const w of billParts(b, jobOf, codeOf).waiting) {
      const row = out.get(w.customerId) ?? { customerId: w.customerId, customerName: w.customerName, bills: 0, amount: 0, latest: "" };
      row.bills++;
      row.amount = Math.round((row.amount + w.amount) * 100) / 100;
      if (b.date > row.latest) row.latest = b.date;
      out.set(w.customerId, row);
    }
  }
  return [...out.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}

/** Payments received in QuickBooks on invoices sent from here: recorded on those invoices. */
export async function applyPayments() {
  const txns = await db.qbTxn.findMany({ where: { kind: "PAYMENT" } });
  const invoices = await db.invoice.findMany({ where: { qbTxnId: { not: null } }, select: { id: true, qbTxnId: true } });
  const invoiceOf = new Map(invoices.map((i) => [i.qbTxnId!, i.id]));
  const touched = new Set<string>();
  let changed = 0;
  for (const t of txns) {
    const p = JSON.parse(t.data) as PaymentData;
    const links = p.links.map((l) => ({ ...l, invoice: invoiceOf.get(l.invoiceId) })).filter((l) => l.invoice);
    const key = fingerprint({ p, links });
    if (key === t.appliedKey) continue;
    for (const old of await db.payment.findMany({ where: { qbTxnId: t.txnId }, select: { invoiceId: true } })) touched.add(old.invoiceId);
    await db.payment.deleteMany({ where: { qbTxnId: t.txnId } });
    for (const l of links) {
      await db.payment.create({ data: { invoiceId: l.invoice!, amount: l.amount, date: fromQbDate(p.date), method: paymentMethod(p.method), reference: p.reference, qbTxnId: t.txnId } });
      touched.add(l.invoice!);
    }
    await db.qbTxn.update({ where: { id: t.id }, data: { appliedKey: key } });
    if (links.length) changed++;
  }
  // Payments deleted in QuickBooks.
  const kept = new Set(txns.map((t) => t.txnId));
  for (const old of await db.payment.findMany({ where: { qbTxnId: { not: null } }, select: { id: true, invoiceId: true, qbTxnId: true } }))
    if (!kept.has(old.qbTxnId!)) {
      await db.payment.delete({ where: { id: old.id } });
      touched.add(old.invoiceId);
      changed++;
    }
  for (const id of touched) await settleInvoice(id);
  return { changed };
}

/** An invoice's status after its payments changed (all paid back off: back to Sent). */
async function settleInvoice(invoiceId: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { items: true, payments: true } });
  if (!inv || inv.status === "VOID" || inv.status === "DRAFT") return;
  const paid = paymentsTotal(inv.payments);
  const next = paid <= 0 ? "SENT" : deriveInvoiceStatus("SENT", invoiceTotal(inv.items), paid);
  if (next !== inv.status) await db.invoice.update({ where: { id: invoiceId }, data: { status: next } });
}

/** Every 15 minutes, each company connected to QuickBooks Online is brought up to date. */
export function startQboSync() {
  const g = globalThis as unknown as { __qboTimer?: ReturnType<typeof setInterval> };
  if (g.__qboTimer) return; // dev reloads re-run register()
  const check = async () => {
    for (const c of await systemDb.qboConnection.findMany({ select: { companyId: true } }).catch(() => []))
      await runAsCompany(c.companyId, () => syncQboNow()).catch((err) => console.error(`[quickbooks online] company ${c.companyId} failed:`, err));
  };
  setTimeout(check, 120_000); // let the server finish starting
  g.__qboTimer = setInterval(check, 15 * 60_000);
}
