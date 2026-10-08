import "server-only";
import { db } from "./db";
import { cleanVendorName, vendorKey, type VendorRow } from "./vendors";

/**
 * The vendor list builds itself: a vendor typed anywhere (the Item List, sending bids)
 * is added the first time, and spelled the way you first wrote it after that.
 * Returns the vendor's name as kept, or null for a blank.
 */
export async function ensureVendor(name: string | null | undefined): Promise<string | null> {
  const clean = cleanVendorName(name ?? "");
  if (!clean) return null;
  const all = await db.vendor.findMany({ select: { name: true } });
  const found = all.find((v) => vendorKey(v.name) === vendorKey(clean));
  if (found) return found.name;
  await db.vendor.create({ data: { name: clean } });
  return clean;
}

/** A renamed vendor, renamed everywhere it's written: Item List items and the bids sent to them. */
export async function renameVendorEverywhere(vendorId: string, oldName: string, newName: string) {
  if (oldName === newName) return;
  const items = await db.materialItem.findMany({ where: { vendor: { not: null } }, select: { id: true, vendor: true } });
  const ids = items.filter((i) => vendorKey(i.vendor ?? "") === vendorKey(oldName)).map((i) => i.id);
  if (ids.length) await db.materialItem.updateMany({ where: { id: { in: ids } }, data: { vendor: newName } });
  await db.bid.updateMany({ where: { vendorId }, data: { vendorName: newName } });
  await db.purchaseOrder.updateMany({ where: { vendorId }, data: { vendorName: newName } });
  await db.vendorBill.updateMany({ where: { vendorId }, data: { vendorName: newName } });
}

/** Adds vendors from a list; ones you already have get their blank details filled in, nothing overwritten. */
export async function importVendorRows(rows: VendorRow[]) {
  const all = await db.vendor.findMany();
  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const had = all.find((v) => vendorKey(v.name) === vendorKey(r.name));
    if (!had) {
      const v = await db.vendor.create({ data: { name: r.name, contact: r.contact, email: r.email, phone: r.phone, notes: r.notes } });
      all.push(v);
      added++;
      continue;
    }
    const fill = {
      ...(had.contact ? {} : r.contact ? { contact: r.contact } : {}),
      ...(had.email ? {} : r.email ? { email: r.email } : {}),
      ...(had.phone ? {} : r.phone ? { phone: r.phone } : {}),
      ...(had.notes ? {} : r.notes ? { notes: r.notes } : {}),
    };
    if (Object.keys(fill).length) {
      await db.vendor.update({ where: { id: had.id }, data: fill });
      updated++;
    }
  }
  return { added, updated, skipped: rows.length - added - updated };
}
