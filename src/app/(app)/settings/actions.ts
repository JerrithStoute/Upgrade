"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull, numField } from "@/lib/utils";

export async function saveCompany(formData: FormData) {
  const user = await requireAdmin();
  const name = str(formData, "name");
  if (!name) throw new Error("Company name is required");
  const data = {
    name,
    address: strOrNull(formData, "address"),
    city: strOrNull(formData, "city"),
    state: strOrNull(formData, "state"),
    zip: strOrNull(formData, "zip"),
    phone: strOrNull(formData, "phone"),
    email: strOrNull(formData, "email"),
    website: strOrNull(formData, "website"),
    licenseNumber: strOrNull(formData, "licenseNumber"),
    defaultMarkup: Math.max(0, numField(formData, "defaultMarkup", 20)),
  };
  const existing = await db.company.findFirst();
  if (existing) await db.company.update({ where: { id: existing.id }, data });
  else await db.company.create({ data });
  await logActivity({ userId: user.id, type: "company.updated", description: `Updated company profile for ${name}` });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
