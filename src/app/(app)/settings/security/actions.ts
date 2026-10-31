"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { boolField } from "@/lib/utils";

/** Require two-step sign-in for the whole team (admins and staff). */
export const setRequireTwoStep = friendly(async function setRequireTwoStep(formData: FormData) {
  const admin = await requireAdmin();
  const on = boolField(formData, "on");
  if (on) {
    const me = await systemDb.user.findUniqueOrThrow({ where: { id: admin.id }, select: { totpEnabledAt: true } });
    if (!me.totpEnabledAt) throw new Error("Turn on two-step sign-in for yourself first (Your account), then require it for the team");
  }
  const company = await db.company.findFirstOrThrow({ select: { id: true } });
  await db.company.update({ where: { id: company.id }, data: { requireTwoStep: on } });
  await logActivity({ userId: admin.id, type: "company.two-step", description: on ? "Required two-step sign-in for the team" : "Stopped requiring two-step sign-in" });
  revalidatePath("/settings/security");
});
