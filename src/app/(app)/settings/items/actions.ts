"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { UNITS } from "@/lib/constants";
import { itemNameKey } from "@/lib/takeoff";
import { boolField, numField, str, strOrNull } from "@/lib/utils";

const PATH = "/settings/items";

function back(fd: FormData, hash = "") {
  const r = str(fd, "returnTo");
  return (r.startsWith(PATH) ? r : PATH) + hash;
}

async function itemFields(fd: FormData, id?: string) {
  const name = str(fd, "name").replace(/\s+/g, " ");
  if (!name) throw new Error("Item name is required");
  const nameKey = itemNameKey(name);
  const clash = await db.materialItem.findUnique({ where: { nameKey }, select: { id: true } });
  if (clash && clash.id !== id) throw new Error(`"${name}" is already on the Item List`);
  const unit = str(fd, "unit");
  const costCodeId = strOrNull(fd, "costCodeId");
  if (costCodeId && !(await db.costCode.findUnique({ where: { id: costCodeId }, select: { id: true } }))) throw new Error("Cost code not found");
  return {
    name,
    nameKey,
    category: str(fd, "category") || "General",
    unit: (UNITS as readonly string[]).includes(unit) ? unit : "ea",
    unitCost: Math.max(0, numField(fd, "unitCost", 0)),
    markupPct: numField(fd, "markupPct", 20),
    wastePct: Math.max(0, numField(fd, "wastePct", 0)),
    roundUp: boolField(fd, "roundUp"),
    costCodeId,
    vendor: strOrNull(fd, "vendor"),
    sku: strOrNull(fd, "sku"),
    notes: strOrNull(fd, "notes"),
  };
}

export async function createMaterialItem(fd: FormData) {
  const admin = await requireAdmin();
  const data = await itemFields(fd);
  const item = await db.materialItem.create({ data });
  await logActivity({ userId: admin.id, type: "item_list.added", description: `Added "${item.name}" to the Item List` });
  revalidatePath(PATH);
  redirect(back(fd, `#item-${item.id}`));
}

/** Changes the master entry only — jobs already using it keep their own prices until a rebid. */
export async function updateMaterialItem(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  if (!(await db.materialItem.findUnique({ where: { id }, select: { id: true } }))) throw new Error("Item not found");
  await db.materialItem.update({ where: { id }, data: await itemFields(fd, id) });
  revalidatePath(PATH);
  redirect(back(fd, `#item-${id}`));
}

/** Removes the entry from the list. Assemblies that used it keep their lines (just unlinked). */
export async function deleteMaterialItem(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const item = await db.materialItem.findUnique({ where: { id } });
  if (!item) throw new Error("Item not found");
  await db.materialItem.delete({ where: { id } });
  await logActivity({ userId: admin.id, type: "item_list.deleted", description: `Removed "${item.name}" from the Item List` });
  revalidatePath(PATH);
  redirect(back(fd));
}
