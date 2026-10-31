"use server";

import { friendly } from "@/lib/friendly-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, hashPassword, signOutEverywhere } from "@/lib/auth";
import { randomBytes } from "crypto";
import { sendResetEmail } from "@/lib/account";
import { cancelInvite, invite, resendInvite } from "@/lib/invites";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull } from "@/lib/utils";
import { accessFromForm, diffAccess, positionAccess } from "@/lib/access";
import { companyPositions, defaultPositionId } from "@/lib/positions";

/**
 * Directory → Team: inviting people, each person's info, position, access and sign-in, and the positions
 * themselves. Admins only. A person's page saves in place (you stay on it); the rest goes back where you were.
 */

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "That didn't save — try again" });

function revalidateTeam(id?: string) {
  revalidatePath("/team");
  if (id) revalidatePath(`/team/${id}`);
}

/**
 * The "Position" picker's choice: Admin, or one of the company's positions ("pos:<id>"). Anything else (or a
 * position that's gone) is the default position. Someone without a sign-in keeps no position.
 */
async function readPosition(value: string): Promise<{ role: "ADMIN" | "STAFF"; positionId: string | null; name: string }> {
  if (value === "ADMIN") return { role: "ADMIN", positionId: null, name: "Admin" };
  const rows = await companyPositions();
  const fallback = await defaultPositionId();
  const pos = rows.find((r) => `pos:${r.id}` === value) ?? rows.find((r) => r.id === fallback);
  return { role: "STAFF", positionId: pos?.id ?? null, name: pos?.name ?? "Staff" };
}

/** Invite a team member by email — they choose their own password from the link. */
export const inviteTeamMember = friendly(async function inviteTeamMember(formData: FormData) {
  const admin = await requireAdmin();
  const pos = await readPosition(str(formData, "position"));
  const row = await invite(
    {
      kind: "TEAM",
      email: str(formData, "email"),
      name: strOrNull(formData, "name"),
      role: pos.role,
      permissions: pos.positionId ? { positionId: pos.positionId } : undefined,
    },
    admin,
  );
  await logActivity({ userId: admin.id, type: "user.invited", description: `Invited ${row.email} to the team (${pos.name})` });
  revalidateTeam();
  redirect(`/team?invited=${encodeURIComponent(row.email)}`);
});

/** Someone on the schedule / time clock who never signs in (a crew member) — their page opens to fill in the rest. */
export const addNoLoginMember = friendly(async function addNoLoginMember(formData: FormData) {
  const admin = await requireAdmin();
  const name = str(formData, "name");
  if (!name) throw new Error("Put in their name");
  const user = await db.user.create({
    data: {
      name,
      // No real email and no password anyone knows: this person can't sign in.
      email: `no-login-${randomBytes(6).toString("hex")}@no-login.invalid`,
      passwordHash: await hashPassword(randomBytes(24).toString("hex")),
      role: "SUB",
      title: strOrNull(formData, "title"),
      phone: strOrNull(formData, "phone"),
    },
  });
  await logActivity({ userId: admin.id, type: "user.created", description: `Added ${user.name} (no login)` });
  revalidateTeam();
  redirect(`/team/${user.id}`);
});

export const resendTeamInvite = friendly(async function resendTeamInvite(formData: FormData) {
  const admin = await requireAdmin();
  await resendInvite(str(formData, "id"), admin);
  revalidateTeam();
});

export const cancelTeamInvite = friendly(async function cancelTeamInvite(formData: FormData) {
  await requireAdmin();
  await cancelInvite(str(formData, "id"));
  revalidateTeam();
});

/** Emails a team member a link to choose a new password (admins never set them). */
export const sendPasswordReset = friendly(async function sendPasswordReset(formData: FormData) {
  const admin = await requireAdmin();
  const target = await db.user.findFirst({ where: { id: str(formData, "id"), active: true } });
  if (!target || target.role === "SUB") throw new Error("That person can't sign in");
  await sendResetEmail(target);
  await logActivity({ userId: admin.id, type: "user.reset-sent", description: `Sent ${target.name} a password reset link` });
  revalidateTeam(target.id);
  redirect(`/team/${target.id}?reset=1`);
});

/**
 * A person's info, changed right on their page: name, title, phone, position, vacation days — and their pay
 * (admins are the only ones who ever see or change it).
 */
export async function saveMemberInfo(formData: FormData): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const id = str(formData, "id");
    const target = await db.user.findUnique({ where: { id } });
    if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");
    const name = str(formData, "name");
    if (!name) throw new Error("Name is required");
    // You can't change your own position (nobody locks themselves out of Settings); no sign-in, no position.
    const pos = target.id === admin.id || target.role === "SUB" ? { role: target.role, positionId: target.positionId } : await readPosition(str(formData, "position"));
    const moved = pos.role !== target.role || pos.positionId !== target.positionId;
    const rawPay = str(formData, "payRate").replace(/[$,\s]/g, "");
    const pay = rawPay ? Math.round(Math.max(0, Number(rawPay) || 0) * 100) / 100 || null : null;
    const vacation = str(formData, "vacationDays");
    await db.user.update({
      where: { id },
      data: {
        name,
        title: strOrNull(formData, "title"),
        phone: strOrNull(formData, "phone"),
        role: pos.role,
        positionId: pos.positionId,
        // A new position starts clean: changes made for just this person were changes from the old one.
        ...(moved ? { access: null } : {}),
        vacationDays: vacation ? Math.max(0, Math.min(365, Number(vacation) || 0)) : null,
        payRate: pay,
        salaried: formData.get("salaried") === "on",
      },
    });
    await logActivity({ userId: admin.id, type: "user.updated", description: `Updated team member ${name}` });
    revalidateTeam(id);
    revalidatePath("/settings/time-clock");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Access for just this person: saved as what differs from their position ("Use the position's" clears it). */
