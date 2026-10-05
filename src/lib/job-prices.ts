import "server-only";
import { db } from "./db";

/**
 * One price per item, shared everywhere, until you lock it.
 *
 *  - An unlocked job follows the Item List: every takeoff line tied to an Item List
 *    item carries its price (pulled whenever the job is looked at or changed).
 *  - "This job only" (pinned) keeps a line's own price on an unlocked job.
 *  - A locked job (locked when an estimate is marked sent, or by hand) keeps its prices;
 *    Price review brings Item List prices in item by item or group by group.
 *  - Changing a price in the takeoff or the Material list: on an unlocked job, unless
 *    pinned, it's the Item List price (so every unlocked job gets it); on a locked job or
 *    a pinned item, it's this job's price only.
 *
 * Takeoffs priced on their own (no Item List item) are always the job's.
 */

export async function isJobLocked(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { pricesLockedAt: true } });
  return !!p?.pricesLockedAt;
}

/** Sets prices on lines, one update per price. */
async function setPrices(rows: { id: string; price: number }[], extra: { pricePinned?: boolean } = {}) {
  const byPrice = new Map<number, string[]>();
  for (const r of rows) byPrice.set(r.price, [...(byPrice.get(r.price) ?? []), r.id]);
  for (const [price, ids] of byPrice) await db.takeoffAssemblyItem.updateMany({ where: { id: { in: ids } }, data: { unitCost: price, ...extra } });
  return rows.length;
}

/**
 * An unlocked job takes the Item List's prices (pinned lines keep theirs). A $0 Item
 * List price is "not priced there yet" and never wipes a job's price. Returns how many
 * lines changed.
 */
export async function pullListPrices(projectId: string) {
  if (await isJobLocked(projectId)) return 0;
  const rows = await db.takeoffAssemblyItem.findMany({
    where: { condition: { projectId }, pricePinned: false, materialItemId: { not: null } },
    select: { id: true, unitCost: true, materialItem: { select: { unitCost: true } } },
  });
  const changed = rows.flatMap((r) => {
    const list = r.materialItem?.unitCost ?? 0;
    return list > 0 && Math.abs(list - r.unitCost) > 0.0001 ? [{ id: r.id, price: list }] : [];
  });
  return setPrices(changed);
}

/**
 * A price typed in the takeoff or the Material list for one Item List item on a job.
 * Returns where it went: "list" (the Item List, so every unlocked job) or "job".
 */
export async function setItemPrice(opts: { projectId: string; materialItemId: string; unitCost: number; pin: boolean; costCodeId?: string | null }) {
  const { projectId, materialItemId, unitCost, pin } = opts;
  const locked = await isJobLocked(projectId);
  const where = { materialItemId, condition: { projectId } };
  const code = opts.costCodeId !== undefined ? { costCodeId: opts.costCodeId } : {};
  if (locked || pin) {
    await db.takeoffAssemblyItem.updateMany({ where, data: { unitCost, ...code, ...(locked ? {} : { pricePinned: true }) } });
    return "job" as const;
  }
  await db.materialItem.update({ where: { id: materialItemId }, data: { unitCost } });
  await db.takeoffAssemblyItem.updateMany({ where, data: { unitCost, ...code, pricePinned: false } });
  return "list" as const;
}

/** Pins (keeps this job's price) or unpins (back to the Item List's) an item on a job. */
export async function setItemPin(projectId: string, materialItemId: string, pinned: boolean) {
  await db.takeoffAssemblyItem.updateMany({ where: { materialItemId, condition: { projectId } }, data: { pricePinned: pinned } });
  if (!pinned) await pullListPrices(projectId);
}

/** Locks a job's prices (no-op when already locked). */
export async function lockJobPrices(projectId: string) {
  await db.project.updateMany({ where: { id: projectId, pricesLockedAt: null }, data: { pricesLockedAt: new Date() } });
}

/** Unlocks: the job follows the Item List again and takes today's prices (pinned items keep theirs). */
export async function unlockJobPrices(projectId: string) {
  await db.project.update({ where: { id: projectId }, data: { pricesLockedAt: null } });
  return pullListPrices(projectId);
}

/** Price review: the chosen items take today's Item List price on this job (and stop being pinned). */
export async function applyListPrices(projectId: string, materialItemIds: string[]) {
  if (!materialItemIds.length) return 0;
  const rows = await db.takeoffAssemblyItem.findMany({
    where: { condition: { projectId }, materialItemId: { in: materialItemIds } },
    select: { id: true, materialItem: { select: { unitCost: true } } },
  });
  return setPrices(
    rows.flatMap((r) => (r.materialItem && r.materialItem.unitCost > 0 ? [{ id: r.id, price: r.materialItem.unitCost }] : [])),
    { pricePinned: false },
  );
}
