import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db, systemDb } from "@/lib/db";
import { runAsCompany } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { recordFailure, retryAfter } from "@/lib/rate-limit";
import { LIST_STEPS, billRequest, deletedBillsRequest, listRequest, readBillReply, readDeletedReply, readListReply, type BillsFrom, type ListStep } from "./qbxml";
import { planCostCodes, planJobs, planVendors, type QbEntry } from "./match";
import { cleanVendorName } from "@/lib/vendors";
import { renameVendorEverywhere } from "@/lib/vendor-list";
import { fromQbDate } from "@/lib/qbo/shape";

/**
 * One Web Connector session (the Web Connector on the QuickBooks computer calls /api/qbwc):
 *   authenticate → sendRequestXML / receiveResponseXML, once per list page → closeConnection.
 * Each sync reads QuickBooks' lists (company, vendors, customers & jobs, items, classes), keeps
 * them (QbListItem), then links vendors, jobs and cost codes (match.ts). Then bills: the first
 * time, the last 12 months; after that, the ones added, changed or deleted since the last update.
 * They go on their jobs here the same way as from QuickBooks Online (qbo/sync.ts applyBills). It
 * only reads QuickBooks — nothing is written there.
 *
 * Where it's at between calls is kept on the connection (ticketState), not in memory, so a
 * restart in the middle doesn't lose the place.
 */

/** What a sync asks for, in order: the lists, then bills, then (on a later update) bills deleted since. */
const STEPS = [...LIST_STEPS, "bills", "deleted"] as const;
type Step = (typeof STEPS)[number];

type State = { step: number; iteratorId: string | null; startedAt: string; bills?: BillsFrom };

const TICKET_HOURS = 2;
const FIRST_MONTHS = 12;
/** QuickBooks keeps its list of deleted bills for 90 days: after a longer gap, the 12 months are read again. */
const CHANGES_DAYS = 80;

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Where this sync's bill read starts (a day back from the last one, so nothing slips between). */
function billsFrom(since: Date | null, now: Date): BillsFrom {
  if (since && now.getTime() - since.getTime() < CHANGES_DAYS * 86_400_000) return { changedSince: day(new Date(since.getTime() - 86_400_000)) };
  const from = new Date(now);
  from.setMonth(from.getMonth() - FIRST_MONTHS);
  return { datedFrom: day(from) };
}

const request = (step: Step, s: State) =>
  step === "bills" ? billRequest(s.bills!, s.iteratorId) : step === "deleted" ? deletedBillsRequest("changedSince" in s.bills! ? s.bills.changedSince : day(new Date())) : listRequest(step, s.iteratorId);

const byTicket = async (ticket: string) => {
  if (!ticket) return null;
  const c = await systemDb.qbConnection.findUnique({ where: { ticket } });
  if (!c?.ticketAt || Date.now() - c.ticketAt.getTime() > TICKET_HOURS * 3600_000) return null;
  return c;
};
const stateOf = (s: string | null): State => {
  try {
    return { step: 0, iteratorId: null, startedAt: new Date().toISOString(), ...(s ? JSON.parse(s) : {}) };
  } catch {
    return { step: 0, iteratorId: null, startedAt: new Date().toISOString() };
  }
};

/** Same file? (QuickBooks may give a path with different capitals or slashes.) */
const sameFile = (a: string, b: string) => a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();

/** authenticate: [ticket, ""] — "" = whichever company file is open; "nvu" = not a valid user. */
export async function qbAuthenticate(username: string, password: string): Promise<string[]> {
  const key = `qbwc:${username}`;
  if (await retryAfter(key, 10) > 0) return ["", "nvu"];
  const c = username ? await systemDb.qbConnection.findUnique({ where: { username } }) : null;
  if (!c || !(await bcrypt.compare(password, c.passwordHash))) {
    await recordFailure(key, 15 * 60_000);
    return ["", "nvu"];
  }
  const ticket = randomBytes(24).toString("hex");
  const now = new Date();
  const state: State = { step: 0, iteratorId: null, startedAt: now.toISOString(), bills: billsFrom(c.billsSince, now) };
  await systemDb.qbConnection.update({ where: { id: c.id }, data: { ticket, ticketState: JSON.stringify(state), ticketAt: new Date() } });
  // Once tied to a company file, name it: the Web Connector opens that one (and no other).
  return [ticket, c.companyFile ?? ""];
}

