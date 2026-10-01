import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { itemNameKey } from "./takeoff";

type Client = Prisma.TransactionClient | typeof db;

/** Item List entries for pickers (assembly item search). */
export function materialItemOptions() {
  return db.materialItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true, unit: true, unitCost: true, markupPct: true, wastePct: true, roundUp: true, costCodeId: true, sku: true },
  });
}

export type MaterialItemOption = Awaited<ReturnType<typeof materialItemOptions>>[number];

/**
 * The Item List entry for an assembly item: the one with the same name if it
 * exists, otherwise a new entry built from what was typed into the assembly.
 * Existing entries are never changed from here — prices on a job stay the job's.
 */
export async function resolveMaterialItem(
  client: Client,
  fields: { description: string; unit: string; unitCost: number; markupPct: number; wastePct: number; roundUp: boolean; costCodeId: string | null },
) {
  const nameKey = itemNameKey(fields.description);
  const existing = await client.materialItem.findUnique({ where: { nameKey }, select: { id: true, name: true } });
  if (existing) return { id: existing.id, name: existing.name, created: false };
  const costCode = fields.costCodeId ? await client.costCode.findUnique({ where: { id: fields.costCodeId }, select: { division: true } }) : null;
  const item = await client.materialItem.create({
    data: {
      name: fields.description.trim().replace(/\s+/g, " "),
      nameKey,
      category: costCode?.division ?? "General",
      unit: fields.unit,
      unitCost: fields.unitCost,
      markupPct: fields.markupPct,
      wastePct: fields.wastePct,
      roundUp: fields.roundUp,
      costCodeId: fields.costCodeId,
    },
  });
  return { id: item.id, name: item.name, created: true };
}
