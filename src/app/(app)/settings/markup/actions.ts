"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { markupTableSchema } from "@/lib/markup";
import { str } from "@/lib/utils";

/** The Markup, margin & tax table new estimates and templates start with (each can change its own). */
export async function saveDefaultMarkupTable(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const parsed = markupTableSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the table's rows" };
  await db.company.updateMany({ data: { markupTable: JSON.stringify(parsed.data) } });
  await logActivity({ userId: admin.id, type: "company.updated", description: "Changed the default Markup, margin & tax table" });
  revalidatePath("/settings/markup");
  return { ok: true };
}

/** New allowances: profit in, or at cost. Each allowance can still be switched. */
export const saveAllowanceDefault = friendly(async function saveAllowanceDefault(fd: FormData) {
  const admin = await requireAdmin();
  const allowanceProfit = str(fd, "allowanceProfit") === "in";
  await db.company.updateMany({ data: { allowanceProfit } });
  await logActivity({ userId: admin.id, type: "company.updated", description: `New allowances start with profit ${allowanceProfit ? "in" : "out"}` });
  revalidatePath("/", "layout");
  redirect("/settings/markup?saved=1");
});
