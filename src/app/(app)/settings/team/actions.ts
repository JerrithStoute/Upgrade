"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull, boolField } from "@/lib/utils";

const TEAM_ROLES = ["ADMIN", "STAFF", "SUB"] as const;

function teamRole(value: string) {
  return (TEAM_ROLES as readonly string[]).includes(value) ? value : "STAFF";
}

export async function createTeamMember(formData: FormData) {
  const admin = await requireAdmin();
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  if (!name || !email || !password) throw new Error("Name, email and password are required");
  if (password.length < 6) throw new Error("Password must be at least 6 characters");
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) throw new Error(`A user with the email ${email} already exists`);

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: teamRole(str(formData, "role")),
      title: strOrNull(formData, "title"),
      phone: strOrNull(formData, "phone"),
      active: true,
    },
  });
  await logActivity({ userId: admin.id, type: "user.created", description: `Added team member ${user.name} (${user.role})` });
  revalidatePath("/settings/team");
  redirect("/settings/team");
}

export async function updateTeamMember(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  const isSelf = target.id === admin.id;
  const active = isSelf ? true : boolField(formData, "active");
  const role = isSelf ? target.role : teamRole(str(formData, "role"));
  const password = str(formData, "password");

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
      vacationDays: str(formData, "vacationDays") ? Math.max(0, Math.min(365, Number(str(formData, "vacationDays")) || 0)) : null,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await logActivity({ userId: admin.id, type: "user.updated", description: `Updated team member ${name}` });
  revalidatePath("/settings/team");
  redirect("/settings/team");
}

export async function toggleTeamMemberActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "id");
  if (id === admin.id) throw new Error("You cannot deactivate your own account");
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.role === "CLIENT" || target.role === "VENDOR") throw new Error("Team member not found");
  await db.user.update({ where: { id }, data: { active: !target.active } });
  await logActivity({
    userId: admin.id,
    type: target.active ? "user.deactivated" : "user.activated",
    description: `${target.active ? "Deactivated" : "Reactivated"} ${target.name}`,
  });
  revalidatePath("/settings/team");
}

export async function deleteTeamMember(formData: FormData) {
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
    await logActivity({ userId: admin.id, type: "user.deactivated", description: `Deactivated ${target.name} (has logs/messages, not deleted)` });
  } else {
    await db.user.delete({ where: { id } });
    await logActivity({ userId: admin.id, type: "user.deleted", description: `Removed team member ${target.name}` });
  }
  revalidatePath("/settings/team");
  redirect("/settings/team");
}
