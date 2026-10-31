"use server";

import { friendly } from "@/lib/friendly-action";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOutEverywhere, requireEdit, requireStaff } from "@/lib/auth";
import { allows } from "@/lib/access";
import { sendResetEmail } from "@/lib/account";
import { cancelInvite, invite, resendInvite } from "@/lib/invites";
import { db } from "@/lib/db";
import { fmtDate, parseDateInput, str, strOrNull } from "@/lib/utils";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { paperTypes, vendorPaperwork } from "@/lib/paperwork-server";
import { paperworkWarning, readNeeds, setNeeds } from "@/lib/paperwork";
import { logActivity } from "@/lib/activity";
import { cleanVendorName, parseVendorRows, splitLine, vendorKey } from "@/lib/vendors";
import { findOrAddVendor, importVendorRows, renameVendorEverywhere } from "@/lib/vendor-list";

const PATH = "/vendors";

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
  await requireEdit("lists");
  const v = await db.vendor.create({ data: await vendorFields(fd) });
  revalidatePath(PATH);
  redirect(`${PATH}#vendor-${v.id}`);
});

/** A new name goes everywhere the vendor is written (Item List items, bids). */
export const updateVendor = friendly(async function updateVendor(fd: FormData) {
  await requireEdit("lists");
  const id = str(fd, "id");
  const had = await db.vendor.findUnique({ where: { id }, select: { name: true } });
  if (!had) throw new Error("Vendor not found");
  const data = await vendorFields(fd, id);
  await db.vendor.update({ where: { id }, data });
  await renameVendorEverywhere(id, had.name, data.name);
  revalidatePath(PATH);
  revalidatePath("/catalog/items");
  redirect(`${PATH}#vendor-${id}`);
});

/** Their bids stay on the jobs, under the name they had. */
export const deleteVendor = friendly(async function deleteVendor(fd: FormData) {
  await requireEdit("lists");
  const id = str(fd, "id");
  const [certs, docs] = await Promise.all([
    db.vendorInsurance.findMany({ where: { vendorId: id }, select: { storagePath: true } }),
    db.vendorDoc.findMany({ where: { vendorId: id }, select: { storagePath: true } }),
  ]);
  await db.vendor.deleteMany({ where: { id } });
  // (A certificate moved over to paperwork shares its file: each file once.)
  for (const path of new Set([...certs, ...docs].map((c) => c.storagePath).filter((p): p is string => !!p))) await deleteUpload(path);
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
  await requireEdit("lists");
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

// --- Paperwork and portal logins ------------------------------------------------------

const vendorPath = (id: string) => `${PATH}/${id}`;
function revalidateVendor(id: string) {
  revalidatePath(PATH);
  revalidatePath(vendorPath(id));
  revalidatePath("/dashboard");
  revalidatePath("/vendor", "layout");
}

/** Your standard words in every bid email (Company → bidMessage); blank goes back to the built-in message. */
export const setBidMessage = friendly(async function setBidMessage(fd: FormData) {
  await requireEdit("lists");
  const message = str(fd, "bidMessage").slice(0, 20_000).trim() || null;
  const company = await db.company.findFirst({ select: { id: true } });
  if (company) await db.company.update({ where: { id: company.id }, data: { bidMessage: message } });
  revalidatePath(PATH);
  redirect(`${PATH}?bidMessage=saved`);
});

// --- Paperwork ------------------------------------------------------------------------------

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "That didn't save — try again" });

