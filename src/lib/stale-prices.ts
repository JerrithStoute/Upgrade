import "server-only";
import { db } from "./db";
import { costCodeLabel } from "./utils";
import { isStale, recheckOf, staleNote } from "./price-recheck";

/**
 * Of these Item List items, the ones whose price is past its cost code's recheck time:
 * item id → "Price checked Mar 3, 2025 — 06-100 Framing prices are rechecked every 3 weeks."
 */
export async function stalePrices(itemIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(itemIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const items = await db.materialItem.findMany({
    where: { id: { in: ids }, costCode: { priceRecheckEvery: { gt: 0 } } },
    select: { id: true, unitCost: true, priceCheckedAt: true, costCode: { select: { code: true, name: true, priceRecheckEvery: true, priceRecheckUnit: true } } },
  });
  const now = new Date();
  return new Map(
    items.flatMap((i) => {
      const r = recheckOf(i.costCode);
      return r && isStale(i, r, now) ? [[i.id, staleNote(i.priceCheckedAt, r, costCodeLabel(i.costCode!, " "))] as const] : [];
    }),
  );
}
