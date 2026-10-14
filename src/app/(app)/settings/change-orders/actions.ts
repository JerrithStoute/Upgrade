"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { str } from "@/lib/utils";
import type { CoDefaults } from "@/lib/change-orders";

/**
 * What a new change order starts with — the same defaults "Use as default" sets from inside a
 * change order. Blank text leaves that part blank on new change orders.
 */
export const saveChangeOrderDefaults = friendly(async function saveChangeOrderDefaults(fd: FormData) {
  const admin = await requireAdmin();
  const text = (k: string) => str(fd, k).slice(0, 5000) || undefined;
  const mode = str(fd, "profitMode");
  const d: CoDefaults = {
    introText: text("introText"),
    closingText: text("closingText"),
    terms: text("terms"),
    ifDeclined: str(fd, "ifDeclined") === "CLEAR" ? "CLEAR" : "KEEP",
    profitMode: ["NONE", "PCT", "AMOUNT"].includes(mode) ? mode : "NONE",
    profitValue: mode === "PCT" || mode === "AMOUNT" ? Math.max(0, Number(str(fd, "profitValue")) || 0) : undefined,
    profitShown: str(fd, "profitShown") === "FOLDED" ? "FOLDED" : "LINE",
  };
  const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  await db.company.updateMany({ data: { changeOrderDefaults: JSON.stringify(clean) } });
  await logActivity({ userId: admin.id, type: "company.updated", description: "Changed the change order defaults" });
  revalidatePath("/settings/change-orders");
  redirect("/settings/change-orders?saved=1");
});
