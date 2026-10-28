"use server";

import { revalidatePath } from "next/cache";
import { friendly } from "@/lib/friendly-action";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { asWholeCompany } from "@/lib/tenant";
import { str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { hashQbPassword, newConnectionFields, newPassword } from "@/lib/qb/connection";
import { applyMatches } from "@/lib/qb/sync";
import { costableItem, jobChoices, type QbEntry } from "@/lib/qb/match";
import { revoke } from "@/lib/qbo/client";
import { applyBills, syncQboNow } from "@/lib/qbo/sync";

const PATH = "/settings/quickbooks";

export type PasswordState = { password?: string; error?: string } | undefined;

/** Sets up the connection. Its password is made at the step that needs it (newQuickBooksPassword). */
export const setUpQuickBooks = friendly(async function setUpQuickBooks() {
  const me = await requireEdit("quickbooks");
  if (await db.qbConnection.findFirst({ select: { id: true } })) return;
  if (await db.qboConnection.findFirst({ select: { id: true } })) throw new Error("QuickBooks Online is connected — disconnect it first to use QuickBooks Desktop instead");
  // A password no one has seen: the Web Connector can't sign in until one is made for it.
  await db.qbConnection.create({ data: { ...newConnectionFields(), passwordHash: await hashQbPassword(newPassword()) } });
  await logActivity({ userId: me.id, type: "quickbooks.connected", description: `${me.name} set up the QuickBooks connection` });
  revalidatePath(PATH);
});

/** A new Web Connector password (the old one stops working). */
export async function newQuickBooksPassword(): Promise<PasswordState> {
  await requireEdit("quickbooks");
  const c = await db.qbConnection.findFirst({ select: { id: true } });
  if (!c) return { error: "Set up the connection first." };
  const password = newPassword();
  await db.qbConnection.update({ where: { id: c.id }, data: { passwordHash: await hashQbPassword(password), ticket: null } });
  return { password };
}

/** Disconnect: the Web Connector can't sign in any more, and nothing here stays linked to QuickBooks. */
export const disconnectQuickBooks = friendly(async function disconnectQuickBooks() {
  const me = await requireEdit("quickbooks");
  await db.qbConnection.deleteMany({});
  await db.qbListItem.deleteMany({});
  await db.vendor.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await db.project.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await db.costCode.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await logActivity({ userId: me.id, type: "quickbooks.disconnected", description: `${me.name} disconnected QuickBooks` });
  revalidatePath(PATH);
});

/**
 * Disconnect QuickBooks Online: Intuit is told to let go, and nothing here stays linked. Bills and
 * payments already brought in stay — as ordinary ones you can change here.
 */
export const disconnectQuickBooksOnline = friendly(async function disconnectQuickBooksOnline() {
  const me = await requireEdit("quickbooks");
  const conn = await db.qboConnection.findFirst();
  if (conn) await revoke(conn.refreshToken);
  await db.qboConnection.deleteMany({});
  await db.qbListItem.deleteMany({});
  await db.qbTxn.deleteMany({});
  await db.vendor.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await db.project.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await db.costCode.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await db.vendorBill.updateMany({ where: { qbTxnId: { not: null } }, data: { qbTxnId: null } });
  await db.payment.updateMany({ where: { qbTxnId: { not: null } }, data: { qbTxnId: null } });
  await db.invoice.updateMany({ where: { OR: [{ qbTxnId: { not: null } }, { qbError: { not: null } }] }, data: { qbTxnId: null, qbSyncToken: null, qbError: null } });
  await logActivity({ userId: me.id, type: "quickbooks.disconnected", description: `${me.name} disconnected QuickBooks Online` });
  revalidatePath(PATH);
});

export type UpdateState = { ok?: string; error?: string } | undefined;

/** Update from QuickBooks Online now (it also updates on its own every 15 minutes). */
export async function updateFromQuickBooksOnline(): Promise<UpdateState> {
  await requireEdit("quickbooks");
  const r = await syncQboNow();
  revalidatePath(PATH);
  return r.ok ? { ok: r.summary === "Up to date" ? "Up to date." : `Done — ${r.summary}.` } : { error: r.error };
}

/** The QuickBooks item invoice lines go out on. */
export const setInvoiceItem = friendly(async function setInvoiceItem(fd: FormData) {
  await requireEdit("quickbooks");
  const listId = str(fd, "listId") || null;
  if (listId) {
    const item = await db.qbListItem.findFirst({ where: { kind: "ITEM", listId } });
    if (!item || !item.active) throw new Error("That isn't an active QuickBooks item — update and try again");
  }
  await db.qboConnection.updateMany({ data: { invoiceItemId: listId } });
  revalidatePath(PATH);
});

/** "Bills waiting for a job": the job here a QuickBooks customer's bills go on. */
export const linkCustomerToJob = friendly(async function linkCustomerToJob(fd: FormData) {
  await requireEdit("quickbooks");
  const listId = str(fd, "customerId");
  const projectId = str(fd, "listId");
  if (!projectId) return;
  const customer = await db.qbListItem.findFirst({ where: { kind: "CUSTOMER", listId } });
  if (!customer) throw new Error("That QuickBooks customer is gone — update and try again");
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, qbListId: true, name: true } });
  if (!project) throw new Error("That job is gone");
  if (project.qbListId && project.qbListId !== listId) throw new Error(`${project.name} is already linked to another QuickBooks customer — change it under Jobs`);
  await db.project.update({ where: { id: projectId }, data: { qbListId: listId } });
  await applyBills();
  revalidatePath(PATH);
});

