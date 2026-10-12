"use server";

import { revalidatePath } from "next/cache";
import { friendly } from "@/lib/friendly-action";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { hashQbPassword, newConnectionFields, newPassword } from "@/lib/qb/connection";
import { applyMatches } from "@/lib/qb/sync";
import { costableItem, jobChoices, type QbEntry } from "@/lib/qb/match";

const PATH = "/settings/quickbooks";

export type PasswordState = { password?: string; error?: string } | undefined;

/** Sets up the connection. Its password is made at the step that needs it (newQuickBooksPassword). */
export const setUpQuickBooks = friendly(async function setUpQuickBooks() {
  const me = await requireAdmin();
  if (await db.qbConnection.findFirst({ select: { id: true } })) return;
  // A password no one has seen: the Web Connector can't sign in until one is made for it.
  await db.qbConnection.create({ data: { ...newConnectionFields(), passwordHash: await hashQbPassword(newPassword()) } });
  await logActivity({ userId: me.id, type: "quickbooks.connected", description: `${me.name} set up the QuickBooks connection` });
  revalidatePath(PATH);
});

/** A new Web Connector password (the old one stops working). */
export async function newQuickBooksPassword(): Promise<PasswordState> {
  await requireAdmin();
  const c = await db.qbConnection.findFirst({ select: { id: true } });
  if (!c) return { error: "Set up the connection first." };
  const password = newPassword();
  await db.qbConnection.update({ where: { id: c.id }, data: { passwordHash: await hashQbPassword(password), ticket: null } });
  return { password };
}

/** Disconnect: the Web Connector can't sign in any more, and nothing here stays linked to QuickBooks. */
export const disconnectQuickBooks = friendly(async function disconnectQuickBooks() {
  const me = await requireAdmin();
  await db.qbConnection.deleteMany({});
  await db.qbListItem.deleteMany({});
  await db.vendor.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await db.project.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await db.costCode.updateMany({ where: { qbListId: { not: null } }, data: { qbListId: null } });
  await logActivity({ userId: me.id, type: "quickbooks.disconnected", description: `${me.name} disconnected QuickBooks` });
  revalidatePath(PATH);
});

const entry = (r: { listId: string; name: string; fullName: string; parentListId: string | null; sublevel: number; active: boolean; detail: string | null }): QbEntry => ({
  ...r,
  detail: r.detail ? (JSON.parse(r.detail) as Record<string, string>) : {},
});

/** Picks a job's Customer:Job by hand (or unlinks it). */
export const linkJob = friendly(async function linkJob(fd: FormData) {
  await requireAdmin();
  const projectId = str(fd, "projectId");
  const listId = str(fd, "listId") || null;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("That job is gone");
  if (listId) {
    const choices = jobChoices((await db.qbListItem.findMany({ where: { kind: "CUSTOMER" } })).map(entry));
    const pick = choices.find((c) => c.listId === listId);
    if (!pick) throw new Error("That isn't a QuickBooks customer or job any more — update the Web Connector and try again");
    const other = await db.project.findFirst({ where: { qbListId: listId, id: { not: projectId } }, select: { name: true } });
    if (other) throw new Error(`“${pick.fullName}” is already linked to ${other.name}`);
  }
  await db.project.update({ where: { id: projectId }, data: { qbListId: listId } });
  revalidatePath(PATH);
});

/** Picks a cost code's QuickBooks item by hand (or unlinks it). */
export const linkCostCode = friendly(async function linkCostCode(fd: FormData) {
  await requireAdmin();
  const costCodeId = str(fd, "costCodeId");
  const listId = str(fd, "listId") || null;
  if (listId) {
    const item = await db.qbListItem.findFirst({ where: { kind: "ITEM", listId } });
    if (!item || !costableItem(entry(item))) throw new Error("That isn't a QuickBooks item a cost can go on");
    const other = await db.costCode.findFirst({ where: { qbListId: listId, id: { not: costCodeId } }, select: { code: true, name: true } });
    if (other) throw new Error(`“${item.fullName}” is already linked to ${[other.code, other.name].filter(Boolean).join(" ")}`);
  }
  await db.costCode.update({ where: { id: costCodeId }, data: { qbListId: listId } });
  revalidatePath(PATH);
});

/** Links by name again from what was last read from QuickBooks (no Web Connector needed). */
export const matchAgain = friendly(async function matchAgain() {
  await requireAdmin();
  await applyMatches();
  revalidatePath(PATH);
});
