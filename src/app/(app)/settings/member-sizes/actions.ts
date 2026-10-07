"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEMBER_KINDS, SOLD_AS, itemNameKey, parseStockLengths } from "@/lib/takeoff";
import { boolField, numField, str, strOrNull } from "@/lib/utils";

const PATH = "/settings/member-sizes";

async function sizeFields(fd: FormData, id?: string) {
  const name = str(fd, "name").replace(/\s+/g, " ");
  if (!name) throw new Error("Name is required");
  const nameKey = itemNameKey(name);
  const clash = await db.memberSize.findUnique({ where: { nameKey }, select: { id: true } });
  if (clash && clash.id !== id) throw new Error(`"${name}" is already a member size`);
  const kind = str(fd, "kind");
  const soldAs = str(fd, "soldAs");
  const stockLengths = strOrNull(fd, "stockLengths");
  if (stockLengths && !parseStockLengths(stockLengths)) throw new Error("Stock lengths should be feet, e.g. 8, 10, 12 or 8-24");
  return {
    name,
    nameKey,
    kind: (MEMBER_KINDS as readonly string[]).includes(kind) ? kind : "OTHER",
    widthIn: Math.max(0.25, numField(fd, "widthIn", 1.5)),
    depthIn: Math.max(0.25, numField(fd, "depthIn", 5.5)),
    soldAs: (SOLD_AS as readonly string[]).includes(soldAs) ? soldAs : "STOCK",
    stockLengths,
    boardFeet: boolField(fd, "boardFeet"),
    color: /^#[0-9a-f]{6}$/i.test(str(fd, "color")) && boolField(fd, "useColor") ? str(fd, "color").toLowerCase() : null,
  };
}

export async function createMemberSize(fd: FormData) {
  await requireAdmin();
  const data = await sizeFields(fd);
  const last = await db.memberSize.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const size = await db.memberSize.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidatePath(PATH);
  redirect(`${PATH}#size-${size.id}`);
}

/** Conditions using the size keep using it; their lumber lines update the next time the takeoff is opened. */
export async function updateMemberSize(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  if (!(await db.memberSize.findUnique({ where: { id }, select: { id: true } }))) throw new Error("Member size not found");
  const data = await sizeFields(fd, id);
  await db.$transaction([
    db.memberSize.update({ where: { id }, data }),
    // Conditions show the size by name.
    db.takeoffCondition.updateMany({ where: { memberSizeId: id }, data: { memberSize: data.name } }),
    db.takeoffTemplateCondition.updateMany({ where: { memberSizeId: id }, data: { memberSize: data.name } }),
    // Its color: every joist / rafter takeoff of this size, on every job (walls keep their own).
    ...(data.color ? [db.takeoffCondition.updateMany({ where: { memberSizeId: id, type: "FRAMING" }, data: { color: data.color } })] : []),
  ]);
  revalidatePath(PATH);
  redirect(`${PATH}#size-${id}`);
}

/** Conditions that used it keep the size name but lose the link. */
export async function deleteMemberSize(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  await db.memberSize.delete({ where: { id } });
  revalidatePath(PATH);
  redirect(PATH);
}
