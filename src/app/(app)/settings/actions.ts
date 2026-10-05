"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull, numField } from "@/lib/utils";
import { DEFAULT_BRAND, isHexColor } from "@/lib/brand";
import { saveLogo } from "@/lib/company-brand";
import { deleteUpload } from "@/lib/uploads";

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
    allowanceProfit: str(formData, "allowanceProfit") === "in",
  };
  const existing = await db.company.findFirst();
  if (existing) await db.company.update({ where: { id: existing.id }, data });
  else await db.company.create({ data });
  await logActivity({ userId: user.id, type: "company.updated", description: `Updated company profile for ${name}` });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

/** Admins: take a backup right now (database + uploads). */
export async function backupNow() {
  const admin = await requireAdmin();
  const { runBackup } = await import("@/lib/backup");
  const s = await runBackup(db);
  await logActivity({ userId: admin.id, type: "backup.created", description: `Backup ${s.file} (${(s.bytes / 1024 / 1024).toFixed(1)} MB)` });
  revalidatePath("/settings");
  redirect("/settings?backup=1");
}

/** Logo and main color (Settings → Company → Branding). */
export async function saveBranding(formData: FormData) {
  const user = await requireAdmin();
  const company = await db.company.findFirst();
  if (!company) throw new Error("Save the company profile first");
  const color = str(formData, "brandColor").toLowerCase();
  const data: { brandColor: string | null; logoPath?: string | null; logoType?: string | null } = {
    // The original blue is stored as "none", so it follows any future default.
    brandColor: isHexColor(color) && color !== DEFAULT_BRAND ? color : null,
  };
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) Object.assign(data, await saveLogo(logo, company.logoPath));
  else if (str(formData, "removeLogo") === "1" && company.logoPath) {
    await deleteUpload(company.logoPath);
    Object.assign(data, { logoPath: null, logoType: null });
  }
  await db.company.update({ where: { id: company.id }, data });
  await logActivity({ userId: user.id, type: "company.branding", description: "Updated the company branding" });
  revalidatePath("/", "layout");
  redirect("/settings?branding=1");
}
