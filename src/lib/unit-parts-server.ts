import "server-only";
import { db } from "./db";
import { itemValues, readParts, withUsedChoices, writeParts, type UnitKind, type UnitParts } from "./unit-parts";

/** The Item List kind a door / window is filed as. */
export const itemKindOf = (kind: UnitKind) => (kind === "door" ? "doors" : "windows");

/**
 * This company's door or window parts (Catalog → Doors / Windows). The first time they're read the new way,
 * the choices already used on the Item List are added (a type typed in with Other… before is a choice now)
 * and they're saved that way — once.
 */
export async function loadUnitParts(kind: UnitKind): Promise<UnitParts> {
  const company = await db.company.findFirst({ select: { id: true, doorDetails: true, windowDetails: true } });
  const raw = kind === "door" ? company?.doorDetails : company?.windowDetails;
  const read = readParts(kind, raw);
  const isNew = !!raw && !read.migrated;
  if (isNew || !company) return { parts: read.parts, notSame: read.notSame, aliases: read.aliases };
  const items = await db.materialItem.findMany({ where: { kind: itemKindOf(kind) }, select: { exterior: true, style: true, color: true, details: true } });
  const parts = withUsedChoices(read.parts, items.map(itemValues));
  await saveUnitParts(kind, { parts, notSame: [], aliases: {} }, company.id);
  return { parts, notSame: [], aliases: {} };
}

/** Saves a company's door or window parts. */
export async function saveUnitParts(kind: UnitKind, p: UnitParts, companyId?: string) {
  const id = companyId ?? (await db.company.findFirst({ select: { id: true } }))?.id;
  if (!id) throw new Error("Set up your company first (Settings)");
  await db.company.update({ where: { id }, data: kind === "door" ? { doorDetails: writeParts(p) } : { windowDetails: writeParts(p) } });
}
