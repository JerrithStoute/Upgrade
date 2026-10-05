"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { str, strOrNull } from "@/lib/utils";
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

export async function createVendor(fd: FormData) {
  await requireAdmin();
  const v = await db.vendor.create({ data: await vendorFields(fd) });
  revalidatePath(PATH);
  redirect(`${PATH}#vendor-${v.id}`);
}

/** A new name goes everywhere the vendor is written (Item List items, bids). */
export async function updateVendor(fd: FormData) {
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
}

/** Their bids stay on the jobs, under the name they had. */
export async function deleteVendor(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  await db.vendor.deleteMany({ where: { id } });
  revalidatePath(PATH);
  redirect(PATH);
}

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
export async function importVendors(fd: FormData) {
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
}
