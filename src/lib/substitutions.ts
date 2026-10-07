import "server-only";
import { db } from "./db";
import { DEFAULT_STOCK_LENGTHS, LUMBER_METRIC_PREFIX, itemNameKey, lumberItemName, lumberOf, parseStockLengths } from "./takeoff";

/**
 * Substitutions on a job: "order this instead of that", wherever the job orders it.
 *
 *  - Another product (a hanger brand, OSB for plywood): the job's takeoff lines for the item
 *    point at the new one — its name, its price — in the same quantity, under the same cost
 *    code. Lines added later (a new takeoff) are switched too.
 *  - The same lumber at another length ("2x6 × 26'" → "2x6 × 28'"): that length isn't used
 *    on the job, so the takeoff cuts those pieces from the other length — the plan labels,
 *    cut sheet and order all say 28'.
 *
 * Other jobs and the Item List's own items aren't touched. "Swap back" undoes one.
 */

type Restore = { id: string; materialItemId: string | null; description: string; unitCost: number; pricePinned: boolean }[];

export function jobSubstitutions(projectId: string) {
  return db.jobSubstitution.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

/**
 * Length substitutions applied to a job's takeoffs as they load: a takeoff of that size
 * doesn't use the replaced length (its pieces come from the other one).
 */
export function withLengthSubstitutions<T extends { memberSize: string | null; stockLengths: string | null; packLength: number | null }>(
  conditions: T[],
  subs: { size: string | null; fromLen: number | null; toLen: number | null }[],
): T[] {
  const bySize = subs.filter((s) => s.size && s.fromLen && s.toLen);
  if (!bySize.length) return conditions;
  return conditions.map((c) => {
    const mine = c.memberSize ? bySize.filter((s) => itemNameKey(s.size!) === itemNameKey(c.memberSize!)) : [];
    if (!mine.length) return c;
    let stock = parseStockLengths(c.stockLengths) ?? DEFAULT_STOCK_LENGTHS;
    let packLength = c.packLength;
    for (const s of mine) {
      if (!stock.includes(s.fromLen!) && packLength !== s.fromLen) continue;
      stock = Array.from(new Set([...stock.filter((l) => l !== s.fromLen), s.toLen!])).sort((a, b) => a - b);
      if (packLength === s.fromLen) packLength = s.toLen;
    }
    return { ...c, stockLengths: stock.join(","), packLength };
  });
}

/** The job's product substitutions, by the item they replace — for the lumber lines the layout makes. */
export async function productSubstitutions(projectId: string) {
  const subs = await db.jobSubstitution.findMany({ where: { projectId, toItemId: { not: null }, fromLen: null } });
  return new Map(subs.map((s) => [s.fromItemId, s]));
}

const parseRestore = (json: string | null | undefined): Restore => {
  try {
    const v = json ? JSON.parse(json) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/**
 * Keeps the job's takeoff lines on its substitutions: lines still on a replaced item move to the
 * new one (remembering what they were), and lines of a substituted length take its price when
 * the substitution has one. Runs after every takeoff change (syncAutoItems).
 */
export async function applySubstitutions(projectId: string) {
  const subs = await db.jobSubstitution.findMany({ where: { projectId } });
  for (const s of subs) {
    const restore = parseRestore(s.restore);
    const known = new Set(restore.map((r) => r.id));
    let changed = false;
    if (s.fromLen == null) {
      if (!s.toItemId) continue;
      const to = await db.materialItem.findUnique({ where: { id: s.toItemId }, select: { unitCost: true } });
      if (!to) continue;
      const rows = await db.takeoffAssemblyItem.findMany({ where: { materialItemId: s.fromItemId, condition: { projectId } } });
      // Boards the layout already orders as the substitute (lumber.ts) take its price too.
      if (s.unitCost != null)
        rows.push(
          ...(await db.takeoffAssemblyItem.findMany({
            where: { materialItemId: s.toItemId, condition: { projectId }, metric: { startsWith: LUMBER_METRIC_PREFIX }, NOT: { unitCost: s.unitCost } },
          })),
        );
      for (const r of rows) {
        if (!known.has(r.id)) restore.push({ id: r.id, materialItemId: r.materialItemId, description: r.description, unitCost: r.unitCost, pricePinned: r.pricePinned });
        await db.takeoffAssemblyItem.update({
          where: { id: r.id },
          data: { materialItemId: s.toItemId, description: s.toName, unitCost: s.unitCost ?? to.unitCost, pricePinned: s.unitCost != null },
        });
        changed = true;
      }
    } else if (s.unitCost != null) {
      // The length's lines on this job take the substitution's price (kept for this job).
      const rows = await db.takeoffAssemblyItem.findMany({
        where: { condition: { projectId }, metric: { startsWith: LUMBER_METRIC_PREFIX }, materialItem: { nameKey: itemNameKey(s.toName) } },
      });
      for (const r of rows) {
        if (Math.abs(r.unitCost - s.unitCost) < 1e-9 && r.pricePinned) continue;
        if (!known.has(r.id)) restore.push({ id: r.id, materialItemId: r.materialItemId, description: r.description, unitCost: r.unitCost, pricePinned: r.pricePinned });
        await db.takeoffAssemblyItem.update({ where: { id: r.id }, data: { unitCost: s.unitCost, pricePinned: true } });
        changed = true;
      }
    }
    if (changed) await db.jobSubstitution.update({ where: { id: s.id }, data: { restore: JSON.stringify(restore) } });
  }
}

export type SubstituteWith = { kind: "length"; length: number } | { kind: "item"; itemId: string } | { kind: "new"; name: string; unit: string };

/**
 * Substitutes an Item List item on a job. `unitCost`: the price it's bought at on this job
 * (null = the Item List's). Replaces an earlier substitution of the same item.
 */
export async function addSubstitution(
  projectId: string,
  input: { fromItemId: string; with: SubstituteWith; unitCost: number | null; source?: string | null; listPrice?: boolean; vendor?: string | null },
) {
  const from = await db.materialItem.findUnique({ where: { id: input.fromItemId } });
  if (!from) throw new Error("That item isn't on the Item List anymore");
  const old = await db.jobSubstitution.findUnique({ where: { projectId_fromItemId: { projectId, fromItemId: from.id } } });
  if (old) await swapBack(projectId, old.id, false);

  let data: { toItemId: string | null; toName: string; size: string | null; fromLen: number | null; toLen: number | null };
  const lumber = lumberOf(from.name);
  const pickedItem = input.with.kind === "item" ? await db.materialItem.findUnique({ where: { id: input.with.itemId } }) : null;
  if (input.with.kind === "item" && !pickedItem) throw new Error("Pick an item");
  // The same lumber at another length — picked as a length, or as that length's Item List item.
  const toLumber = pickedItem ? lumberOf(pickedItem.name) : null;
  const length = input.with.kind === "length" ? input.with.length : lumber && toLumber && itemNameKey(toLumber.size) === itemNameKey(lumber.size) ? toLumber.length : null;
  if (length != null) {
    if (!lumber) throw new Error("Only lumber sold by the length can change length");
    if (!(length > 0) || length === lumber.length) throw new Error("Pick another length");
    const toName = lumberItemName(lumber.size, lumber.size, length);
    const toItem = await db.materialItem.findUnique({ where: { nameKey: itemNameKey(toName) }, select: { id: true } });
    data = { toItemId: toItem?.id ?? null, toName, size: lumber.size, fromLen: lumber.length, toLen: length };
  } else {
    let to = pickedItem;
    if (input.with.kind === "new") {
      const name = input.with.name.trim();
      if (!name) throw new Error("Name what you'll order instead");
      to =
        (await db.materialItem.findUnique({ where: { nameKey: itemNameKey(name) } })) ??
        (await db.materialItem.create({
          data: {
            name,
            nameKey: itemNameKey(name),
            unit: input.with.unit.trim() || from.unit,
            category: from.category,
            kind: from.kind,
            costCodeId: from.costCodeId,
            markupPct: from.markupPct,
            roundUp: from.roundUp,
            // A new item starts at the price you bought it at.
            unitCost: input.unitCost ?? 0,
            vendor: input.vendor ?? null,
          },
        }));
    }
    if (!to) throw new Error("Pick an item");
    if (to.id === from.id) throw new Error("That's the same item");
    data = { toItemId: to.id, toName: to.name, size: null, fromLen: null, toLen: null };
    // A bid taken for every job: the new item's Item List price and vendor are the bid's.
    if (input.listPrice && input.unitCost != null)
      await db.materialItem.update({ where: { id: to.id }, data: { unitCost: input.unitCost, ...(input.vendor ? { vendor: input.vendor } : {}) } });
  }
  const sub = await db.jobSubstitution.create({
    data: { projectId, fromItemId: from.id, fromName: from.name, ...data, unitCost: input.unitCost, source: input.source ?? null },
  });
  const { syncAutoItems } = await import("./walls");
  await syncAutoItems(projectId);
  return sub;
}

/** Undoes a substitution: the lines it changed go back to what they were. */
export async function swapBack(projectId: string, id: string, resync = true) {
  const s = await db.jobSubstitution.findFirst({ where: { id, projectId } });
  if (!s) throw new Error("That substitution is already gone");
  const restore = parseRestore(s.restore);
  const from = await db.materialItem.findUnique({ where: { id: s.fromItemId }, select: { id: true } });
  for (const r of restore) {
    const row = await db.takeoffAssemblyItem.findUnique({ where: { id: r.id }, select: { id: true } });
    if (!row) continue;
    await db.takeoffAssemblyItem.update({
      where: { id: r.id },
      data: {
        description: r.description,
        unitCost: r.unitCost,
        pricePinned: r.pricePinned,
        ...(s.fromLen == null ? { materialItemId: from ? r.materialItemId : null } : {}),
      },
    });
  }
  await db.jobSubstitution.delete({ where: { id: s.id } });
  if (resync) {
    const { syncAutoItems } = await import("./walls");
    await syncAutoItems(projectId);
  }
  return s;
}
