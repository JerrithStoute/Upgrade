"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

const input = z.array(z.object({ name: z.string().trim().min(1).max(100), divisions: z.array(z.string().trim().min(1).max(200)).max(500) })).max(200);

/** Replaces your division list with what's on screen (names, order, and the cost code categories in each). */
export async function saveEstimateCategories(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Every division needs a name." };
  const cats = parsed.data;
  const names = new Set<string>();
  for (const c of cats) {
    const k = c.name.toLowerCase();
    if (names.has(k)) return { ok: false, error: `"${c.name}" is in the list twice — give each division its own name.` };
    names.add(k);
  }
  const divisions = new Set<string>();
  for (const c of cats)
    for (const d of c.divisions) {
      if (divisions.has(d)) return { ok: false, error: `"${d}" is in two divisions — a category can only be in one.` };
      divisions.add(d);
    }
  await db.$transaction(async (tx) => {
    await tx.estimateCategory.deleteMany({});
    for (const [i, c] of cats.entries()) {
      await tx.estimateCategory.create({
        data: { name: c.name, sortOrder: i, divisions: { create: c.divisions.map((division, j) => ({ division, sortOrder: j })) } },
      });
    }
  });
  await logActivity({ userId: admin.id, type: "settings.estimate_categories", description: `Estimate divisions saved (${cats.length})` });
  revalidatePath("/settings/estimate-divisions");
  revalidatePath("/projects", "layout");
  return { ok: true };
}
