"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, requireStaff } from "@/lib/auth";
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

export async function createClient(formData: FormData) {
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
}

export async function updateClient(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id");
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new Error("Client not found.");
  const data = readClientFields(formData);
  await db.client.update({ where: { id }, data });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function deleteClient(formData: FormData) {
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
}

export async function grantPortalAccess(formData: FormData) {
  const user = await requireStaff();
  const id = str(formData, "id");
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const client = await db.client.findUnique({ where: { id } });
  if (!client) throw new Error("Client not found.");
  if (client.userId) throw new Error("This client already has portal access.");
  if (!email || !email.includes("@")) throw new Error("A valid email address is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const taken = await db.user.findUnique({ where: { email } });
  if (taken) throw new Error(`The email ${email} is already used by another login. Choose a different email.`);
  const portalUser = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      name: `${client.firstName} ${client.lastName}`,
      role: "CLIENT",
      phone: client.phone,
    },
  });
  await db.client.update({ where: { id }, data: { userId: portalUser.id, email: client.email ?? email } });
  await logActivity({
    userId: user.id,
    type: "client.portal_granted",
    description: `Granted portal access to ${client.firstName} ${client.lastName} (${email})`,
  });
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function resetPortalPassword(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id");
  const password = String(formData.get("password") ?? "");
  const client = await db.client.findUnique({ where: { id } });
  if (!client?.userId) throw new Error("This client does not have portal access.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  await db.user.update({ where: { id: client.userId }, data: { passwordHash: await hashPassword(password) } });
  revalidatePath(`/clients/${id}`);
}

export async function revokePortalAccess(formData: FormData) {
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
}