/** sendRequestXML: the next request for QuickBooks, or "" when there's nothing to ask (getLastError says why). */
export async function qbNextRequest(ticket: string, companyFile: string): Promise<string> {
  const c = await byTicket(ticket);
  if (!c) return "";
  if (c.companyFile && companyFile && !sameFile(c.companyFile, companyFile)) {
    // (The ticket stays until closeConnection: the Web Connector asks getLastError for the why.)
    await systemDb.qbConnection.update({
      where: { id: c.id },
      data: { lastError: `QuickBooks has a different company file open (${companyFile}). This connection belongs to ${c.companyFile} — open that file, then update again.` },
    });
    return "";
  }
  if (!c.companyFile && companyFile) await systemDb.qbConnection.update({ where: { id: c.id }, data: { companyFile } });
  const s = stateOf(c.ticketState);
  if (!s.bills) s.bills = billsFrom(c.billsSince, new Date());
  return request(STEPS[Math.min(s.step, STEPS.length - 1)], s);
}

/** receiveResponseXML: QuickBooks' answer. Returns how far along (100 = done; below 0 = stopped). */
export async function qbTakeResponse(ticket: string, response: string, hresult: string, message: string): Promise<number> {
  const c = await byTicket(ticket);
  if (!c) return -1;
  const fail = async (why: string) => {
    await systemDb.qbConnection.update({ where: { id: c.id }, data: { ticketState: JSON.stringify({ ...stateOf(c.ticketState), step: STEPS.length }), lastError: why } });
    return -1;
  };
  if (hresult) return fail(`QuickBooks couldn't answer: ${message || hresult}`);
  const s = stateOf(c.ticketState);
  if (!s.bills) s.bills = billsFrom(c.billsSince, new Date());
  const step = STEPS[s.step];
  if (!step) return 100;
  const seenAt = new Date();
  let iteratorId: string | undefined;
  try {
    if (step === "bills") {
      const reply = readBillReply(response);
      if (!reply.ok) return fail(`QuickBooks said: ${reply.error}`);
      await runAsCompany(c.companyId, async () => {
        for (const b of reply.bills) {
          const row = { txnDate: fromQbDate(b.data.date), data: JSON.stringify(b.data), seenAt };
          await db.qbTxn.upsert({ where: { companyId_kind_txnId: { companyId: c.companyId, kind: "BILL", txnId: b.txnId } }, create: { kind: "BILL", txnId: b.txnId, ...row }, update: row });
        }
      });
      iteratorId = reply.iteratorId;
    } else if (step === "deleted") {
      const reply = readDeletedReply(response);
      if (!reply.ok) return fail(`QuickBooks said: ${reply.error}`);
      if (reply.txnIds.length) await runAsCompany(c.companyId, () => db.qbTxn.deleteMany({ where: { kind: "BILL", txnId: { in: reply.txnIds } } }));
    } else {
      const reply = readListReply(step as ListStep, response);
      if (!reply.ok) return fail(`QuickBooks said: ${reply.error}`);
      await runAsCompany(c.companyId, async () => {
        for (const r of reply.rows) {
          const data = { name: r.name, fullName: r.fullName, parentListId: r.parentListId, sublevel: r.sublevel, active: r.active, detail: JSON.stringify(r.detail), seenAt };
          await db.qbListItem.upsert({ where: { companyId_kind_listId: { companyId: c.companyId, kind: r.kind, listId: r.listId } }, create: { kind: r.kind, listId: r.listId, ...data }, update: data });
        }
      });
      if (step === "company" && reply.companyName) await systemDb.qbConnection.update({ where: { id: c.id }, data: { qbCompany: reply.companyName } });
      iteratorId = reply.iteratorId;
    }
  } catch {
    return fail("QuickBooks' answer couldn't be read.");
  }

  let next: State = iteratorId ? { ...s, iteratorId } : { ...s, step: s.step + 1, iteratorId: null };
  // The first time (12 months read in full) there's nothing to ask about deletions: what wasn't read is gone.
  if (STEPS[next.step] === "deleted" && !("changedSince" in s.bills)) next = { ...next, step: next.step + 1 };
  if (next.step < STEPS.length) {
    await systemDb.qbConnection.update({ where: { id: c.id }, data: { ticketState: JSON.stringify(next) } });
    return Math.max(1, Math.min(99, Math.round((next.step / STEPS.length) * 100)));
  }

  // All read: anything QuickBooks didn't list this time is gone from it. Then link things up and put bills on their jobs.
  const started = new Date(s.startedAt);
  let summary = "Up to date";
  await runAsCompany(c.companyId, async () => {
    await db.qbListItem.deleteMany({ where: { seenAt: { lt: started } } });
    if ("datedFrom" in s.bills!) await db.qbTxn.deleteMany({ where: { kind: "BILL", txnDate: { gte: fromQbDate(s.bills!.datedFrom) }, seenAt: { lt: started } } });
    await applyMatches();
    const { applyBills } = await import("@/lib/qbo/sync");
    const bills = await applyBills();
    if (bills.changed) {
      summary = `${bills.changed} bill${bills.changed === 1 ? "" : "s"} brought in or changed`;
      await logActivity({ type: "quickbooks.synced", description: `QuickBooks: ${summary}` });
    }
  });
  await systemDb.qbConnection.update({
    where: { id: c.id },
    data: { ticket: null, ticketState: null, lastSyncAt: new Date(), lastError: null, lastSummary: summary, billsSince: started },
  });
  return 100;
}

