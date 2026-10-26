import "server-only";
import { db, systemDb } from "./db";
import { lumberUpToDate, whileWorkingOut } from "./lumber-state";
import { oneAtATime } from "./job-lock";
import { newItemPlacement } from "./item-codes";
import { kindOfLegacyCategory } from "./code-groups";
import { conditionTotals, loadConditions } from "./takeoff-data";
import { autoMetricPrefix, itemNameKey, pieceLengthFromName } from "./takeoff";

/**
 * Keeps each Walls and Openings condition's material lines in step with its
 * traced lines and options: one assembly item per material ("2x6 × 92-5/8" precut
 * stud", "2x6 × 16'", "7/16" OSB 4x8", "2x10 × 10'" headers…), linked to the Item
 * List, which gets the item the first time it's used. The condition's waste %
 * applies to studs, sheets and baseboard; packed plates and headers are exact.
 *
 * Prices are the job's (like other takeoff items): a new line copies the Item
 * List price, a line still at $0 picks it up once it's set; anything else changes
 * only through the Item List (unlocked jobs) or Price review. Materials the walls no longer need are removed.
 */
export async function syncWallItems(projectId: string, conditionId?: string) {
  const conditions = (await loadConditions(projectId)).filter(
    (c) => (c.type === "WALL" || c.type === "OPENING" || c.type === "DOOR" || c.type === "WINDOW") && (!conditionId || c.id === conditionId),
  );
  if (conditions.length === 0) return;

  for (const c of conditions) {
    const { wallLines } = conditionTotals(c);
    const prefix = autoMetricPrefix(c.type);
    const wanted = new Map(wallLines.map((l) => [`${prefix}${l.key}`, l]));
    const existing = c.items.filter((i) => i.metric.startsWith(prefix));
    for (const item of existing) if (!wanted.has(item.metric)) await db.takeoffAssemblyItem.deleteMany({ where: { id: item.id } });

    let sortOrder = Math.min(0, ...c.items.map((i) => i.sortOrder)) - wanted.size - 1;
    for (const [metric, line] of wanted) {
      const nameKey = itemNameKey(line.name);
      // A line's built-in category ("Sheathing", "Trim"…) says what kind of item it is.
      const kind = kindOfLegacyCategory(line.category);
      const place = kind ? await newItemPlacement(kind) : { kind: null, category: line.category, costCodeId: null };
      const listItem =
        (await db.materialItem.findFirst({ where: { nameKey } })) ??
        (await db.materialItem.create({
          data: {
            name: line.name,
            nameKey,
            category: place.category,
            kind: place.kind,
            unit: line.unit,
            unitCost: 0,
            roundUp: line.unit === "ea",
            costCodeId: place.costCodeId,
          },
        }));
      // Figured in feet but sold each (baseboard by the 16' stick): ordered in pieces — the feet ÷ the
      // piece length (from the item's name, or the takeoff's), rounded up, at the price each.
      const piece = line.unit === "lf" && listItem.unit === "ea" ? (pieceLengthFromName(listItem.name) ?? line.pieceFt ?? 16) : null;
      const shape = {
        description: listItem.name,
        qty: 1,
        per: piece ?? 1,
        unit: piece ? "ea" : line.unit,
        roundUp: piece ? true : line.unit === "ea",
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
            costCodeId: listItem.costCodeId ?? c.costCodeId,
            sortOrder: sortOrder++,
          },
        });
        continue;
      }
      const relinked = current.materialItemId !== listItem.id;
      // A line with no cost code takes the item's once it has one.
      const codeNow = !current.costCodeId && !!listItem.costCodeId;
      const unpriced = current.unitCost === 0 && listItem.unitCost > 0;
      const changed =
        relinked ||
        unpriced ||
        current.description !== shape.description ||
        current.unit !== shape.unit ||
        current.roundUp !== shape.roundUp ||
        current.wastePct !== shape.wastePct ||
        current.qty !== 1 ||
        current.per !== shape.per ||
        codeNow;
      if (changed) {
        await db.takeoffAssemblyItem.update({
          where: { id: current.id },
          data: {
            materialItemId: listItem.id,
            ...shape,
            ...(relinked || unpriced ? { unitCost: listItem.unitCost, costCodeId: listItem.costCodeId ?? c.costCodeId } : {}),
            ...(codeNow ? { costCodeId: listItem.costCodeId } : {}),
          },
        });
      }
    }
  }
}

/** Lumber, wall and opening lines together — what every "the takeoff changed" path calls. */
/**
 * One job's automatic lines are brought up to date one at a time: two pages loading at once
 * (two tabs, a reload mid-load) would otherwise both add and remove the same lines.
 */
const running = new Map<string, Promise<void>>();

export async function syncAutoItems(projectId: string, conditionId?: string) {
  const before = running.get(projectId) ?? Promise.resolve();
  const mine = before
    .catch(() => {})
    .then(async () => {
      // One copy of the app at a time per job (job-lock.ts) — two at once could add the same lines twice.
      // This copy's own runs already wait for each other (`running`); this covers the other copies.
      await oneAtATime(
        `lines:${projectId}`,
        5 * 60 * 1000,
        async () => {
          // When it started: a change made while it runs still counts as a change afterwards.
          const started = new Date();
          await whileWorkingOut(() => syncAutoItemsNow(projectId, conditionId));
          if (!conditionId) await systemDb.project.updateMany({ where: { id: projectId }, data: { lumberSyncedAt: started } });
        },
        2 * 60 * 1000,
      );
    });
  running.set(projectId, mine);
  try {
    await mine;
  } finally {
    if (running.get(projectId) === mine) running.delete(projectId);
  }
}

/**
 * Pages that show the lines (estimate, material list, bids): worked out again only when something
 * they come from changed since they last were (lumber-state.ts). Returns whether it ran.
 */
export async function syncAutoItemsIfChanged(projectId: string) {
  const p = await systemDb.project.findUnique({ where: { id: projectId }, select: { lumberChangedAt: true, lumberSyncedAt: true } });
  if (p && lumberUpToDate(p.lumberChangedAt, p.lumberSyncedAt)) {
    await running.get(projectId)?.catch(() => {}); // one already on its way: let it finish
    return false;
  }
  await syncAutoItems(projectId);
  return true;
}

async function syncAutoItemsNow(projectId: string, conditionId?: string) {
  const { syncLumberItems } = await import("./lumber");
  await syncLumberItems(projectId, conditionId);
  await syncWallItems(projectId, conditionId);
  // Items substituted on this job: the lines order the substitute.
  const { applySubstitutions } = await import("./substitutions");
  await applySubstitutions(projectId);
  // An unlocked job follows the Item List's prices.
  const { pullListPrices } = await import("./job-prices");
  await pullListPrices(projectId);
}
