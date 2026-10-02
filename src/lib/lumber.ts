import "server-only";
import { db } from "./db";
import { conditionTotals, loadConditions } from "./takeoff-data";
import { LUMBER_LF_METRIC, isLumberMetric, isMemberType, itemNameKey, lumberItemName, lumberMetric } from "./takeoff";

export const LUMBER_CATEGORY = "Framing Lumber";

type LumberLine = { metric: string; description: string; listName: string; listUnit: "ea" | "lf"; qty: number; unit: "ea" | "lf"; roundUp: boolean };

/**
 * Keeps each joist/rafter and hip/valley condition's lumber in step with its layout, as assembly
 * items linked to the Item List. How depends on the member size's "sold as":
 * - STOCK (default): one line per stock length, "2x6 × 20'" × 18 ea, priced each;
 * - EXACT_LF: one line per exact length, "14" Open-Web × 21'-4"" as lf, priced per lf;
 * - LF: one lineal-foot line for the size, priced per lf.
 * Item List entries are created the first time a size (and length, for STOCK) is used.
 *
 * The condition's Waste % applies to its lumber. Prices are the job's: a new line
 * copies the Item List price, a line still at $0 picks up the Item List price once
 * one is set, anything else changes only on Rebid. Lines the layout no longer
 * needs are removed.
 */
export async function syncLumberItems(projectId: string, conditionId?: string) {
  const conditions = (await loadConditions(projectId)).filter((c) => isMemberType(c.type) && (!conditionId || c.id === conditionId));
  if (conditions.length === 0) return;
  const company = await db.company.findFirst({ select: { defaultMarkup: true } });

  for (const c of conditions) {
    const { cutList, metrics } = conditionTotals(c);
    const soldAs = c.memberSizeRef?.soldAs ?? "STOCK";
    const size = c.memberSize?.trim() || null;

    const lines: LumberLine[] =
      soldAs === "LF"
        ? metrics.member_lf > 0
          ? [{ metric: LUMBER_LF_METRIC, description: size ?? c.name, listName: size ?? c.name, listUnit: "lf", qty: 1, unit: "lf", roundUp: false }]
          : []
        : cutList.map(([len]) =>
            soldAs === "EXACT_LF"
              ? { metric: lumberMetric(len), description: lumberItemName(size, c.name, len, true), listName: size ?? c.name, listUnit: "lf", qty: len, unit: "lf", roundUp: false }
              : { metric: lumberMetric(len), description: lumberItemName(size, c.name, len), listName: lumberItemName(size, c.name, len), listUnit: "ea", qty: 1, unit: "ea", roundUp: true },
          );
    const wanted = new Map(lines.map((l) => [l.metric, l]));
    const existing = c.items.filter((i) => isLumberMetric(i.metric));

    for (const item of existing) {
      if (!wanted.has(item.metric)) await db.takeoffAssemblyItem.delete({ where: { id: item.id } });
    }

    let sortOrder = Math.min(0, ...c.items.map((i) => i.sortOrder)) - lines.length - 1;
    for (const line of lines) {
      const nameKey = itemNameKey(line.listName);
      const listItem =
        (await db.materialItem.findUnique({ where: { nameKey } })) ??
        (await db.materialItem.create({
          data: {
            name: line.listName,
            nameKey,
            category: LUMBER_CATEGORY,
            unit: line.listUnit,
            unitCost: 0,
            markupPct: company?.defaultMarkup ?? 20,
            roundUp: line.listUnit === "ea",
            costCodeId: c.costCodeId,
          },
        }));
      const current = existing.find((i) => i.metric === line.metric);
      const shape = { description: line.description, qty: line.qty, per: 1, unit: line.unit, roundUp: line.roundUp, wastePct: c.wastePct };
      if (!current) {
        await db.takeoffAssemblyItem.create({
          data: {
            conditionId: c.id,
            materialItemId: listItem.id,
            metric: line.metric,
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
        Math.abs(current.qty - shape.qty) > 1e-9 ||
        current.unit !== shape.unit ||
        current.roundUp !== shape.roundUp ||
        current.wastePct !== shape.wastePct;
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
