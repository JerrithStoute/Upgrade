"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { sendResetEmail } from "@/lib/account";
import { cancelInvite, invite, resendInvite } from "@/lib/invites";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull } from "@/lib/utils";

function readClientFields(fd: FormData) {
  const firstName = str(fd, "firstName");
  const lastName = str(fd, "lastName");
  if (!firstName || !lastName) throw new Error("First and last name are required.");
  return {
    firstName,
    lastName,
    company: strOrNull(fd, "company"),
    email: strOrNull(fd, "email")?.toLowerCase() ?? null,
    phone: strOrNull(fd, "phone"),
    address: strOrNull(fd, "address"),
    city: strOrNull(fd, "city"),
    state: strOrNull(fd, "state"),
    zip: strOrNull(fd, "zip"),
    source: strOrNull(fd, "source"),
    notes: strOrNull(fd, "notes"),
  };
}

export const createClient = friendly(async function createClient(formData: FormData) {
  const user = await requireStaff();
  const data = readClientFields(formData);
  const client = await db.client.create({ data });
  await logActivity({
    userId: user.id,
    type: "client.created",
    description: `Added client ${client.firstName} ${client.lastName}`,
  });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
});

export const updateClient = friendly(async function updateClient(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id");
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new Error("Client not found.");
  const data = readClientFields(formData);
  await db.client.update({ where: { id }, data });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
});

export const deleteClient = friendly(async function deleteClient(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  const existing = await db.client.findUnique({ where: { id }, include: { _count: { select: { projects: true } } } });
  if (!existing) throw new Error("Client not found.");
  if (existing._count.projects > 0) throw new Error("This client has projects and cannot be deleted.");
  await db.client.delete({ where: { id } });
  if (existing.userId) await db.user.delete({ where: { id: existing.userId } }).catch(() => undefined);
  await logActivity({
    userId: user.id,
    type: "client.deleted",
    description: `Deleted client ${existing.firstName} ${existing.lastName}`,
  });
  revalidatePath("/clients");
  redirect("/clients");
});

/** Invites the client to their portal: an email with a link to choose their own password. */
export const grantPortalAccess = friendly(async function grantPortalAccess(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  const client = await db.client.findUnique({ where: { id } });
  if (!client) throw new Error("Client not found.");
  if (client.userId) throw new Error("This client already has portal access.");
  const row = await invite({ kind: "CLIENT", email: str(formData, "email"), name: `${client.firstName} ${client.lastName}`.trim(), clientId: id }, user);
  if (!client.email) await db.client.update({ where: { id }, data: { email: row.email } });
  await logActivity({ userId: user.id, type: "client.portal_invited", description: `Invited ${client.firstName} ${client.lastName} to the client portal (${row.email})` });
  revalidatePath(`/clients/${id}`);
});

export const resendPortalInvite = friendly(async function resendPortalInvite(formData: FormData) {
  const user = await requireStaff();
  await resendInvite(str(formData, "inviteId"), user);
  revalidatePath(`/clients/${str(formData, "id")}`);
});

export const cancelPortalInvite = friendly(async function cancelPortalInvite(formData: FormData) {
  await requireStaff();
  await cancelInvite(str(formData, "inviteId"));
  revalidatePath(`/clients/${str(formData, "id")}`);
});

/** Emails the client a link to choose a new password (nobody types one for them). */
export const resetPortalPassword = friendly(async function resetPortalPassword(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id");
  const client = await db.client.findUnique({ where: { id }, include: { user: true } });
  if (!client?.user) throw new Error("This client does not have portal access.");
  await sendResetEmail(client.user);
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?reset=1`);
});

export const revokePortalAccess = friendly(async function revokePortalAccess(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  const client = await db.client.findUnique({ where: { id } });
  if (!client?.userId) throw new Error("This client does not have portal access.");
  await db.user.delete({ where: { id: client.userId } });
  await logActivity({
    userId: user.id,
    type: "client.portal_revoked",
    description: `Revoked portal access for ${client.firstName} ${client.lastName}`,
  });
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
});
