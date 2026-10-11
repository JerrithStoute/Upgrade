"use server";

import { friendly } from "@/lib/friendly-action";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, signOutEverywhere } from "@/lib/auth";
import { sendResetEmail } from "@/lib/account";
import { cancelInvite, invite, resendInvite } from "@/lib/invites";
import { db } from "@/lib/db";
import { parseDateInput, str, strOrNull } from "@/lib/utils";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { COVERAGE_TYPES } from "@/lib/purchasing";
import { logActivity } from "@/lib/activity";
import { cleanVendorName, parseVendorRows, splitLine, vendorKey } from "@/lib/vendors";
import { importVendorRows, renameVendorEverywhere } from "@/lib/vendor-list";

const PATH = "/settings/vendors";

async function vendorFields(fd: FormData, id?: string) {
  const name = cleanVendorName(str(fd, "name"));
  if (!name) throw new Error("Vendor name is required");
  const clash = (await db.vendor.findMany({ select: { id: true, name: true } })).find((v) => vendorKey(v.name) === vendorKey(name) && v.id !== id);
  if (clash) throw new Error(`"${clash.name}" is already a vendor`);
  const email = strOrNull(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email doesn't look right");
  // Cost codes they usually bid (picked for them when you send to vendors).
  const picked = fd.getAll("costCode").map(String).filter(Boolean);
  const known = new Set((await db.costCode.findMany({ where: { id: { in: picked.filter((c) => c !== "none") } }, select: { id: true } })).map((c) => c.id));
  const codes = picked.filter((c) => c === "none" || known.has(c));
  return {
    name,
    contact: strOrNull(fd, "contact")?.slice(0, 120) ?? null,
    email: email?.slice(0, 200) ?? null,
    phone: strOrNull(fd, "phone")?.slice(0, 60) ?? null,
    notes: strOrNull(fd, "notes")?.slice(0, 2000) ?? null,
    costCodeIds: codes.length ? JSON.stringify(codes) : null,
  };
}

export const createVendor = friendly(async function createVendor(fd: FormData) {
  await requireAdmin();
  const v = await db.vendor.create({ data: await vendorFields(fd) });
  revalidatePath(PATH);
  redirect(`${PATH}#vendor-${v.id}`);
});

/** A new name goes everywhere the vendor is written (Item List items, bids). */
export const updateVendor = friendly(async function updateVendor(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const had = await db.vendor.findUnique({ where: { id }, select: { name: true } });
  if (!had) throw new Error("Vendor not found");
  const data = await vendorFields(fd, id);
  await db.vendor.update({ where: { id }, data });
  await renameVendorEverywhere(id, had.name, data.name);
  revalidatePath(PATH);
  revalidatePath("/settings/items");
  redirect(`${PATH}#vendor-${id}`);
});

/** Their bids stay on the jobs, under the name they had. */
export const deleteVendor = friendly(async function deleteVendor(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const certs = await db.vendorInsurance.findMany({ where: { vendorId: id }, select: { storagePath: true } });
  await db.vendor.deleteMany({ where: { id } });
  for (const c of certs) if (c.storagePath) await deleteUpload(c.storagePath);
  revalidatePath(PATH);
  redirect(PATH);
});

/** Rows from an uploaded list: CSV / text, or the first sheet of an Excel workbook. */
async function fileRows(file: File): Promise<string[][]> {
  const data = Buffer.from(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const rows: string[][] = [];
    ws?.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (c) => cells.push(c.text ?? ""));
      rows.push(cells);
    });
    return rows;
  }
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files can't be read — save it as .xlsx or CSV, or copy the rows and paste them.");
  // (A byte-order mark from Excel's "CSV UTF-8" is dropped.)
  return data
    .toString("utf8")
    .replace(new RegExp("^" + String.fromCharCode(0xfeff)), "")
    .split(/\r?\n/)
    .map(splitLine);
}

/**
 * Optional shortcut: a whole vendor list at once — pasted from Excel, or a CSV / Excel file
 * (an export from another program is fine). Ones you have already only get blanks filled in.
 */
export const importVendors = friendly(async function importVendors(fd: FormData) {
  await requireAdmin();
  const file = fd.get("file");
  const text = str(fd, "paste");
  let rows: string[][] = [];
  try {
    if (file instanceof File && file.size > 0) rows = await fileRows(file);
    else if (text) rows = text.split(/\r?\n/).map(splitLine);
  } catch (e) {
    redirect(`${PATH}?error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't read that file")}`);
  }
  const vendors = parseVendorRows(rows);
  if (!vendors.length) redirect(`${PATH}?error=${encodeURIComponent("No vendor names found — paste one vendor per line, name first.")}`);
  const r = await importVendorRows(vendors);
  revalidatePath(PATH);
  redirect(`${PATH}?added=${r.added}&updated=${r.updated}&same=${r.skipped}`);
});

// --- Insurance (COI) and portal logins ------------------------------------------------------

const vendorPath = (id: string) => `${PATH}/${id}`;
function revalidateVendor(id: string) {
  revalidatePath(PATH);
  revalidatePath(vendorPath(id));
  revalidatePath("/dashboard");
  revalidatePath("/vendor", "layout");
}

/** Which coverage every sub needs (Company → requiredCoverage). */
export const setRequiredCoverage = friendly(async function setRequiredCoverage(fd: FormData) {
  await requireAdmin();
  const types = fd
    .getAll("type")
    .map(String)
    .filter((t) => COVERAGE_TYPES.some((c) => c.value === t));
  const company = await db.company.findFirst({ select: { id: true } });
  if (company) await db.company.update({ where: { id: company.id }, data: { requiredCoverage: types.join(",") } });
  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirect(str(fd, "back").startsWith("/settings/vendors") ? str(fd, "back") : PATH);
});

