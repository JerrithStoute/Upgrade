"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { saveUpload } from "@/lib/uploads";
import { money, parseDateInput, str, strOrNull } from "@/lib/utils";
import { COVERAGE_TYPES, coverageLabel } from "@/lib/purchasing";

function revalidateAll(projectId?: string) {
  revalidatePath("/vendor", "layout");
  revalidatePath("/bills");
  revalidatePath("/dashboard");
  revalidatePath("/settings/vendors", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}/purchasing`, "layout");
}

/** They accept or decline a PO you sent them. */
export async function respondToPo(fd: FormData) {
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
  revalidateAll(po.projectId);
  redirect(`/vendor/pos/${po.id}`);
}

/**
 * They upload a bill for one of their POs: their file, bill #, date and amount. It waits for
 * your approval; its cost code is the PO's (the one most of the PO is in) — change it before approving.
 */
export async function uploadVendorBill(fd: FormData) {
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
  revalidateAll(po.projectId);
  redirect("/vendor/bills?sent=1");
}

/** They upload a certificate of insurance — it counts once you confirm it. */
export async function uploadVendorInsurance(fd: FormData) {
  const user = await requireVendor();
  const type = str(fd, "type");
  if (!COVERAGE_TYPES.some((c) => c.value === type)) throw new Error("Pick the kind of coverage");
  const expiresAt = parseDateInput(fd.get("expiresAt"));
  if (!expiresAt) throw new Error("When does it expire?");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Attach the certificate");
  const meta = await saveUpload(file, `vendors/${user.vendorId}`);
  await db.vendorInsurance.create({
    data: {
      vendorId: user.vendorId,
      type,
      carrier: strOrNull(fd, "carrier")?.slice(0, 120) ?? null,
      policyNumber: strOrNull(fd, "policyNumber")?.slice(0, 80) ?? null,
      expiresAt,
      confirmed: false,
      fileName: meta.name,
      storagePath: meta.storagePath,
      mimeType: meta.mimeType,
    },
  });
  await logActivity({ userId: user.id, type: "vendor.insurance", description: `${user.name} uploaded a ${coverageLabel(type)} certificate in their portal` });
  revalidateAll();
  redirect("/vendor/insurance?sent=1");
}
