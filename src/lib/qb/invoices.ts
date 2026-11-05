import "server-only";
import { db } from "@/lib/db";
import { taxProblem, type BillData, type InvoiceOut } from "@/lib/qbo/shape";
import { invoiceAddRequest, invoiceModRequest, invoiceQueryRequest, invoiceVoidRequest, readInvoiceReply } from "./qbxml";

/**
 * Invoices to QuickBooks Desktop. QuickBooks can only be reached when its Web Connector calls in
 * (sync.ts), so sending one here only marks it waiting (qbPending); on the next update each waiting
 * invoice goes: a new one is added, one already there follows (number, dates, memo), a void one is
 * voided. Never in the way: if QuickBooks can't take one, the invoice is still sent here, and it
 * shows why with "Send to QuickBooks again".
 */

/** One invoice's next request: add, find (for its EditSequence) then change, or void. */
export type InvoiceJob = { id: string; stage: "add" | "find" | "mod" | "void"; editSequence?: string };

/** Marks an invoice to go to (or follow in) QuickBooks Desktop on the next update. */
export async function queueInvoice(invoiceId: string) {
  await db.invoice.update({ where: { id: invoiceId }, data: { qbPending: true, qbError: null } });
}

const load = (id: string) =>
  db.invoice.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { qbListId: true } } } }, project: { select: { qbListId: true, name: true, isSample: true } } },
  });

const out = (inv: NonNullable<Awaited<ReturnType<typeof load>>>): InvoiceOut => ({ ...inv, items: inv.items.map((i) => ({ ...i, itemId: i.costCode?.qbListId ?? null })) });

const settle = (id: string, data: { qbError?: string | null; qbTxnId?: string; qbSyncToken?: string | null; qbSentAt?: Date }) =>
  db.invoice.update({ where: { id }, data: { qbPending: false, ...data } });

/**
 * The next waiting invoice that can go (skipping `tried` — already done this update). One that can't —
 * no customer linked, a line with no item, sales tax — is taken off the wait with the reason on it.
 */
export async function nextInvoiceJob(tried: string[]): Promise<InvoiceJob | null> {
  const conn = await db.qbConnection.findFirst({ select: { invoiceItemId: true } });
  if (!conn) return null;
  for (;;) {
    const next = await db.invoice.findFirst({ where: { qbPending: true, id: { notIn: tried } }, orderBy: { number: "asc" }, select: { id: true } });
    if (!next) return null;
    const inv = await load(next.id);
    if (!inv) continue;
    // (Drafts and the practice job never go; a void that never went has nothing to void.)
    if (inv.status === "DRAFT" || inv.project.isSample || (inv.status === "VOID" && !inv.qbTxnId)) {
      await settle(inv.id, {});
      continue;
    }
    if (inv.status === "VOID") return { id: inv.id, stage: "void" };
    if (inv.qbTxnId) return { id: inv.id, stage: "find" };
    const problem = !inv.project.qbListId
      ? `${inv.project.name} isn't linked to a QuickBooks customer yet — link it in Settings → QuickBooks, then send it again.`
      : !conn.invoiceItemId && out(inv).items.some((i) => !i.isTax && !i.itemId)
        ? "A line has no cost code linked to a QuickBooks item. Pick its cost code on the invoice, or pick the QuickBooks item lines without one go on (Settings → QuickBooks), then send it again."
        : taxProblem(out(inv));
    if (problem) {
      await settle(inv.id, { qbError: problem });
      continue;
    }
    return { id: inv.id, stage: "add" };
  }
}

/** The job's class in QuickBooks: the one most of its bills' lines are on (null when none, or it's gone). */
export async function jobClass(customerId: string): Promise<string | null> {
  const count = new Map<string, number>();
  for (const t of await db.qbTxn.findMany({ where: { kind: "BILL" }, select: { data: true } })) {
    for (const l of (JSON.parse(t.data) as BillData).lines) if (l.customerId === customerId && l.classId) count.set(l.classId, (count.get(l.classId) ?? 0) + 1);
  }
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  if (!best) return null;
  const cls = await db.qbListItem.findFirst({ where: { kind: "CLASS", listId: best[0], active: true }, select: { listId: true } });
  return cls?.listId ?? null;
}

/** The request for a job ("" when the invoice is gone — the caller moves on). */
export async function invoiceRequest(job: InvoiceJob): Promise<string> {
  const inv = await load(job.id);
  if (!inv) return "";
  if (job.stage === "void") return invoiceVoidRequest(inv.qbTxnId!);
  if (job.stage === "find") return invoiceQueryRequest(inv.qbTxnId!);
  if (job.stage === "mod") return invoiceModRequest(out(inv), inv.qbTxnId!, job.editSequence ?? "");
  const conn = await db.qbConnection.findFirst({ select: { invoiceItemId: true, classFromBills: true } });
  // The job's class only when the builder's classes are their jobs (Settings → QuickBooks → Invoices).
  const classId = conn?.classFromBills ? await jobClass(inv.project.qbListId!) : null;
  return invoiceAddRequest(out(inv), { customerId: inv.project.qbListId!, itemId: conn?.invoiceItemId ?? null, classId });
}

/** QuickBooks' answer to a job: kept on the invoice. Returns the job's next step (find → change), if any. */
export async function takeInvoiceReply(job: InvoiceJob, xml: string): Promise<InvoiceJob | null> {
  let reply;
  try {
    reply = readInvoiceReply(xml);
  } catch {
    reply = { ok: false, error: "its answer couldn't be read" };
  }
  if (!reply.ok) {
    await settle(job.id, { qbError: `QuickBooks said: ${reply.error}` });
    return null;
  }
  if (job.stage === "find") return { id: job.id, stage: "mod", editSequence: reply.editSequence };
  if (job.stage === "add") await settle(job.id, { qbTxnId: reply.txnId, qbSyncToken: reply.editSequence ?? null, qbSentAt: new Date(), qbError: null });
  else await settle(job.id, { qbSyncToken: reply.editSequence ?? null, qbError: null });
  return null;
}

/** QuickBooks couldn't take the request at all (not even to refuse it): kept on the invoice. */
export async function invoiceRefused(job: InvoiceJob, why: string) {
  await settle(job.id, { qbError: `QuickBooks said: ${why}` });
}
