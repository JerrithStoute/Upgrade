import "server-only";
import { db } from "./db";

/**
 * Two Item List items that are one (Catalog → Item List → Possible duplicates): everything that points at
 * `dropId` — doors and windows placed on plans, takeoff and template items, estimate lines, bid lines,
 * substitutions, the jobs' door and window lists — points at `keepId` instead, and `dropId` is deleted.
 * The one kept keeps its own name, price and cost code. Inventory: only one of them may be stocked.
 */
export async function mergeItems(keepId: string, dropId: string) {
  if (keepId === dropId) throw new Error("Pick two different items");
  const [keep, drop] = await Promise.all([
    db.materialItem.findUnique({ where: { id: keepId }, select: { id: true, name: true, inventory: { select: { id: true } } } }),
    db.materialItem.findUnique({ where: { id: dropId }, select: { id: true, name: true, inventory: { select: { id: true } } } }),
  ]);
  if (!keep || !drop) throw new Error("That item isn't on the Item List any more — reload the page");
  if (keep.inventory && drop.inventory) throw new Error(`Both are in Inventory — take "${drop.name}" off Inventory first, then merge`);

  // The jobs' door / window lists hold item ids (JSON): the one dropped becomes the one kept, once.
  const listed = await db.project.findMany({
    where: { OR: [{ windowList: { contains: dropId } }, { doorList: { contains: dropId } }] },
    select: { id: true, windowList: true, doorList: true },
  });
  const swap = (raw: string | null) => {
    if (!raw || !raw.includes(dropId)) return undefined;
    try {
      const v = JSON.parse(raw) as { lines?: unknown };
      const lines = Array.isArray(v.lines) ? v.lines.map((x) => (x === dropId ? keepId : x)) : [];
      return JSON.stringify({ ...v, lines: Array.from(new Set(lines)) });
    } catch {
      return undefined;
    }
  };
  // A substitution for the dropped one on a job that already has one for the kept one: the kept one's stays.
  const subs = await db.jobSubstitution.findMany({ where: { fromItemId: dropId }, select: { id: true, projectId: true } });
  const keptSubs = new Set((await db.jobSubstitution.findMany({ where: { fromItemId: keepId }, select: { projectId: true } })).map((s) => s.projectId));

  await db.$transaction([
    db.takeoffMeasurement.updateMany({ where: { materialItemId: dropId }, data: { materialItemId: keepId } }),
    db.takeoffAssemblyItem.updateMany({ where: { materialItemId: dropId }, data: { materialItemId: keepId } }),
    db.takeoffTemplateItem.updateMany({ where: { materialItemId: dropId }, data: { materialItemId: keepId } }),
    db.estimateItem.updateMany({ where: { materialItemId: dropId }, data: { materialItemId: keepId } }),
    db.bidLine.updateMany({ where: { materialItemId: dropId }, data: { materialItemId: keepId } }),
    db.jobSubstitution.deleteMany({ where: { id: { in: subs.filter((s) => keptSubs.has(s.projectId)).map((s) => s.id) } } }),
    db.jobSubstitution.updateMany({ where: { fromItemId: dropId }, data: { fromItemId: keepId } }),
    db.jobSubstitution.updateMany({ where: { toItemId: dropId }, data: { toItemId: keepId } }),
    ...(drop.inventory ? [db.inventoryItem.update({ where: { id: drop.inventory.id }, data: { materialItemId: keepId } })] : []),
    ...listed.map((p) => db.project.update({ where: { id: p.id }, data: { windowList: swap(p.windowList), doorList: swap(p.doorList) } })),
    db.materialItem.delete({ where: { id: dropId } }),
  ]);
  return { kept: keep.name, dropped: drop.name, jobs: listed.length };
}