const entry = (r: { listId: string; name: string; fullName: string; parentListId: string | null; sublevel: number; active: boolean; detail: string | null }): QbEntry => ({
  ...r,
  detail: r.detail ? (JSON.parse(r.detail) as Record<string, string>) : {},
});

/** Picks a job's Customer:Job by hand (or unlinks it). */
export const linkJob = friendly(async function linkJob(fd: FormData) {
  await requireEdit("quickbooks");
  const projectId = str(fd, "projectId");
  const listId = str(fd, "listId") || null;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("That job is gone");
  if (listId) {
    const choices = jobChoices((await db.qbListItem.findMany({ where: { kind: "CUSTOMER" } })).map(entry));
    const pick = choices.find((c) => c.listId === listId);
    if (!pick) throw new Error("That isn't a QuickBooks customer or job any more — update from QuickBooks and try again");
    const other = await asWholeCompany(() => db.project.findFirst({ where: { qbListId: listId, id: { not: projectId } }, select: { name: true } }));
    if (other) throw new Error(`“${pick.fullName}” is already linked to ${other.name}`);
  }
  await db.project.update({ where: { id: projectId }, data: { qbListId: listId } });
  if (await db.qboConnection.findFirst({ select: { id: true } })) await applyBills();
  revalidatePath(PATH);
});

/** Picks a cost code's QuickBooks item by hand (or unlinks it). */
export const linkCostCode = friendly(async function linkCostCode(fd: FormData) {
  await requireEdit("quickbooks");
  const costCodeId = str(fd, "costCodeId");
  const listId = str(fd, "listId") || null;
  if (listId) {
    const item = await db.qbListItem.findFirst({ where: { kind: "ITEM", listId } });
    if (!item || !costableItem(entry(item))) throw new Error("That isn't a QuickBooks item a cost can go on");
    const other = await db.costCode.findFirst({ where: { qbListId: listId, id: { not: costCodeId } }, select: { code: true, name: true } });
    if (other) throw new Error(`“${item.fullName}” is already linked to ${[other.code, other.name].filter(Boolean).join(" ")}`);
  }
  await db.costCode.update({ where: { id: costCodeId }, data: { qbListId: listId } });
  if (await db.qboConnection.findFirst({ select: { id: true } })) await applyBills();
  revalidatePath(PATH);
});

/** Links by name again from what was last read from QuickBooks (no Web Connector needed). */
export const matchAgain = friendly(async function matchAgain() {
  await requireEdit("quickbooks");
  await applyMatches();
  if (await db.qboConnection.findFirst({ select: { id: true } })) await applyBills();
  revalidatePath(PATH);
});
