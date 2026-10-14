import "server-only";
import { db, systemDb } from "./db";
import { hashToken, LINK_LIFE, randomToken, sendInviteEmail } from "./account";

/**
 * Invitations: the only way someone new gets a login. The person gets an email, sets
 * their own password from the link (7 days, once) — nobody types or hands out passwords.
 */

export type InviteInput = {
  kind: "TEAM" | "CLIENT" | "VENDOR";
  email: string;
  name?: string | null;
  role?: "ADMIN" | "STAFF";
  /** TEAM: their position (src/lib/access.ts). */
  permissions?: { positionId?: string };
  clientId?: string | null;
  vendorId?: string | null;
};

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

/** Creates (or replaces) the invitation for `email` and emails it. `from` is who's inviting. */
export async function invite(input: InviteInput, from: { id: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  if (!emailOk(email)) throw new Error("That email doesn't look right");
  // An email signs in to one company, so it can't be someone's login already — anywhere.
  if (await systemDb.user.findUnique({ where: { email }, select: { id: true } })) throw new Error(`${email} already has a login`);
  const company = await db.company.findFirstOrThrow({ select: { name: true } });
  // One open invitation per email (and per portal): sending again replaces the old link.
  await db.invite.deleteMany({ where: { email, acceptedAt: null } });
  const token = randomToken();
  const row = await db.invite.create({
    data: {
      kind: input.kind,
      email,
      name: input.name?.trim() || null,
      role: input.kind === "TEAM" ? (input.role === "ADMIN" ? "ADMIN" : "STAFF") : input.kind,
      permissions: input.permissions ? JSON.stringify(input.permissions) : null,
      clientId: input.clientId ?? null,
      vendorId: input.vendorId ?? null,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + LINK_LIFE.INVITE),
      invitedById: from.id,
    },
  });
  await sendInviteEmail(row, token, company.name, from.name);
  return row;
}

/** Sends a waiting invitation again, with a fresh link (the old link stops working). */
export async function resendInvite(id: string, from: { id: string; name: string }) {
  const row = await db.invite.findFirst({ where: { id, acceptedAt: null } });
  if (!row) throw new Error("That invitation isn't waiting any more");
  const company = await db.company.findFirstOrThrow({ select: { name: true } });
  const token = randomToken();
  await db.invite.update({ where: { id }, data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_LIFE.INVITE), invitedById: from.id } });
  await sendInviteEmail(row, token, company.name, from.name);
}

export async function cancelInvite(id: string) {
  // Every waiting link for that email (an emailed proposal or invoice may have added more).
  const row = await db.invite.findFirst({ where: { id, acceptedAt: null }, select: { email: true } });
  if (row) await db.invite.deleteMany({ where: { email: row.email, acceptedAt: null } });
}

/** Invitations still waiting to be accepted (of one kind, or for one client / vendor). */
export function openInvites(where: { kind?: string; clientId?: string; vendorId?: string } = {}) {
  // One row per email (the newest): several links can be waiting for the same person.
  return db.invite.findMany({ where: { acceptedAt: null, ...where }, orderBy: { createdAt: "desc" }, distinct: ["email"], include: { invitedBy: { select: { name: true } } } });
}
