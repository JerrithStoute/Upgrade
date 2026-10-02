import "server-only";
import { db } from "./db";
import { conditionTotals, loadConditions } from "./takeoff-data";
import { autoMetricPrefix, itemNameKey } from "./takeoff";

/**
 * Keeps each Walls and Openings condition's material lines in step with its
 * traced lines and options: one assembly item per material ("2x6 × 92-5/8" precut
 * stud", "2x6 × 16'", "7/16" OSB 4x8", "2x10 × 10'" headers…), linked to the Item
 * List, which gets the item the first time it's used. The condition's waste %
 * applies to studs, sheets and baseboard; packed plates and headers are exact.
 *
 * Prices are the job's (like other takeoff items): a new line copies the Item
 * List price, a line still at $0 picks it up once it's set; anything else changes
 * only on Rebid. Materials the walls no longer need are removed.
 */
export async function syncWallItems(projectId: string, conditionId?: string) {
  const conditions = (await loadConditions(projectId)).filter((c) => (c.type === "WALL" || c.type === "OPENING") && (!conditionId || c.id === conditionId));
  if (conditions.length === 0) return;
  const company = await db.company.findFirst({ select: { defaultMarkup: true } });

  for (const c of conditions) {
    const { wallLines } = conditionTotals(c);
    const prefix = autoMetricPrefix(c.type);
    const wanted = new Map(wallLines.map((l) => [`${prefix}${l.key}`, l]));
    const existing = c.items.filter((i) => i.metric.startsWith(prefix));
    for (const item of existing) if (!wanted.has(item.metric)) await db.takeoffAssemblyItem.delete({ where: { id: item.id } });

    let sortOrder = Math.min(0, ...c.items.map((i) => i.sortOrder)) - wanted.size - 1;
    for (const [metric, line] of wanted) {
      const nameKey = itemNameKey(line.name);
      const listItem =
        (await db.materialItem.findUnique({ where: { nameKey } })) ??
        (await db.materialItem.create({
          data: {
            name: line.name,
            nameKey,
            category: line.category,
            unit: line.unit,
            unitCost: 0,
            markupPct: company?.defaultMarkup ?? 20,
            roundUp: line.unit === "ea",
            costCodeId: c.costCodeId,
          },
        }));
      const shape = {
        description: listItem.name,
        qty: 1,
        per: 1,
        unit: line.unit,
        roundUp: line.unit === "ea",
        wastePct: line.waste ? c.wastePct : 0,
      };
      const current = existing.find((i) => i.metric === metric);
      if (!current) {
        await db.takeoffAssemblyItem.create({
          data: {
            conditionId: c.id,
            materialItemId: listItem.id,
            metric,
            ...shape,
            unitCost: listItem.unitCost,
            markupPct: listItem.markupPct,
            costCodeId: listItem.costCodeId ?? c.costCodeId,
            sortOrder: sortOrder++,
          },
        });
        continue;
      }
      const relinked = current.materialItemId !== listItem.id;
      const unpriced = current.unitCost === 0 && listItem.unitCost > 0;
      const changed =
        relinked ||
        unpriced ||
        current.description !== shape.description ||
        current.unit !== shape.unit ||
        current.roundUp !== shape.roundUp ||
        current.wastePct !== shape.wastePct ||
        current.qty !== 1 ||
        current.per !== 1;
      if (changed) {
        await db.takeoffAssemblyItem.update({
          where: { id: current.id },
          data: {
            materialItemId: listItem.id,
            ...shape,
            ...(relinked || unpriced ? { unitCost: listItem.unitCost, markupPct: listItem.markupPct, costCodeId: listItem.costCodeId ?? c.costCodeId } : {}),
          },
        });
      }
    }
  }
}

/** Lumber, wall and opening lines together — what every "the takeoff changed" path calls. */
export async function syncAutoItems(projectId: string, conditionId?: string) {
  const { syncLumberItems } = await import("./lumber");
  await syncLumberItems(projectId, conditionId);
  await syncWallItems(projectId, conditionId);
}
