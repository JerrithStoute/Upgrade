/**
 * Inventory arithmetic (no database, tested on its own): what stock is worth each as it
 * comes and goes, and how a pull is suggested.
 */

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Average cost after `qty` come in at `cost` each (what's on hand keeps its average). */
export function averageIn(onHand: number, avg: number, qty: number, cost: number) {
  const total = Math.max(0, onHand) + qty;
  if (total <= 0) return round(cost, 4);
  return round((Math.max(0, onHand) * avg + qty * cost) / total, 4);
}

/** Average cost after taking back `qty` that came in at `cost` (undoing a return or a stock add). */
export function averageOut(onHand: number, avg: number, qty: number, cost: number) {
  const left = onHand - qty;
  if (left <= 0) return avg;
  return round(Math.max(0, (onHand * avg - qty * cost) / left), 4);
}

/** What a pull suggests for a line: what the job still needs, as much as there is. */
export function suggestedPull(needed: number, alreadyPulled: number, onHand: number) {
  return Math.max(0, Math.min(onHand, needed - alreadyPulled));
}

/** How many to order once inventory covers some: never below zero. */
export function toOrder(needed: number, pulled: number) {
  return Math.max(0, round(needed - pulled, 4));
}
