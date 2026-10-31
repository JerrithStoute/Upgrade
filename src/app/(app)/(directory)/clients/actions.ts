"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/auth";
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
  const user = await requireEdit("leads");
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

type Result = { ok: true } | { ok: false; error: string };

/** Info edited in place on the client's page: saved, and you stay there. */
export async function saveClientInfo(fd: FormData): Promise<Result> {
  try {
    await requireEdit("leads");
    const id = str(fd, "id");
    if (!(await db.client.findUnique({ where: { id }, select: { id: true } }))) throw new Error("Client not found");
    await db.client.update({ where: { id }, data: readClientFields(fd) });
    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That didn't save — try again" };
  }
}

export const deleteClient = friendly(async function deleteClient(formData: FormData) {
  const user = await requireEdit("leads");
  const id = str(formData, "id");
  const existing = await db.client.findUnique({ where: { id }, include: { _count: { select: { projects: true } } } });
  if (!existing) throw new Error("Client not found.");
  if (existing._count.projects > 0) throw new Error("This client has jobs, so they can't be deleted.");
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
  const user = await requireEdit("leads");
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
  const user = await requireEdit("leads");
  await resendInvite(str(formData, "inviteId"), user);
  revalidatePath(`/clients/${str(formData, "id")}`);
});

export const cancelPortalInvite = friendly(async function cancelPortalInvite(formData: FormData) {
  await requireEdit("leads");
  await cancelInvite(str(formData, "inviteId"));
  revalidatePath(`/clients/${str(formData, "id")}`);
});

/** Emails the client a link to choose a new password (nobody types one for them). */
export const resetPortalPassword = friendly(async function resetPortalPassword(formData: FormData) {
  await requireEdit("leads");
  const id = str(formData, "id");
  const client = await db.client.findUnique({ where: { id }, include: { user: true } });
  if (!client?.user) throw new Error("This client does not have portal access.");
  await sendResetEmail(client.user);
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?reset=1`);
});

export const revokePortalAccess = friendly(async function revokePortalAccess(formData: FormData) {
  const user = await requireEdit("leads");
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

/**
 * "+ New client…" on the job form: saved and picked without leaving the job you're making. A name and phone or
 * email is enough; the rest can be filled in on their page later.
 */
export async function quickClient(input: { firstName: string; lastName: string; phone?: string; email?: string; address?: string }) {
  const user = await requireEdit("leads");
  const firstName = (input.firstName ?? "").trim().slice(0, 80);
  const lastName = (input.lastName ?? "").trim().slice(0, 80);
  if (!firstName || !lastName) return { ok: false as const, error: "First and last name, please" };
  const email = (input.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "That email doesn't look right" };
  const client = await db.client.create({
    data: { firstName, lastName, email: email || null, phone: input.phone?.trim().slice(0, 60) || null, address: input.address?.trim().slice(0, 200) || null },
  });
  await logActivity({ userId: user.id, type: "client.created", description: `Added client ${client.firstName} ${client.lastName}` });
  revalidatePath("/clients");
  return { ok: true as const, option: { id: client.id, label: `${client.firstName} ${client.lastName}` } };
}
