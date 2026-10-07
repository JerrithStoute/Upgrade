"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { boolField, str } from "@/lib/utils";

/** Settings → Billing: what flows on by itself, and how invoices are numbered. */
export async function saveBilling(fd: FormData) {
  await requireAdmin();
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("Set up your company first");
  const next = str(fd, "invoiceNextNumber");
  const n = next ? Math.round(Number(next)) : null;
  if (n !== null && !(Number.isInteger(n) && n > 0)) throw new Error("The next invoice number is a whole number above 0");
  await db.company.update({
    where: { id: company.id },
    data: {
      autoSelectionCO: boolField(fd, "autoSelectionCO"),
      autoInvoiceCO: boolField(fd, "autoInvoiceCO"),
      invoiceNumbering: str(fd, "invoiceNumbering") === "MANUAL" ? "MANUAL" : "AUTO",
      invoiceNextNumber: n,
    },
  });
  revalidatePath("/settings/billing");
  redirect("/settings/billing?saved=1");
}
