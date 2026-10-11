"use server";

import { friendly } from "@/lib/friendly-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, hashPassword, signOutEverywhere } from "@/lib/auth";
import { randomBytes } from "crypto";
import { sendResetEmail } from "@/lib/account";
import { cancelInvite, invite, resendInvite } from "@/lib/invites";
import { db, systemDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull, boolField } from "@/lib/utils";

const TEAM_ROLES = ["ADMIN", "STAFF", "SUB"] as const;

function teamRole(value: string) {
  return (TEAM_ROLES as readonly string[]).includes(value) ? value : "STAFF";
}

/** Invite a team member by email — they choose their own password from the link. */
export const inviteTeamMember = friendly(async function inviteTeamMember(formData: FormData) {
  const admin = await requireAdmin();
  const role = str(formData, "role") === "ADMIN" ? "ADMIN" : "STAFF";
  const row = await invite(
    {
      kind: "TEAM",
      email: str(formData, "email"),
      name: strOrNull(formData, "name"),
      role,
      permissions: {
        canDelay: boolField(formData, "canDelay"),
        canApproveBills: boolField(formData, "canApproveBills"),
        canSeeReports: boolField(formData, "canSeeReports"),
        canManageTime: boolField(formData, "canManageTime"),
      },
    },
    admin,
  );
  await logActivity({ userId: admin.id, type: "user.invited", description: `Invited ${row.email} to the team (${role === "ADMIN" ? "Admin" : "Staff"})` });
  revalidatePath("/settings/team");
  redirect(`/settings/team?invited=${encodeURIComponent(row.email)}`);
});

/** Someone on the schedule / time clock who never signs in (a crew member, a sub). */
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
  revalidatePath("/settings/team");
  redirect("/settings/team");
});

export const resendTeamInvite = friendly(async function resendTeamInvite(formData: FormData) {
  const admin = await requireAdmin();
  await resendInvite(str(formData, "id"), admin);
  revalidatePath("/settings/team");
});

export const cancelTeamInvite = friendly(async function cancelTeamInvite(formData: FormData) {
  await requireAdmin();
  await cancelInvite(str(formData, "id"));
  revalidatePath("/settings/team");
});

/** Emails a team member a link to choose a new password (admins never set them). */
export const sendPasswordReset = friendly(async function sendPasswordReset(formData: FormData) {
  const admin = await requireAdmin();
  const target = await db.user.findFirst({ where: { id: str(formData, "id"), active: true } });
  if (!target || target.role === "SUB") throw new Error("That person can't sign in");
  await sendResetEmail(target);
  await logActivity({ userId: admin.id, type: "user.reset-sent", description: `Sent ${target.name} a password reset link` });
  revalidatePath("/settings/team");
  redirect(`/settings/team?reset=${encodeURIComponent(target.email)}`);
});

/** Require two-step sign-in for the whole team (admins and staff). */
export const setRequireTwoStep = friendly(async function setRequireTwoStep(formData: FormData) {
  const admin = await requireAdmin();
  const on = boolField(formData, "on");
  if (on) {
    const me = await systemDb.user.findUniqueOrThrow({ where: { id: admin.id }, select: { totpEnabledAt: true } });
    if (!me.totpEnabledAt) throw new Error("Turn on two-step sign-in for yourself first (Your account), then require it for the team");
  }
  const company = await db.company.findFirstOrThrow({ select: { id: true } });
  await db.company.update({ where: { id: company.id }, data: { requireTwoStep: on } });
  await logActivity({ userId: admin.id, type: "company.two-step", description: on ? "Required two-step sign-in for the team" : "Stopped requiring two-step sign-in" });
  revalidatePath("/settings/team");
});

export const updateTeamMember = friendly(async function updateTeamMember(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  const isSelf = target.id === admin.id;
  const active = isSelf ? true : boolField(formData, "active");
  const role = isSelf ? target.role : teamRole(str(formData, "role"));
  await db.user.update({
    where: { id },
    data: {
      name,
      title: strOrNull(formData, "title"),
      phone: strOrNull(formData, "phone"),
      role,
      active,
      canDelay: boolField(formData, "canDelay"),
      canApproveBills: boolField(formData, "canApproveBills"),
      canSeeReports: boolField(formData, "canSeeReports"),
      canManageTime: boolField(formData, "canManageTime"),
      payRate: str(formData, "payRate") ? Math.max(0, Math.round((Number(str(formData, "payRate")) || 0) * 100) / 100) || null : null,
      salaried: boolField(formData, "salaried"),
      vacationDays: str(formData, "vacationDays") ? Math.max(0, Math.min(365, Number(str(formData, "vacationDays")) || 0)) : null,
    },
  });
  if (!active && target.active) await signOutEverywhere(id);
  await logActivity({ userId: admin.id, type: "user.updated", description: `Updated team member ${name}` });
  revalidatePath("/settings/team");
  redirect("/settings/team");
});

export const toggleTeamMemberActive = friendly(async function toggleTeamMemberActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (id === admin.id) throw new Error("You cannot deactivate your own account");
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");
  await db.user.update({ where: { id }, data: { active: !target.active } });
  // Turned off: signed out everywhere, right now.
  if (target.active) await signOutEverywhere(id);
  await logActivity({
    userId: admin.id,
    type: target.active ? "user.deactivated" : "user.activated",
    description: `${target.active ? "Deactivated" : "Reactivated"} ${target.name}`,
  });
  revalidatePath("/settings/team");
});

export const deleteTeamMember = friendly(async function deleteTeamMember(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (id === admin.id) throw new Error("You cannot delete your own account");
  const target = await db.user.findUnique({
    where: { id },
    include: { _count: { select: { dailyLogs: true, messages: true } } },
  });
  if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");

  if (target._count.dailyLogs > 0 || target._count.messages > 0) {
    // Has authored history — keep the record and deactivate instead.
    await db.user.update({ where: { id }, data: { active: false } });
    await signOutEverywhere(id);
    await logActivity({ userId: admin.id, type: "user.deactivated", description: `Deactivated ${target.name} (has logs/messages, not deleted)` });
  } else {
    await db.user.delete({ where: { id } });
    await logActivity({ userId: admin.id, type: "user.deleted", description: `Removed team member ${target.name}` });
  }
  revalidatePath("/settings/team");
  redirect("/settings/team");
});
