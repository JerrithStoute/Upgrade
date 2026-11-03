"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { boolField, str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

/** Settings → Invoices: what flows on by itself, and how invoices are numbered. */
export const saveBilling = friendly(async function saveBilling(fd: FormData) {
  const admin = await requireAdmin();
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("Set up your company first");
  const next = str(fd, "invoiceNextNumber");
  const n = next ? Math.round(Number(next)) : null;
  if (n !== null && !(Number.isInteger(n) && n > 0)) throw new Error("The next invoice number is a whole number above 0");
  const invoiceDrawCodeId = await pickedCode(fd, "invoiceDrawCodeId", admin.id);
  const invoiceCoCodeId = await pickedCode(fd, "invoiceCoCodeId", admin.id);
  await db.company.update({
    where: { id: company.id },
    data: {
      autoSelectionCO: boolField(fd, "autoSelectionCO"),
      autoInvoiceCO: boolField(fd, "autoInvoiceCO"),
      invoiceNumbering: str(fd, "invoiceNumbering") === "MANUAL" ? "MANUAL" : "AUTO",
      invoiceNextNumber: n,
      invoiceDrawCodeId,
      invoiceCoCodeId,
    },
  });
  revalidatePath("/settings/invoices");
  redirect("/settings/invoices?saved=1");
});

/** A cost code picked in the form: one of yours, a new one ("+ New cost code…"), or none. */
async function pickedCode(fd: FormData, name: string, userId: string) {
  const v = str(fd, name);
  if (v === "__new") {
    const codeName = str(fd, `${name}NewName`);
    if (!codeName) throw new Error("Name the new cost code");
    const code = str(fd, `${name}NewCode`) || null;
    // Typed one you already have: that one.
    const have = await db.costCode.findFirst({ where: code ? { code } : { name: { equals: codeName, mode: "insensitive" } }, select: { id: true } });
    if (have) return have.id;
    const made = await db.costCode.create({ data: { code, name: codeName, division: "General", active: true } });
    await logActivity({ userId, type: "cost_code.created", description: `Added cost code ${code ? `${code} ` : ""}${codeName}` });
    return made.id;
  }
  if (!v) return null;
  return (await db.costCode.findFirst({ where: { id: v }, select: { id: true } }))?.id ?? null;
}
