"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { saveUpload } from "@/lib/uploads";
import { fmtDate, money, parseDateInput, str, strOrNull } from "@/lib/utils";
import { isOpen, warrantyNo } from "@/lib/warranty";
import { emailWarrantyToClient, emailWarrantyToTeam, photosFrom, saveWarrantyPhotos } from "@/lib/warranty-server";
import { notifyOn } from "@/lib/notify-recipients";
import { emailBillUploaded, emailPaperworkUploaded, emailPoAnswered } from "@/lib/notify";

function revalidateAll(projectId?: string) {
  revalidatePath("/vendor", "layout");
  revalidatePath("/bills");
  revalidatePath("/dashboard");
  revalidatePath("/vendors", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}/purchasing`, "layout");
}

/** They accept or decline a PO you sent them. */
export const respondToPo = friendly(async function respondToPo(fd: FormData) {
  const user = await requireVendor();
  const po = await db.purchaseOrder.findFirst({ where: { id: str(fd, "id"), vendorId: user.vendorId } });
  if (!po) throw new Error("PO not found");
  if (po.status !== "SENT") throw new Error("This PO isn't waiting for your answer");
  const accept = str(fd, "answer") === "accept";
  const note = strOrNull(fd, "note")?.slice(0, 1000) ?? null;
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date(), responseNote: note } });
  await logActivity({
    projectId: po.projectId,
    userId: user.id,
    type: "po.status",
    description: `PO-${po.number} ${accept ? "accepted" : "declined"} by ${user.name} (${po.vendorName}) in their portal${note ? `: “${note}”` : ""}`,
  });
  await emailPoAnswered(po.id, user.name);
  revalidateAll(po.projectId);
  redirect(`/vendor/pos/${po.id}`);
});

/**
 * They upload a bill for one of their POs: their file, bill #, date and amount. It waits for
 * your approval; its cost code is the PO's (the one most of the PO is in) — change it before approving.
 */
export const uploadVendorBill = friendly(async function uploadVendorBill(fd: FormData) {
  const user = await requireVendor();
  const po = await db.purchaseOrder.findFirst({
    where: { id: str(fd, "purchaseOrderId"), vendorId: user.vendorId, status: { in: ["SENT", "ACCEPTED"] } },
    include: { lines: true },
  });
  if (!po) throw new Error("Pick the PO this bill is for");
  const amount = Math.round(Number(str(fd, "amount")) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter the bill's amount");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Attach your bill (PDF or photo)");
  const byCode = new Map<string | null, number>();
  for (const l of po.lines) byCode.set(l.costCodeId, (byCode.get(l.costCodeId) ?? 0) + l.quantity * l.unitCost);
  const costCodeId = [...byCode.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const meta = await saveUpload(file, po.projectId);
  const asset = await db.fileAsset.create({ data: { ...meta, projectId: po.projectId, uploadedById: user.id, folder: "Bills", clientVisible: false } });
  await db.vendorBill.create({
    data: {
      projectId: po.projectId,
      vendorId: user.vendorId,
      vendorName: po.vendorName,
      purchaseOrderId: po.id,
      billNumber: strOrNull(fd, "billNumber")?.slice(0, 60) ?? null,
      billDate: parseDateInput(fd.get("billDate")) ?? new Date(),
      dueDate: parseDateInput(fd.get("dueDate")),
      notes: strOrNull(fd, "notes")?.slice(0, 1000) ?? null,
      fileId: asset.id,
      fromPortal: true,
      lines: { create: [{ description: strOrNull(fd, "description")?.slice(0, 500) ?? `${po.title} (PO-${po.number})`, costCodeId, amount, sortOrder: 0 }] },
    },
  });
  await logActivity({
    projectId: po.projectId,
    userId: user.id,
    type: "bill.created",
    description: `Bill from ${po.vendorName} on PO-${po.number} uploaded in their portal (${money(amount)})`,
  });
  await emailBillUploaded(po.id, amount);
  revalidateAll(po.projectId);
  redirect("/vendor/bills?sent=1");
});

/** They send a paper you need (their W-9, an insurance certificate…) — it counts once someone on your team looks it over. */
export const uploadVendorPaper = friendly(async function uploadVendorPaper(fd: FormData) {
  const user = await requireVendor();
  const type = await db.paperworkType.findUnique({ where: { id: str(fd, "typeId") } });
  if (!type) throw new Error("Pick what you're sending");
  const expiresAt = type.expires ? parseDateInput(fd.get("expiresAt")) : null;
  if (type.expires && !expiresAt) throw new Error("When does it expire?");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Attach the file");
  const meta = await saveUpload(file, `vendors/${user.vendorId}`);
  await db.vendorDoc.create({
    data: { vendorId: user.vendorId, typeId: type.id, expiresAt, confirmed: false, fileName: meta.name, storagePath: meta.storagePath, mimeType: meta.mimeType },
  });
  await logActivity({ userId: user.id, type: "vendor.paperwork", description: `${user.name} sent their ${type.name} in their portal` });
  await emailPaperworkUploaded(user.vendorId, type.name, expiresAt);
  revalidateAll();
  redirect("/vendor/paperwork?sent=1");
});

// --- Warranty work ------------------------------------------------------------------------

async function theirWarranty(id: string, vendorId: string) {
  const w = await db.warrantyRequest.findFirst({ where: { id, vendorId } });
  if (!w) throw new Error("That warranty request isn't yours anymore");
  if (!isOpen(w.status)) throw new Error("This one is already closed");
  return w;
}

function revalidateWarranty(projectId: string) {
  revalidatePath("/vendor/warranty");
  revalidatePath("/warranty");
  revalidatePath(`/projects/${projectId}/warranty`, "layout");
  revalidatePath("/portal", "layout");
}

/** The day they'll be there: the homeowner and the team hear. */
export const vendorWarrantyDay = friendly(async function vendorWarrantyDay(fd: FormData) {
  const user = await requireVendor();
  const w = await theirWarranty(str(fd, "id"), user.vendorId);
  const day = parseDateInput(fd.get("scheduledFor"));
  if (!day) throw new Error("Pick the day you'll be there");
  await db.warrantyRequest.update({ where: { id: w.id }, data: { scheduledFor: day, status: "SCHEDULED" } });
  const vendor = await db.vendor.findUnique({ where: { id: user.vendorId }, select: { name: true } });
  await logActivity({ projectId: w.projectId, userId: user.id, type: "warranty.updated", description: `Warranty ${warrantyNo(w.number)} scheduled by ${user.name} (${vendor?.name ?? "sub"}) for ${fmtDate(day)}` });
  await emailWarrantyToTeam(w.id, { subject: `${vendor?.name ?? user.name} scheduled warranty ${warrantyNo(w.number)}`, lines: [`${user.name} at ${vendor?.name ?? "the sub"} will be there ${fmtDate(day, "EEEE, MMMM d")}.`] });
  if (await notifyOn("warrantyFromSub")) await emailWarrantyToClient(w.id, null, "SCHEDULED");
  revalidateWarranty(w.projectId);
});

/** A note for the builder (and photos) — team only: the builder decides what the homeowner hears. */
export const vendorWarrantyNote = friendly(async function vendorWarrantyNote(fd: FormData) {
  const user = await requireVendor();
  const w = await theirWarranty(str(fd, "id"), user.vendorId);
  const body = str(fd, "body").slice(0, 4000);
  const photos = photosFrom(fd);
  if (!body && !photos.length) throw new Error("Write a note or add a photo");
  if (body) await db.warrantyNote.create({ data: { requestId: w.id, authorId: user.id, body, teamOnly: true } });
  const names = await saveWarrantyPhotos(w.id, w.projectId, photos, user.id);
  await emailWarrantyToTeam(w.id, {
    subject: `Note from ${user.name} on warranty ${warrantyNo(w.number)}`,
    lines: [...(body ? [`${user.name} wrote:`, body.slice(0, 600)] : []), ...(names.length ? [`${names.length} photo${names.length === 1 ? "" : "s"} added.`] : [])],
  });
  revalidateWarranty(w.projectId);
});

/** Done: what they did, and after photos. The homeowner and the team hear; the team can reopen it. */
export const vendorWarrantyDone = friendly(async function vendorWarrantyDone(fd: FormData) {
  const user = await requireVendor();
  const w = await theirWarranty(str(fd, "id"), user.vendorId);
  const closeNote = str(fd, "closeNote").slice(0, 2000);
  if (!closeNote) throw new Error("Say what you did");
  await saveWarrantyPhotos(w.id, w.projectId, photosFrom(fd), user.id);
  await db.warrantyRequest.update({ where: { id: w.id }, data: { status: "DONE", closeNote, closedAt: new Date() } });
  await logActivity({ projectId: w.projectId, userId: user.id, type: "warranty.closed", description: `Warranty ${warrantyNo(w.number)} marked done by ${user.name}: ${closeNote.slice(0, 200)}` });
  await emailWarrantyToTeam(w.id, { subject: `Warranty ${warrantyNo(w.number)} done`, lines: [`${user.name} marked it done:`, closeNote.slice(0, 600), "If it isn't, reopen it on the request."] });
  if (await notifyOn("warrantyFromSub")) await emailWarrantyToClient(w.id, null, "DONE");
  revalidateWarranty(w.projectId);
});