/** A file dropped on one of a vendor's paperwork lines (with its expiry, when that kind expires and it's known). */
export async function addVendorDoc(fd: FormData): Promise<Result> {
  try {
    const user = await requireEdit("lists");
    const [vendor, type] = await Promise.all([
      db.vendor.findUnique({ where: { id: str(fd, "vendorId") }, select: { id: true, name: true } }),
      db.paperworkType.findUnique({ where: { id: str(fd, "typeId") } }),
    ]);
    if (!vendor || !type) throw new Error("That vendor or paper isn't there any more — reload the page");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Pick a file");
    const meta = await saveUpload(file, `vendors/${vendor.id}`);
    const expiresAt = type.expires ? parseDateInput(fd.get("expiresAt")) : null;
    await db.vendorDoc.create({ data: { vendorId: vendor.id, typeId: type.id, expiresAt, confirmed: true, fileName: meta.name, storagePath: meta.storagePath, mimeType: meta.mimeType } });
    await logActivity({ userId: user.id, type: "vendor.paperwork", description: `${type.name} added for ${vendor.name}` });
    revalidateVendor(vendor.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** A paper's expiry date (typed after the file was dropped, or corrected). */
export async function setVendorDocDate(input: { id: string; expiresAt: string }): Promise<Result> {
  try {
    await requireEdit("lists");
    const doc = await db.vendorDoc.findUnique({ where: { id: input.id }, select: { id: true, vendorId: true } });
    if (!doc) throw new Error("That paper isn't there any more — reload the page");
    const expiresAt = parseDateInput(input.expiresAt);
    if (!expiresAt) throw new Error("Type the date it expires");
    await db.vendorDoc.update({ where: { id: doc.id }, data: { expiresAt } });
    revalidateVendor(doc.vendorId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** One they uploaded from their portal: you looked, so it counts (its date can be fixed as you do). */
export async function confirmVendorDoc(input: { id: string; expiresAt?: string }): Promise<Result> {
  try {
    await requireEdit("lists");
    const doc = await db.vendorDoc.findUnique({ where: { id: input.id }, select: { id: true, vendorId: true } });
    if (!doc) throw new Error("That paper isn't there any more — reload the page");
    const expiresAt = input.expiresAt ? parseDateInput(input.expiresAt) : undefined;
    await db.vendorDoc.update({ where: { id: doc.id }, data: { confirmed: true, ...(expiresAt ? { expiresAt } : {}) } });
    revalidateVendor(doc.vendorId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteVendorDoc(input: { id: string }): Promise<Result> {
  try {
    await requireEdit("lists");
    const doc = await db.vendorDoc.findUnique({ where: { id: input.id } });
    if (!doc) return { ok: true };
    await db.vendorDoc.delete({ where: { id: doc.id } });
    if (doc.storagePath) await deleteUpload(doc.storagePath);
    revalidateVendor(doc.vendorId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** What this vendor needs — ticked kinds; ones already needed keep the day they were first needed. */
export async function setVendorNeeds(input: { vendorId: string; typeIds: string[] }): Promise<Result> {
  try {
    await requireEdit("lists");
    const types = await paperTypes();
    const vendor = await db.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true, paperwork: true, createdAt: true } });
    if (!vendor) throw new Error("Vendor not found");
    const known = new Set(types.map((t) => t.id));
    const needs = setNeeds(readNeeds(vendor.paperwork, types, vendor.createdAt), input.typeIds.filter((id) => known.has(id)), new Date());
    await db.vendor.update({ where: { id: vendor.id }, data: { paperwork: JSON.stringify(needs) } });
    revalidateVendor(vendor.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Invites someone at the vendor to the vendor portal: they see their POs and schedule, upload bills and insurance. */
export const createVendorLogin = friendly(async function createVendorLogin(fd: FormData) {
  const admin = await requireEdit("lists");
  const vendorId = str(fd, "vendorId");
  const vendor = await db.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true } });
  if (!vendor) throw new Error("Vendor not found");
  const row = await invite({ kind: "VENDOR", email: str(fd, "email"), name: strOrNull(fd, "name"), vendorId: vendor.id }, admin);
  await logActivity({ userId: admin.id, type: "vendor.invited", description: `Invited ${row.email} (${vendor.name}) to the vendor portal` });
  revalidateVendor(vendor.id);
  redirect(vendorPath(vendor.id));
});

export const resendVendorInvite = friendly(async function resendVendorInvite(fd: FormData) {
  const admin = await requireEdit("lists");
  await resendInvite(str(fd, "inviteId"), admin);
  revalidateVendor(str(fd, "vendorId"));
});

export const cancelVendorInvite = friendly(async function cancelVendorInvite(fd: FormData) {
  await requireEdit("lists");
  await cancelInvite(str(fd, "inviteId"));
  revalidateVendor(str(fd, "vendorId"));
});

/** Emails a password-reset link, or turns the login on / off (off signs them out everywhere). */
export const updateVendorLogin = friendly(async function updateVendorLogin(fd: FormData) {
  await requireEdit("lists");
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
  await requireEdit("lists");
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

// --- Added from wherever you are -----------------------------------------------------------

/**
 * "+ New vendor…" in any vendor list (a schedule task, a warranty request, the job's subs): saved to Subs & vendors
 * and picked, without leaving the page. Anyone who can change the screen they're on can add one.
 */
export async function quickVendor(input: { name: string; contact?: string; phone?: string; email?: string }) {
  const user = await requireStaff();
  if (!(["lists", "field", "purchasing", "estimates"] as const).some((a) => allows(user.access, a, 2)))
    return { ok: false as const, error: "Your position can't add vendors — an admin can allow it in Settings → Team" };
  const r = await findOrAddVendor(input);
  if (!r.ok) return r;
  if (r.added) await logActivity({ userId: user.id, type: "vendor.created", description: `Added vendor ${r.vendor.name}` });
  revalidatePath(PATH);
  // Their paperwork note right away (a new sub owes your usual set).
  const paper = await vendorPaperwork(r.vendor.id);
  return { ok: true as const, option: { id: r.vendor.id, label: r.vendor.name, warn: paper ? paperworkWarning(paper.lines, (d) => fmtDate(d, "MMM d")) : "" } };
}