/** Need this vendor's insurance? auto (once they're on a PO for work) / yes / no. */
export const setInsuranceRequired = friendly(async function setInsuranceRequired(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "vendorId");
  const v = str(fd, "value");
  await db.vendor.update({ where: { id }, data: { insuranceRequired: v === "yes" ? true : v === "no" ? false : null } });
  revalidateVendor(id);
  redirect(vendorPath(id));
});

/** A certificate you got from them (confirmed — you entered it). */
export const addInsurance = friendly(async function addInsurance(fd: FormData) {
  const admin = await requireAdmin();
  const vendorId = str(fd, "vendorId");
  const vendor = await db.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true } });
  if (!vendor) throw new Error("Vendor not found");
  const type = str(fd, "type");
  if (!COVERAGE_TYPES.some((c) => c.value === type)) throw new Error("Pick the kind of coverage");
  const expiresAt = parseDateInput(fd.get("expiresAt"));
  if (!expiresAt) throw new Error("When does it expire?");
  const file = fd.get("file");
  const meta = file instanceof File && file.size > 0 ? await saveUpload(file, `vendors/${vendor.id}`) : null;
  await db.vendorInsurance.create({
    data: {
      vendorId: vendor.id,
      type,
      carrier: strOrNull(fd, "carrier")?.slice(0, 120) ?? null,
      policyNumber: strOrNull(fd, "policyNumber")?.slice(0, 80) ?? null,
      expiresAt,
      confirmed: true,
      ...(meta ? { fileName: meta.name, storagePath: meta.storagePath, mimeType: meta.mimeType } : {}),
    },
  });
  await logActivity({ userId: admin.id, type: "vendor.insurance", description: `Insurance certificate added for ${vendor.name}` });
  revalidateVendor(vendor.id);
  redirect(vendorPath(vendor.id));
});

/** One they uploaded from their portal: you checked it, so it counts. Dates can be fixed as you confirm. */
export const confirmInsurance = friendly(async function confirmInsurance(fd: FormData) {
  await requireAdmin();
  const cert = await db.vendorInsurance.findUnique({ where: { id: str(fd, "id") } });
  if (!cert) throw new Error("Certificate not found");
  const type = str(fd, "type");
  await db.vendorInsurance.update({
    where: { id: cert.id },
    data: {
      confirmed: true,
      ...(COVERAGE_TYPES.some((c) => c.value === type) ? { type } : {}),
      expiresAt: parseDateInput(fd.get("expiresAt")) ?? cert.expiresAt,
    },
  });
  revalidateVendor(cert.vendorId);
  redirect(vendorPath(cert.vendorId));
});

export const deleteInsurance = friendly(async function deleteInsurance(fd: FormData) {
  await requireAdmin();
  const cert = await db.vendorInsurance.findUnique({ where: { id: str(fd, "id") } });
  if (!cert) throw new Error("Certificate not found");
  await db.vendorInsurance.delete({ where: { id: cert.id } });
  if (cert.storagePath) await deleteUpload(cert.storagePath);
  revalidateVendor(cert.vendorId);
  redirect(vendorPath(cert.vendorId));
});

/** Invites someone at the vendor to the vendor portal: they see their POs and schedule, upload bills and insurance. */
export const createVendorLogin = friendly(async function createVendorLogin(fd: FormData) {
  const admin = await requireAdmin();
  const vendorId = str(fd, "vendorId");
  const vendor = await db.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true } });
  if (!vendor) throw new Error("Vendor not found");
  const row = await invite({ kind: "VENDOR", email: str(fd, "email"), name: strOrNull(fd, "name"), vendorId: vendor.id }, admin);
  await logActivity({ userId: admin.id, type: "vendor.invited", description: `Invited ${row.email} (${vendor.name}) to the vendor portal` });
  revalidateVendor(vendor.id);
  redirect(vendorPath(vendor.id));
});

export const resendVendorInvite = friendly(async function resendVendorInvite(fd: FormData) {
  const admin = await requireAdmin();
  await resendInvite(str(fd, "inviteId"), admin);
  revalidateVendor(str(fd, "vendorId"));
});

export const cancelVendorInvite = friendly(async function cancelVendorInvite(fd: FormData) {
  await requireAdmin();
  await cancelInvite(str(fd, "inviteId"));
  revalidateVendor(str(fd, "vendorId"));
});

/** Emails a password-reset link, or turns the login on / off (off signs them out everywhere). */
export const updateVendorLogin = friendly(async function updateVendorLogin(fd: FormData) {
  await requireAdmin();
  const user = await db.user.findUnique({ where: { id: str(fd, "id") } });
  if (!user || user.role !== "VENDOR" || !user.vendorId) throw new Error("Login not found");
  if (str(fd, "reset") === "1") {
    if (!user.active) throw new Error("Turn the login on first");
    await sendResetEmail(user);
  }
  if (str(fd, "toggle") === "1") {
    await db.user.update({ where: { id: user.id }, data: { active: !user.active } });
    if (user.active) await signOutEverywhere(user.id);
  }
  revalidateVendor(user.vendorId);
  redirect(vendorPath(user.vendorId));
});

/** Removes a login; one that's uploaded something is turned off instead (its uploads keep who sent them). */
export const deleteVendorLogin = friendly(async function deleteVendorLogin(fd: FormData) {
  await requireAdmin();
  const user = await db.user.findUnique({ where: { id: str(fd, "id") } });
  if (!user || user.role !== "VENDOR" || !user.vendorId) throw new Error("Login not found");
  try {
    await db.user.delete({ where: { id: user.id } });
  } catch {
    await db.user.update({ where: { id: user.id }, data: { active: false } });
  }
  revalidateVendor(user.vendorId);
  redirect(vendorPath(user.vendorId));
});
