import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db, systemDb } from "@/lib/db";
import { runAsCompany } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { recordFailure, retryAfter } from "@/lib/rate-limit";
import { LIST_STEPS, listRequest, readListReply } from "./qbxml";
import { planCostCodes, planJobs, planVendors, type QbEntry } from "./match";
import { cleanVendorName } from "@/lib/vendors";
import { renameVendorEverywhere } from "@/lib/vendor-list";

/**
 * One Web Connector session (the Web Connector on the QuickBooks computer calls /api/qbwc):
 *   authenticate → sendRequestXML / receiveResponseXML, once per list page → closeConnection.
 * Each sync reads QuickBooks' lists (company, vendors, customers & jobs, items, classes), keeps
 * them (QbListItem), then links vendors, jobs and cost codes (match.ts). It only reads
 * QuickBooks — nothing is written there.
 *
 * Where it's at between calls is kept on the connection (ticketState), not in memory, so a
 * restart in the middle doesn't lose the place.
 */

type State = { step: number; iteratorId: string | null; startedAt: string };

const TICKET_HOURS = 2;

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
  if (retryAfter(key, 10) > 0) return ["", "nvu"];
  const c = username ? await systemDb.qbConnection.findUnique({ where: { username } }) : null;
  if (!c || !(await bcrypt.compare(password, c.passwordHash))) {
    recordFailure(key, 15 * 60_000);
    return ["", "nvu"];
  }
  const ticket = randomBytes(24).toString("hex");
  const state: State = { step: 0, iteratorId: null, startedAt: new Date().toISOString() };
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
  return listRequest(LIST_STEPS[Math.min(s.step, LIST_STEPS.length - 1)], s.iteratorId);
}

/** receiveResponseXML: QuickBooks' answer. Returns how far along (100 = done; below 0 = stopped). */
export async function qbTakeResponse(ticket: string, response: string, hresult: string, message: string): Promise<number> {
  const c = await byTicket(ticket);
  if (!c) return -1;
  const fail = async (why: string) => {
    await systemDb.qbConnection.update({ where: { id: c.id }, data: { ticketState: JSON.stringify({ ...stateOf(c.ticketState), step: LIST_STEPS.length }), lastError: why } });
    return -1;
  };
  if (hresult) return fail(`QuickBooks couldn't answer: ${message || hresult}`);
  const s = stateOf(c.ticketState);
  const step = LIST_STEPS[s.step];
  if (!step) return 100;
  let reply;
  try {
    reply = readListReply(step, response);
  } catch {
    return fail("QuickBooks' answer couldn't be read.");
  }
  if (!reply.ok) return fail(`QuickBooks said: ${reply.error}`);

  const seenAt = new Date();
  await runAsCompany(c.companyId, async () => {
    for (const r of reply.rows) {
      const data = { name: r.name, fullName: r.fullName, parentListId: r.parentListId, sublevel: r.sublevel, active: r.active, detail: JSON.stringify(r.detail), seenAt };
      await db.qbListItem.upsert({ where: { companyId_kind_listId: { companyId: c.companyId, kind: r.kind, listId: r.listId } }, create: { kind: r.kind, listId: r.listId, ...data }, update: data });
    }
  });
  if (step === "company" && reply.companyName) await systemDb.qbConnection.update({ where: { id: c.id }, data: { qbCompany: reply.companyName } });

  const next: State = reply.iteratorId ? { ...s, iteratorId: reply.iteratorId } : { ...s, step: s.step + 1, iteratorId: null };
  if (next.step < LIST_STEPS.length) {
    await systemDb.qbConnection.update({ where: { id: c.id }, data: { ticketState: JSON.stringify(next) } });
    return Math.max(1, Math.min(99, Math.round((next.step / LIST_STEPS.length) * 100)));
  }

  // All read: anything QuickBooks didn't list this time is gone from it. Then link things up.
  await runAsCompany(c.companyId, async () => {
    await db.qbListItem.deleteMany({ where: { seenAt: { lt: new Date(s.startedAt) } } });
    await applyMatches();
  });
  await systemDb.qbConnection.update({ where: { id: c.id }, data: { ticket: null, ticketState: null, lastSyncAt: new Date(), lastError: null } });
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

  const jobs = planJobs(of("CUSTOMER"), await db.project.findMany({ select: { id: true, name: true, qbListId: true } }));
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