/** connectionError: the Web Connector couldn't reach QuickBooks (not open, wrong file, not allowed). */
export async function qbConnectionError(ticket: string, hresult: string, message: string) {
  const c = await byTicket(ticket);
  if (c) await systemDb.qbConnection.update({ where: { id: c.id }, data: { lastError: `The Web Connector couldn't open QuickBooks: ${message || hresult}` } });
  return "done";
}

export async function qbLastError(ticket: string) {
  const c = ticket ? await systemDb.qbConnection.findUnique({ where: { ticket }, select: { lastError: true } }) : null;
  return c?.lastError || "Nothing to do.";
}

export async function qbClose(ticket: string) {
  const c = ticket ? await systemDb.qbConnection.findUnique({ where: { ticket } }) : null;
  if (c) await systemDb.qbConnection.update({ where: { id: c.id }, data: { ticket: null } });
  return "The Builder Station is up to date.";
}

const entries = (rows: { listId: string; name: string; fullName: string; parentListId: string | null; sublevel: number; active: boolean; detail: string | null }[]): QbEntry[] =>
  rows.map((r) => {
    let detail: Record<string, string> = {};
    try {
      detail = r.detail ? JSON.parse(r.detail) : {};
    } catch {}
    return { ...r, detail };
  });

/** Links vendors, jobs and cost codes to what QuickBooks has (the current company). */
export async function applyMatches() {
  const list = await db.qbListItem.findMany();
  const of = (kind: string) => entries(list.filter((r) => r.kind === kind));

  const vendors = planVendors(of("VENDOR"), await db.vendor.findMany({ select: { id: true, name: true, qbListId: true } }));
  for (const l of vendors.link) await db.vendor.update({ where: { id: l.vendorId }, data: { qbListId: l.listId } });
  for (const r of vendors.rename) {
    await db.vendor.update({ where: { id: r.vendorId }, data: { name: cleanVendorName(r.name) } });
    await renameVendorEverywhere(r.vendorId, r.from, cleanVendorName(r.name));
  }
  for (const v of vendors.create)
    await db.vendor.create({ data: { name: cleanVendorName(v.name), contact: v.contact?.slice(0, 120), phone: v.phone?.slice(0, 60), email: v.email?.slice(0, 200), qbListId: v.listId } });

  const jobs = planJobs(of("CUSTOMER"), await db.project.findMany({ where: { isTemplate: false, isSample: false }, select: { id: true, name: true, qbListId: true } }));
  for (const l of jobs.link) await db.project.update({ where: { id: l.projectId }, data: { qbListId: l.listId } });

  const codes = planCostCodes(of("ITEM"), await db.costCode.findMany({ select: { id: true, code: true, qbListId: true } }));
  for (const l of codes.link) await db.costCode.update({ where: { id: l.costCodeId }, data: { qbListId: l.listId } });

  const said = [
    vendors.create.length && `${vendors.create.length} vendor${vendors.create.length === 1 ? "" : "s"} added`,
    vendors.link.length && `${vendors.link.length} vendor${vendors.link.length === 1 ? "" : "s"} linked`,
    jobs.link.length && `${jobs.link.length} job${jobs.link.length === 1 ? "" : "s"} linked`,
    codes.link.length && `${codes.link.length} cost code${codes.link.length === 1 ? "" : "s"} linked`,
  ].filter(Boolean);
  if (said.length) await logActivity({ type: "quickbooks.synced", description: `QuickBooks: ${said.join(", ")}` });
  return { vendors, jobs, codes };
}
