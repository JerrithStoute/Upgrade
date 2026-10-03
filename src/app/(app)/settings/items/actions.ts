"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { UNITS } from "@/lib/constants";
import { itemNameKey } from "@/lib/takeoff";
import { CODE_GROUP_KEYS, type CodeGroup } from "@/lib/code-groups";
import { kindForCategory, newItemPlacement, renameCategory, saveCategoryRule, saveCodeRule } from "@/lib/item-codes";
import { boolField, numField, str, strOrNull } from "@/lib/utils";

const PATH = "/settings/items";

function back(fd: FormData, hash = "") {
  const r = str(fd, "returnTo");
  return (r.startsWith(PATH) ? r : PATH) + hash;
}

/** A size field: blank or 0 = not set. */
function optionalSize(fd: FormData, key: string) {
  const n = numField(fd, key, 0);
  return n > 0 ? n : null;
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
    widthIn: optionalSize(fd, "widthIn"),
    heightIn: optionalSize(fd, "heightIn"),
    exterior: str(fd, "exterior") === "1" ? true : str(fd, "exterior") === "0" ? false : null,
    lengthFt: optionalSize(fd, "lengthFt"),
    style: strOrNull(fd, "style"),
  };
}

export async function createMaterialItem(fd: FormData) {
  const admin = await requireAdmin();
  const data = await itemFields(fd);
  // Filed under a kind's category (your windows category, "Trim"…): it's that kind, so pickers find it,
  // and with no code picked it takes that kind's "all of them use …" code.
  const kind = await kindForCategory(data.category);
  if (kind && !data.costCodeId) data.costCodeId = (await newItemPlacement(kind, data.exterior)).costCodeId;
  const item = await db.materialItem.create({ data: { ...data, kind } });
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

/** Fields that can be changed right in the Item List table. */
export type ItemCell = "category" | "costCodeId" | "unit" | "unitCost" | "markupPct" | "wastePct" | "roundUp" | "sku" | "vendor";

async function costCodeOrNull(id: string) {
  if (!id) return null;
  if (!(await db.costCode.findUnique({ where: { id }, select: { id: true } }))) throw new Error("Cost code not found");
  return id;
}

function cellData(field: ItemCell, value: string) {
  const n = Number(value);
  switch (field) {
    case "category":
      return { category: value.trim().replace(/\s+/g, " ") || "General" };
    case "unit":
      return { unit: (UNITS as readonly string[]).includes(value) ? value : "ea" };
    case "unitCost":
      return { unitCost: Number.isFinite(n) ? Math.max(0, n) : 0 };
    case "markupPct":
      return { markupPct: Number.isFinite(n) ? n : 0 };
    case "wastePct":
      return { wastePct: Number.isFinite(n) ? Math.max(0, n) : 0 };
    case "roundUp":
      return { roundUp: value === "1" };
    case "sku":
    case "vendor":
      return { [field]: value.trim() || null };
    default:
      return {};
  }
}

type CellValue = string | number | boolean | null;

/** The value a cell shows (for Undo): what saveItemCells takes back. */
function cellValue(item: Record<string, unknown>, field: ItemCell): string {
  const v = item[field] as CellValue;
  if (field === "roundUp") return v ? "1" : "0";
  return v == null ? "" : String(v);
}

/**
 * Saves a cell edited in the Item List table — on one item, or on every ticked row
 * (spreadsheet-style fill). Returns what each item had before, for Undo. A cost
 * code also goes onto the takeoff lines using the item that have none yet.
 */
export async function saveItemCells(ids: string[], field: ItemCell, value: string): Promise<{ error?: string; prev?: { id: string; value: string }[] }> {
  const admin = await requireAdmin();
  try {
    const items = await db.materialItem.findMany({ where: { id: { in: ids.slice(0, 2000) } } });
    if (!items.length) return { error: "Item not found" };
    const code = field === "costCodeId" ? await costCodeOrNull(value) : null;
    const data = field === "costCodeId" ? { costCodeId: code } : cellData(field, value);
    await db.materialItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data });
    if (code) await db.takeoffAssemblyItem.updateMany({ where: { materialItemId: { in: items.map((i) => i.id) }, costCodeId: null }, data: { costCodeId: code } });
    if (items.length > 1) await logActivity({ userId: admin.id, type: "item_list.bulk_edited", description: `Changed ${items.length} items on the Item List` });
    revalidatePath(PATH);
    return { prev: items.map((i) => ({ id: i.id, value: cellValue(i, field) })) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save" };
  }
}

/** Undo for a fill: puts each item's old value back. */
export async function restoreItemCells(field: ItemCell, prev: { id: string; value: string }[]): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    for (const p of prev.slice(0, 2000)) {
      const data = field === "costCodeId" ? { costCodeId: await costCodeOrNull(p.value) } : cellData(field, p.value);
      await db.materialItem.updateMany({ where: { id: p.id }, data });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't undo" };
  }
  revalidatePath(PATH);
  return {};
}

/**
 * A category's "all windows use …" answer, set from the Item List (the same one the
 * takeoff form asks). value: a cost code id, "ask", or "" (not answered).
 * Returns how many items with no code were filled in.
 */
export async function saveCategoryCode(group: string, value: string): Promise<{ error?: string; filled?: number }> {
  await requireAdmin();
  if (!(CODE_GROUP_KEYS as string[]).includes(group)) return { error: "Unknown group" };
  try {
    const g = group as CodeGroup;
    if (!value) {
      await db.itemCodeRule.deleteMany({ where: { group: g } });
      revalidatePath(PATH);
      return { filled: 0 };
    }
    const filled = await saveCodeRule(g, value !== "ask", value === "ask" ? null : value);
    revalidatePath(PATH);
    return { filled };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save" };
  }
}

/**
 * Which category a kind's new items go in (Items the program adds). With `move`,
 * its items still in the old place move there too. Returns how many moved.
 */
export async function saveKindCategory(group: string, category: string, move: boolean): Promise<{ error?: string; moved?: number }> {
  await requireAdmin();
  if (!(CODE_GROUP_KEYS as string[]).includes(group)) return { error: "Unknown kind" };
  try {
    const moved = await saveCategoryRule(group as CodeGroup, category, move);
    revalidatePath(PATH);
    return { moved };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save" };
  }
}

/** Renames a category, or merges it into another (every item in it, and any kind filed there). */
export async function renameItemCategory(fd: FormData) {
  await requireAdmin();
  const from = str(fd, "from");
  const to = str(fd, "to");
  if (!from || !(await db.materialItem.findFirst({ where: { category: from }, select: { id: true } }))) throw new Error("Category not found");
  await renameCategory(from, to);
  revalidatePath(PATH);
  const name = to.trim().replace(/\s+/g, " ");
  redirect(`${PATH}?category=${encodeURIComponent(name)}`);
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
