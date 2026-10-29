import "server-only";
import { db } from "@/lib/db";
import { QboError, qboApi } from "./client";
import { invoiceBody, taxProblem } from "./shape";

/**
 * Invoices go to QuickBooks Online when they're sent (and follow when their dates or notes change,
 * or they're voided). Never in the way: if QuickBooks can't take one, the invoice is still sent here,
 * and it shows why with a "Send to QuickBooks again" button.
 */

/** Sends (or updates) an invoice in QuickBooks. Returns the problem, if there was one (also kept on the invoice). */
export async function pushInvoice(invoiceId: string): Promise<string | null> {
  const conn = await db.qboConnection.findFirst();
  if (!conn) return null;
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { items: { orderBy: { sortOrder: "asc" } }, project: { select: { qbListId: true, name: true, isSample: true } } } });
  // (The sample job never goes to QuickBooks.)
  if (!inv || inv.status === "DRAFT" || inv.project.isSample) return null;
  const fail = async (why: string) => {
    await db.invoice.update({ where: { id: invoiceId }, data: { qbError: why } });
    return why;
  };
  if (inv.status === "VOID" && !inv.qbTxnId) return null;
  try {
    const api = qboApi(conn);
    if (inv.status === "VOID") {
      const j = await api.call<{ Invoice?: { SyncToken?: string } }>("invoice", { method: "POST", query: { operation: "void" }, body: { Id: inv.qbTxnId, SyncToken: await freshToken(api, inv.qbTxnId!) } });
      await db.invoice.update({ where: { id: invoiceId }, data: { qbSyncToken: j.Invoice?.SyncToken ?? null, qbError: null } });
      return null;
    }
    if (!inv.project.qbListId) return fail(`${inv.project.name} isn't linked to a QuickBooks customer yet — link it in Settings → QuickBooks, then send it again.`);
    if (!conn.invoiceItemId) return fail("Pick the QuickBooks item invoice lines go on (Settings → QuickBooks), then send it again.");
    const tax = taxProblem(inv);
    if (tax) return fail(tax);
    const body = invoiceBody(inv, inv.project.qbListId, conn.invoiceItemId);
    // Already there: only its number, dates and notes (its lines can't change here once sent — and
    // anything added in QuickBooks, like a class on each line, stays).
    const header = { DocNumber: body.DocNumber, TxnDate: body.TxnDate, DueDate: body.DueDate, CustomerMemo: body.CustomerMemo, PrivateNote: body.PrivateNote };
    const j = inv.qbTxnId
      ? await api.call<{ Invoice?: { Id?: string; SyncToken?: string } }>("invoice", { method: "POST", body: { ...header, sparse: true, Id: inv.qbTxnId, SyncToken: await freshToken(api, inv.qbTxnId) } })
      : await api.call<{ Invoice?: { Id?: string; SyncToken?: string } }>("invoice", { method: "POST", body });
    await db.invoice.update({
      where: { id: invoiceId },
      data: { qbTxnId: j.Invoice?.Id ?? inv.qbTxnId, qbSyncToken: j.Invoice?.SyncToken ?? null, qbSentAt: inv.qbSentAt ?? new Date(), qbError: null },
    });
    return null;
  } catch (e) {
    if (!(e instanceof QboError)) console.error("[quickbooks online] invoice failed:", e);
    return fail(e instanceof QboError ? `QuickBooks said: ${e.message}` : "QuickBooks couldn't be reached — try again in a minute.");
  }
}

/** The invoice's SyncToken in QuickBooks now (it changes whenever anyone edits it there). */
async function freshToken(api: ReturnType<typeof qboApi>, id: string) {
  const j = await api.call<{ Invoice?: { SyncToken?: string } }>(`invoice/${encodeURIComponent(id)}`);
  return j.Invoice?.SyncToken ?? "0";
}

/** Whether payments for this invoice come from QuickBooks (and so aren't recorded by hand here). */
export async function paymentsFromQuickBooks(inv: { qbTxnId: string | null }) {
  return !!inv.qbTxnId && !!(await db.qboConnection.findFirst({ select: { id: true } }));
}
