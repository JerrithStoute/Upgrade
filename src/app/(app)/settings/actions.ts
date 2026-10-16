"use server";

import { friendly } from "@/lib/friendly-action";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str, strOrNull } from "@/lib/utils";
import { DEFAULT_BRAND, isHexColor } from "@/lib/brand";
import { brandStyleJson } from "@/lib/brand-style";
import { isZone } from "@/lib/zone";
import { saveLogo } from "@/lib/company-brand";
import { deleteUpload } from "@/lib/uploads";

export const saveCompany = friendly(async function saveCompany(formData: FormData) {
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
    ...(isZone(str(formData, "timeZone")) ? { timeZone: str(formData, "timeZone") } : {}),
  };
  const existing = await db.company.findFirst();
  if (existing) await db.company.update({ where: { id: existing.id }, data });
  else await db.company.create({ data });
  await logActivity({ userId: user.id, type: "company.updated", description: `Updated company profile for ${name}` });
  revalidatePath("/", "layout");
  redirect("/settings/company?saved=1");
});

/** Admins: take a backup right now (database + uploads). */
export const backupNow = friendly(async function backupNow() {
  const admin = await requireAdmin();
  const { runBackup } = await import("@/lib/backup");
  const s = await runBackup();
  await logActivity({ userId: admin.id, type: "backup.created", description: `Backup ${s.file} (${(s.bytes / 1024 / 1024).toFixed(1)} MB)` });
  revalidatePath("/settings/company");
  redirect("/settings/company?backup=1#backups");
});

/** Admins: where backups go. Checks the folder can be written to, then backs up there straight away. */
export const saveBackupFolder = friendly(async function saveBackupFolder(formData: FormData) {
  const admin = await requireAdmin();
  const { backupsInCloud, checkFolder, runBackup } = await import("@/lib/backup");
  // Online the backups are in cloud storage — never a folder on the server.
  if (backupsInCloud()) throw new Error("Backups are kept in cloud storage online — there's no folder to pick");
  const folder = str(formData, "backupDir").replace(/^"|"$/g, "").trim();
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("Save the company profile first");
  if (folder) await checkFolder(folder);
  await db.company.update({ where: { id: company.id }, data: { backupDir: folder || null } });
  const s = await runBackup();
  await logActivity({ userId: admin.id, type: "backup.folder", description: `Backups now go to ${s.dir}` });
  revalidatePath("/settings/company");
  redirect("/settings/company?backup=moved#backups");
});

/** Admins: put everything back the way it was in a backup (a backup of right now is taken first). */
export const restoreFromBackup = friendly(async function restoreFromBackup(formData: FormData) {
  const admin = await requireAdmin();
  const { restoreBackup } = await import("@/lib/backup");
  const file = str(formData, "file");
  const r = await restoreBackup(file);
  // The activity log was restored too — this goes in after.
  await logActivity({ userId: admin.id, type: "backup.restored", description: `Restored backup ${file} (the moment before was saved as ${r.safety})` });
  revalidatePath("/", "layout");
  redirect(`/settings/company?restored=${encodeURIComponent(file)}&undo=${encodeURIComponent(r.safety)}#backups`);
});

/** Logo and main color (Settings → Company → Branding). */
export const saveBranding = friendly(async function saveBranding(formData: FormData) {
  const user = await requireAdmin();
  const company = await db.company.findFirst();
  if (!company) throw new Error("Save the company profile first");
  const color = str(formData, "brandColor").toLowerCase();
  const data: { brandColor: string | null; brandStyle: string | null; logoPath?: string | null; logoType?: string | null } = {
    // The original blue is stored as "none", so it follows any future default.
    brandColor: isHexColor(color) && color !== DEFAULT_BRAND ? color : null,
    // The work screens' look, for everyone on the team (brand-style.ts).
    brandStyle: brandStyleJson({
      accent: str(formData, "accent") || null,
      menu: str(formData, "menu") === "brand" ? "brand" : "light",
      screen: str(formData, "screen") === "soft" ? "soft" : str(formData, "screen") === "color" ? "color" : "bright",
      background: str(formData, "background") || null,
      intensity: Number(str(formData, "intensity")),
      planDim: Number(str(formData, "planDim")) || 0,
    }),
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
  redirect("/settings/company?branding=1");
});