export async function saveMemberAccess(formData: FormData): Promise<Result> {
  try {
    const admin = await requireAdmin();
    const id = str(formData, "id");
    const target = await db.user.findFirst({ where: { id, role: "STAFF" }, include: { position: { select: { access: true, name: true } } } });
    if (!target) throw new Error("Only team members in a position have access to change (admins have everything)");
    const base = positionAccess(target.position?.access);
    const changes = str(formData, "reset") === "on" ? {} : diffAccess(base, accessFromForm((k) => strOrNull(formData, k)));
    const n = Object.keys(changes).length;
    await db.user.update({ where: { id }, data: { access: n ? JSON.stringify(changes) : null } });
    await logActivity({
      userId: admin.id,
      type: "user.updated",
      description: n ? `Changed ${target.name}'s access (${n} different from ${target.position?.name ?? "their position"})` : `${target.name} has their position's access`,
    });
    revalidateTeam(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Turns someone's sign-in off (signed out everywhere, right now) or back on. */
export const toggleTeamMemberActive = friendly(async function toggleTeamMemberActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (id === admin.id) throw new Error("You cannot turn off your own account");
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");
  await db.user.update({ where: { id }, data: { active: !target.active } });
  if (target.active) await signOutEverywhere(id);
  await logActivity({
    userId: admin.id,
    type: target.active ? "user.deactivated" : "user.activated",
    description: `${target.active ? "Deactivated" : "Reactivated"} ${target.name}`,
  });
  revalidateTeam(id);
});

/** Removes someone — or turns them off, when they've written daily logs or messages (those keep who wrote them). */
export const deleteTeamMember = friendly(async function deleteTeamMember(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (id === admin.id) throw new Error("You cannot delete your own account");
  const target = await db.user.findUnique({ where: { id }, include: { _count: { select: { dailyLogs: true, messages: true } } } });
  if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");
  if (target._count.dailyLogs > 0 || target._count.messages > 0) {
    await db.user.update({ where: { id }, data: { active: false } });
    await signOutEverywhere(id);
    await logActivity({ userId: admin.id, type: "user.deactivated", description: `Deactivated ${target.name} (has logs/messages, not deleted)` });
  } else {
    await db.user.delete({ where: { id } });
    await logActivity({ userId: admin.id, type: "user.deleted", description: `Removed team member ${target.name}` });
  }
  revalidateTeam();
  redirect("/team");
});

// --- Positions --------------------------------------------------------------------------

function back(params = "") {
  revalidatePath("/team", "layout");
  revalidatePath("/", "layout");
  redirect(`/team/positions${params}`);
}

/** A new position, starting as a copy of another (or of Staff). */
export const createPosition = friendly(async function createPosition(formData: FormData) {
  const admin = await requireAdmin();
  const name = str(formData, "name");
  if (!name) throw new Error("Name the position");
  const rows = await companyPositions();
  if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new Error(`There's already a position called "${name}"`);
  const from = rows.find((r) => r.id === str(formData, "from"));
  const row = await db.position.create({
    data: { name, access: JSON.stringify(from?.accessOf ?? positionAccess(null)), sortOrder: Math.max(0, ...rows.map((r) => r.sortOrder)) + 1 },
  });
  await logActivity({ userId: admin.id, type: "user.position", description: `Added the position "${name}"` });
  back(`?position=${row.id}`);
});

/** A position's name and access — everyone in it changes at once. */
export const savePosition = friendly(async function savePosition(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!name) throw new Error("Name the position");
  const rows = await companyPositions();
  if (!rows.some((r) => r.id === id)) throw new Error("That position isn't there any more");
  if (rows.some((r) => r.id !== id && r.name.toLowerCase() === name.toLowerCase())) throw new Error(`There's already a position called "${name}"`);
  await db.position.update({ where: { id }, data: { name, access: JSON.stringify(accessFromForm((k) => strOrNull(formData, k))) } });
  await logActivity({ userId: admin.id, type: "user.position", description: `Changed the position "${name}"` });
  back("?saved=1");
});

/** Only an empty position can go — its people have to be somewhere first. */
export const deletePosition = friendly(async function deletePosition(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const row = await db.position.findFirst({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!row) throw new Error("That position isn't there any more");
  if (row._count.users) throw new Error(`Move the ${row._count.users === 1 ? "person" : `${row._count.users} people`} in "${row.name}" to another position first`);
  await db.position.delete({ where: { id } });
  await logActivity({ userId: admin.id, type: "user.position", description: `Removed the position "${row.name}"` });
  back();
});
