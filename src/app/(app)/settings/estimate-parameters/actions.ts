"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

const input = z
  .array(
    z.object({
      id: z.string().nullable(),
      name: z.string().trim().min(1).max(80),
      unit: z.string().trim().max(20),
    }),
  )
  .max(300);

/**
 * Saves your parameter list as it is on screen. Existing parameters keep their id,
 * so formulas and every job's values stay attached when you rename them.
 */
export async function saveEstimateParameters(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Every parameter needs a name." };
  const rows = parsed.data;
  const names = new Set<string>();
  for (const r of rows) {
    if (/[[\]]/.test(r.name)) return { ok: false, error: `"${r.name}": names can't use [ or ] — formulas use them around names.` };
    const k = r.name.toLowerCase().replace(/\s+/g, " ");
    if (names.has(k)) return { ok: false, error: `"${r.name}" is in the list twice — give each parameter its own name.` };
    names.add(k);
  }

  await db.$transaction(async (tx) => {
    const existing = new Set((await tx.estimateParameter.findMany({ select: { id: true } })).map((p) => p.id));
    const keep = new Set(rows.flatMap((r) => (r.id && existing.has(r.id) ? [r.id] : [])));
    await tx.estimateParameter.deleteMany({ where: { id: { notIn: Array.from(keep) } } });
    // Names are unique: park kept ones under temporary names first so a swap of two names works.
    for (const id of keep) await tx.estimateParameter.update({ where: { id }, data: { name: `__renaming__${id}` } });
    for (const [i, r] of rows.entries()) {
      // The job's sq. ft. is typed at the bottom of the estimate, not tied to a parameter.
      const data = { name: r.name, unit: r.unit, isSqFt: false, sortOrder: i };
      if (r.id && keep.has(r.id)) await tx.estimateParameter.update({ where: { id: r.id }, data });
      else await tx.estimateParameter.create({ data });
    }
  });
  await logActivity({ userId: admin.id, type: "settings.estimate_parameters", description: `Estimate parameters saved (${rows.length})` });
  revalidatePath("/settings/estimate-parameters");
  revalidatePath("/projects", "layout");
  return { ok: true };
}
