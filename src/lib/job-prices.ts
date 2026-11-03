import "server-only";
import { db } from "./db";
import { PRICE_CHECKED } from "./price-recheck";

/**
 * One price per item, shared everywhere.
 *
 *  - A job follows the Item List: every takeoff line tied to an Item List item carries its
 *    price (pulled whenever the job is looked at or changed).
 *  - "This job only" (pinned) keeps a line's own price.
 *  - Changing a price in the takeoff or the Material list: unless pinned, it's the Item List
 *    price (so every job gets it); pinned, it's this job's price only.
 *  - What a job was bid at is kept in its bid snapshots (bid-snapshots.ts), not by holding
 *    the job's prices still. Jobs locked before that come off the lock the first time
 *    they're priced (releaseOldPriceLock).
 *
 * Takeoffs priced on their own (no Item List item) are always the job's.
 */

/** A job on the old price lock: saved as a bid snapshot and released, once. */
async function releaseLock(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { pricesLockedAt: true } });
  if (!p?.pricesLockedAt) return false;
  const { releaseOldPriceLock } = await import("./bid-snapshots");
  return releaseOldPriceLock(projectId);
}

/** Sets prices on lines, one update per price. */
async function setPrices(rows: { id: string; price: number }[], extra: { pricePinned?: boolean } = {}) {
  const byPrice = new Map<number, string[]>();
  for (const r of rows) byPrice.set(r.price, [...(byPrice.get(r.price) ?? []), r.id]);
  for (const [price, ids] of byPrice) await db.takeoffAssemblyItem.updateMany({ where: { id: { in: ids } }, data: { unitCost: price, ...extra } });
  return rows.length;
}

/**
 * A job takes the Item List's prices (pinned lines keep theirs). A $0 Item List price is
 * "not priced there yet" and never wipes a job's price. Returns how many lines changed.
 */
export async function pullListPrices(projectId: string) {
  // (Releasing pulls the prices itself.)
  if (await releaseLock(projectId)) return 0;
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
 * Returns where it went: "list" (the Item List, so every job) or "job".
 * Only the price is shared: each takeoff's line keeps its own cost code (concrete can be
 * Footings in one takeoff and Flatwork in another).
 */
export async function setItemPrice(opts: { projectId: string; materialItemId: string; unitCost: number; pin: boolean }) {
  const { projectId, materialItemId, unitCost, pin } = opts;
  await releaseLock(projectId);
  const where = { materialItemId, condition: { projectId } };
  if (pin) {
    await db.takeoffAssemblyItem.updateMany({ where, data: { unitCost, pricePinned: true } });
    return "job" as const;
  }
  await db.materialItem.update({ where: { id: materialItemId }, data: { unitCost, ...PRICE_CHECKED() } });
  await db.takeoffAssemblyItem.updateMany({ where, data: { unitCost, pricePinned: false } });
  return "list" as const;
}

/** Pins (keeps this job's price) or unpins (back to the Item List's) an item on a job. */
export async function setItemPin(projectId: string, materialItemId: string, pinned: boolean) {
  await db.takeoffAssemblyItem.updateMany({ where: { materialItemId, condition: { projectId } }, data: { pricePinned: pinned } });
  if (!pinned) await pullListPrices(projectId);
}
