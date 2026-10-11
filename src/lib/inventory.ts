import "server-only";
import { db } from "./db";
import { itemNameKey } from "./takeoff";
import { averageIn, averageOut } from "./inventory-math";

/**
 * the company's inventory: stored materials, what they're worth each (average of what was paid),
 * and every move in and out. A pull to a job charges the job at that average (paid already —
 * you bought it before) and its Material list orders that much less. Leftovers returned from
 * a job credit it and go back on the shelf.
 */

export const INVENTORY_VENDOR = "Inventory";
export const MOVE_LABEL: Record<string, string> = { ADD: "Added to stock", PULL: "Pulled to a job", RETURN: "Returned from a job", COUNT: "Recount" };

const cents = (n: number) => Math.round(n * 100) / 100;

type InvItem = { materialItemId: string | null; nameKey: string; unit: string };

/** The Material list line key an inventory item fills (an Item List item, or a name and unit). */
export function lineKeyOf(i: InvItem) {
  return i.materialItemId ?? `name:${i.nameKey}|${i.unit}`;
}

/** Inventory items with what they show as (an Item List item's current name). */
export async function inventoryItems() {
  const items = await db.inventoryItem.findMany({ where: { removedAt: null }, include: { materialItem: { select: { name: true, costCodeId: true, unitCost: true } } } });
  return items.map((i) => ({ ...i, label: i.materialItem?.name ?? i.name, lineKey: lineKeyOf(i) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** Pulled to a job and not put back, by Material list line. */
export async function jobPulls(projectId: string) {
  const moves = await db.inventoryMove.findMany({ where: { projectId, type: "PULL", undone: false } });
  const byLine = new Map<string, number>();
  for (const m of moves) if (m.lineKey) byLine.set(m.lineKey, (byLine.get(m.lineKey) ?? 0) + -m.quantity);
  return byLine;
}

/**
 * Finds the inventory entry for an Item List item or a name (making it when it's new).
 * Typed names that are Item List items become that item.
 */
export async function inventoryItemFor(input: { materialItemId?: string | null; name?: string | null; unit?: string | null }) {
  let mat = input.materialItemId ? await db.materialItem.findUnique({ where: { id: input.materialItemId } }) : null;
  if (!mat && input.name) mat = await db.materialItem.findFirst({ where: { nameKey: itemNameKey(input.name) } });
  if (mat) {
    const had = await db.inventoryItem.findUnique({ where: { materialItemId: mat.id } });
    if (had?.removedAt) return db.inventoryItem.update({ where: { id: had.id }, data: { removedAt: null } });
    return had ?? (await db.inventoryItem.create({ data: { materialItemId: mat.id, name: mat.name, nameKey: `item:${mat.id}`, unit: mat.unit, avgCost: mat.unitCost } }));
  }
  const name = (input.name ?? "").trim();
  if (!name) throw new Error("Which item?");
  const nameKey = itemNameKey(name);
  const had = await db.inventoryItem.findFirst({ where: { nameKey } });
  if (had?.removedAt) return db.inventoryItem.update({ where: { id: had.id }, data: { removedAt: null } });
  return had ?? (await db.inventoryItem.create({ data: { name, nameKey, unit: input.unit?.trim() || "ea" } }));
}

/** Stock bought for the shelf (or found on it): on hand goes up, the average takes in its cost. */
export async function addStock(itemId: string, qty: number, unitCost: number, userId: string | null, note: string | null) {
  if (!(qty > 0)) throw new Error("How many?");
  const item = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  await db.$transaction([
    db.inventoryItem.update({ where: { id: item.id }, data: { onHand: item.onHand + qty, avgCost: averageIn(item.onHand, item.avgCost, qty, unitCost) } }),
    db.inventoryMove.create({ data: { itemId: item.id, type: "ADD", quantity: qty, unitCost, userId, note } }),
  ]);
}

/** A physical count: on hand becomes what's there (the average stays). */
export async function recount(itemId: string, count: number, userId: string | null, note: string | null) {
  if (!(count >= 0)) throw new Error("Count can't be below zero");
  const item = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  if (Math.abs(count - item.onHand) < 1e-9) return;
  await db.$transaction([
    db.inventoryItem.update({ where: { id: item.id }, data: { onHand: count } }),
    db.inventoryMove.create({ data: { itemId: item.id, type: "COUNT", quantity: count - item.onHand, unitCost: item.avgCost, userId, note } }),
  ]);
}

/** Pulls stock to a job: on hand goes down, the job is charged at the average (already paid). */
export async function pullToJob(projectId: string, itemId: string, qty: number, lineKey: string | null, userId: string | null) {
  if (!(qty > 0)) return;
  const item = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, include: { materialItem: { select: { name: true, costCodeId: true } } } });
  if (qty > item.onHand + 1e-9) throw new Error(`Only ${item.onHand} ${item.unit} of ${item.materialItem?.name ?? item.name} on hand`);
  const name = item.materialItem?.name ?? item.name;
  await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        projectId,
        costCodeId: item.materialItem?.costCodeId ?? null,
        vendor: INVENTORY_VENDOR,
        description: `From inventory: ${qty} ${item.unit} ${name}`,
        category: "MATERIAL",
        amount: cents(qty * item.avgCost),
        status: "PAID",
        fromInventory: true,
        enteredById: userId,
      },
    });
    await tx.inventoryItem.update({ where: { id: item.id }, data: { onHand: item.onHand - qty } });
    await tx.inventoryMove.create({ data: { itemId: item.id, type: "PULL", quantity: -qty, unitCost: item.avgCost, projectId, lineKey, expenseId: expense.id, userId } });
  });
}

