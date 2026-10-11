"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addStock, inventoryItemFor, recount } from "@/lib/inventory";
import { str, strOrNull } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

function done(anchor?: string) {
  revalidatePath("/inventory");
  revalidatePath("/projects", "layout");
  redirect(`/inventory${anchor ? `#${anchor}` : ""}`);
}

/** Stock bought for the shelf (or already there): an Item List item or a name of its own. */
export const addInventory = friendly(async function addInventory(fd: FormData) {
  const user = await requireStaff();
  const qty = Number(str(fd, "quantity"));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("How many?");
  const item = await inventoryItemFor({ name: str(fd, "item"), unit: str(fd, "unit") });
  const typed = str(fd, "unitCost");
  const mat = item.materialItemId ? await db.materialItem.findUnique({ where: { id: item.materialItemId }, select: { unitCost: true } }) : null;
  // Cost each: what you typed, else the Item List price, else what stock is worth now.
  const unitCost = typed !== "" && Number.isFinite(Number(typed)) ? Number(typed) : (mat?.unitCost ?? item.avgCost);
  await addStock(item.id, qty, unitCost, user.id, strOrNull(fd, "note"));
  done(`inv-${item.id}`);
});

/** A physical count. */
export const recountInventory = friendly(async function recountInventory(fd: FormData) {
  const user = await requireStaff();
  const count = Number(str(fd, "count"));
  if (!Number.isFinite(count)) throw new Error("Type the count");
  await recount(str(fd, "id"), count, user.id, strOrNull(fd, "note"));
  done(`inv-${str(fd, "id")}`);
});

/**
 * Removes an item from inventory, whatever's on hand. One no job ever used is deleted; one
 * pulled to (or returned from) a job just leaves the list — the job keeps its pull, and
 * putting it back brings the item back.
 */
export const removeInventoryItem = friendly(async function removeInventoryItem(fd: FormData) {
  const user = await requireStaff();
  const item = await db.inventoryItem.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { moves: { where: { projectId: { not: null } } } } } } });
  if (!item) return done();
  if (item._count.moves === 0) await db.inventoryItem.delete({ where: { id: item.id } });
  else
    await db.$transaction([
      ...(Math.abs(item.onHand) > 1e-9
        ? [db.inventoryMove.create({ data: { itemId: item.id, type: "COUNT", quantity: -item.onHand, unitCost: item.avgCost, userId: user.id, note: "Removed from inventory" } })]
        : []),
      db.inventoryItem.update({ where: { id: item.id }, data: { onHand: 0, removedAt: new Date() } }),
    ]);
  await logActivity({ userId: user.id, type: "inventory.removed", description: `Removed ${item.name} from inventory (${item.onHand} ${item.unit} on hand)` });
  done();
});