/**
 * Leftovers from a job back on the shelf: on hand goes up (at what they cost the job),
 * and the job is credited that much.
 */
export async function returnFromJob(projectId: string, itemId: string, qty: number, unitCost: number, userId: string | null) {
  if (!(qty > 0)) throw new Error("How many?");
  const item = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, include: { materialItem: { select: { name: true, costCodeId: true } } } });
  const name = item.materialItem?.name ?? item.name;
  await db.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        projectId,
        costCodeId: item.materialItem?.costCodeId ?? null,
        vendor: INVENTORY_VENDOR,
        description: `Returned to inventory: ${qty} ${item.unit} ${name}`,
        category: "MATERIAL",
        amount: -cents(qty * unitCost),
        status: "PAID",
        fromInventory: true,
        enteredById: userId,
      },
    });
    await tx.inventoryItem.update({ where: { id: item.id }, data: { onHand: item.onHand + qty, avgCost: averageIn(item.onHand, item.avgCost, qty, unitCost) } });
    await tx.inventoryMove.create({ data: { itemId: item.id, type: "RETURN", quantity: qty, unitCost, projectId, expenseId: expense.id, userId } });
  });
}

/** Undoes a pull (put it back) or a return (take it back off the shelf), with its charge or credit. */
export async function undoMove(moveId: string, projectId: string) {
  const move = await db.inventoryMove.findFirst({ where: { id: moveId, projectId, undone: false, type: { in: ["PULL", "RETURN"] } }, include: { item: true } });
  if (!move) throw new Error("Already undone");
  const item = move.item;
  const qty = Math.abs(move.quantity);
  if (move.type === "RETURN" && qty > item.onHand + 1e-9) throw new Error(`Only ${item.onHand} ${item.unit} on hand now — some of it was used since`);
  const data =
    move.type === "PULL"
      ? { onHand: item.onHand + qty, avgCost: averageIn(item.onHand, item.avgCost, qty, move.unitCost), removedAt: null }
      : { onHand: item.onHand - qty, avgCost: averageOut(item.onHand, item.avgCost, qty, move.unitCost) };
  await db.$transaction([
    db.inventoryItem.update({ where: { id: item.id }, data }),
    db.inventoryMove.update({ where: { id: move.id }, data: { undone: true } }),
    ...(move.expenseId ? [db.expense.deleteMany({ where: { id: move.expenseId } })] : []),
  ]);
}
