import "server-only";
import { db } from "./db";
import { syncAutoItems } from "./walls";
import { CONDITION_COLORS, arcPath, framingMembers, isLumberMetric, itemNameKey, memberThickness, parseArcs, parsePoints, parseMemberSize, shapePath, type Pt } from "./takeoff";
import { longestUnsupported, pickSize, spanSpec, type SizePick } from "./span-tables";
import { joistPieces, sizePieces } from "./joist-pieces";

function without<T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> {
  const out = { ...row };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * A copy of a takeoff and its items (lumber lines are remade for it), right below the
 * original. `changes` overrides its name, member size and the like.
 */
export async function copyTakeoff(
  projectId: string,
  id: string,
  changes: { name?: string; memberSize?: string | null; memberSizeId?: string | null; sizeGroup?: string | null; color?: string } = {},
) {
  const c = await db.takeoffCondition.findFirst({ where: { id, projectId }, include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
  if (!c) throw new Error("Takeoff not found");
  const settings = without(c, "id", "createdAt", "updatedAt", "items", "name", "sortOrder");
  // Make room right below the original.
  await db.takeoffCondition.updateMany({ where: { projectId, sortOrder: { gt: c.sortOrder } }, data: { sortOrder: { increment: 1 } } });
  const copy = await db.takeoffCondition.create({
    data: {
      ...settings,
      ...changes,
      name: (changes.name?.trim() || `${c.name} (copy)`).slice(0, 200),
      sortOrder: c.sortOrder + 1,
      items: { create: c.items.filter((i) => !isLumberMetric(i.metric)).map((i) => without(i, "id", "conditionId")) },
    },
  });
  await syncAutoItems(projectId, copy.id);
  return copy;
}

/**
 * A color for a new size in a family: one no other size of the family has (`avoid`), the one the
 * job uses least — so with every color already in use, sizes still come out different.
 */
async function freshColor(projectId: string, avoid: Iterable<string> = []) {
  const uses = new Map<string, number>();
  for (const c of await db.takeoffCondition.findMany({ where: { projectId }, select: { color: true } })) uses.set(c.color.toLowerCase(), (uses.get(c.color.toLowerCase()) ?? 0) + 1);
  const taken = new Set([...avoid].map((c) => c.toLowerCase()));
  const leastUsed = (list: readonly string[]) => [...list].sort((a, b) => (uses.get(a.toLowerCase()) ?? 0) - (uses.get(b.toLowerCase()) ?? 0))[0];
  return leastUsed(CONDITION_COLORS.filter((c) => !taken.has(c.toLowerCase()))) ?? leastUsed(CONDITION_COLORS);
}

/**
 * Sizes of one family are told apart on the plan by color: a size's own color (Settings → Member
 * sizes) when it has one; any others sharing a color get one of their own.
 */
async function distinctFamilyColors(projectId: string, group: string) {
  const family = await db.takeoffCondition.findMany({
    where: { projectId, OR: [{ sizeGroup: group }, { id: group }] },
    orderBy: { sortOrder: "asc" },
    select: { id: true, color: true, memberSizeRef: { select: { color: true } } },
  });
  for (const f of family) {
    const own = f.memberSizeRef?.color;
    if (own && own.toLowerCase() !== f.color.toLowerCase()) {
      await db.takeoffCondition.update({ where: { id: f.id }, data: { color: own } });
      f.color = own;
    }
  }
  const seen = new Set(family.filter((f) => f.memberSizeRef?.color).map((f) => f.color.toLowerCase()));
  for (const f of family) {
    if (f.memberSizeRef?.color) continue;
    if (seen.has(f.color.toLowerCase())) {
      const color = await freshColor(projectId, seen);
      await db.takeoffCondition.update({ where: { id: f.id }, data: { color } });
      seen.add(color.toLowerCase());
    } else seen.add(f.color.toLowerCase());
  }
}

/** Plain lumber (2x6 … 2x12) is 1-1/2" thick; its actual depth from the nominal. */
const ACTUAL_DEPTH: Record<number, number> = { 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };

/** The Member sizes entry for a name — made when a code table picks a size you haven't set up (2x10 …). */
export async function memberSizeFor(name: string) {
  const nameKey = itemNameKey(name);
  const found = await db.memberSize.findFirst({ where: { nameKey } });
  if (found) return found;
  const nominal = parseMemberSize(name);
  const last = await db.memberSize.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return db.memberSize.create({
    data: {
      name,
      nameKey,
      kind: "DIMENSIONAL",
      widthIn: nominal && Number.isInteger(nominal.t) ? nominal.t - 0.5 : (nominal?.t ?? 1.5),
      depthIn: nominal ? (ACTUAL_DEPTH[nominal.w] ?? nominal.w) : 5.5,
      soldAs: "STOCK",
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
}

/** "Floor Joists 2x8" → "Floor Joists 2x10": the family name with the size swapped (or added). */
export function familyName(name: string, from: string | null, to: string) {
  if (name.toLowerCase().includes(to.toLowerCase())) return name;
  const base = from && name.toLowerCase().includes(from.toLowerCase()) ? name.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), to) : `${name} ${to}`;
  return base.replace(/\s+/g, " ").trim();
}

/**
 * A joist/rafter shape's span (feet): the longest stretch any of its members runs without
 * support. Members are held up at the area's edges and by the walls and beams traced on the
 * sheet that cross them (`supports`, page units). Each member is still ordered full length.
 */
export function shapeSpanFt(
  c: { type: string; spacing: number; memberSize: string | null; memberSizeRef?: { widthIn: number } | null },
  m: { points: string; angle: number },
  unitsPerFoot: number,
  supports: [Pt, Pt][] = [],
) {
  const shape = { points: parsePoints(m.points), arcs: parseArcs(m.points) };
  const members = framingMembers(shapePath(c.type, shape), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberSizeRef?.widthIn));
  // A joist within 4" of a wall running alongside it sits on that wall (no span of its own).
  return longestUnsupported(members, supports, (4 / 12) * unitsPerFoot) / unitsPerFoot;
}

/** The walls and beams traced on a sheet, as line pieces (page units): what holds joists up. */
async function supportsOn(sheetId: string) {
  const rows = await db.takeoffMeasurement.findMany({ where: { sheetId, isDeduction: false, condition: { type: { in: ["WALL", "BEAM"] } } }, select: { points: true } });
  const out: [Pt, Pt][] = [];
  for (const r of rows) {
    const path = arcPath(parsePoints(r.points), parseArcs(r.points), false);
    for (let i = 1; i < path.length; i++) out.push([path[i - 1], path[i]]);
  }
  return out;
}

export type SpanPlacement = { conditionId: string; size: string | null; pick: SizePick | null; spanFt: number };

/**
 * Joists/rafters on a span table: the size this shape's span calls for, and the shape filed
 * under the takeoff of that size — one takeoff per size in the family ("Floor Joists 2x8",
 * "Floor Joists 2x10"), each made (a copy, items and all) the first time it's needed. A shape
 * you sized yourself (sizeLocked) stays where it is. Returns where it went.
 */
export async function placeBySpan(projectId: string, measurementId: string, opts: { sync?: boolean } = {}): Promise<SpanPlacement | null> {
  const m = await db.takeoffMeasurement.findFirst({
    where: { id: measurementId, sheet: { plan: { projectId } } },
    include: { sheet: { select: { unitsPerFoot: true } }, condition: { include: { spanTable: true, memberSizeRef: { select: { widthIn: true } } } } },
  });
  if (!m || m.sizeLocked || m.isDeduction) return null;
  const c = m.condition;
  if (c.type !== "FRAMING" || !c.spanTable || !m.sheet.unitsPerFoot) return null;
  const upf = m.sheet.unitsPerFoot;
  const supports = await supportsOn(m.sheetId);
  const spanFt = shapeSpanFt(c, m, upf, supports);
  if (!(spanFt > 0)) return null;
  const table = spanSpec(c.spanTable);
  const pick = pickSize(table, spanFt, c.spacing);
  if (!pick.size) return { conditionId: c.id, size: null, pick, spanFt };

  const group = c.sizeGroup ?? c.id;
  if (!c.sizeGroup) await db.takeoffCondition.update({ where: { id: c.id }, data: { sizeGroup: group } });
  const family = await db.takeoffCondition.findMany({ where: { projectId, OR: [{ sizeGroup: group }, { id: group }] }, orderBy: { sortOrder: "asc" } });
  const key = itemNameKey(pick.size);
  let target = family.find((f) => f.memberSize && itemNameKey(f.memberSize) === key);
  if (!target) {
    // A takeoff for that size, made the first time it's needed. The one you made and draw with
    // ("Floor Joists") stays as it is: its areas go to "Floor Joists 2x8", "Floor Joists 2x10"…
    const size = await memberSizeFor(pick.size);
    target = await copyTakeoff(projectId, c.id, {
      name: familyName(c.name, c.memberSize, size.name),
      memberSize: size.name,
      memberSizeId: size.id,
      sizeGroup: group,
      color: size.color ?? (await freshColor(projectId, family.map((f) => f.color))),
    });
    family.push(target);
  }
  if (target.id !== m.conditionId) await db.takeoffMeasurement.update({ where: { id: m.id }, data: { conditionId: target.id } });
  // Joist pieces in this area that need another size (a wall breaks them, joist-pieces.ts) are
  // ordered under that size's takeoff: make sure the family has one for each (takeoff-data hands them over).
  const shape = { points: parsePoints(m.points), arcs: parseArcs(m.points), angle: m.angle, pitch: m.pitch };
  const { pieces } = joistPieces({ ...c, memberWidthIn: c.memberSizeRef?.widthIn }, shape, upf, supports);
  const sizes = sizePieces(pieces, (span) => pickSize(table, span, c.spacing).size).flat();
  const have = new Set([...family.map((f) => f.memberSize), target.memberSize].filter((x): x is string => !!x).map(itemNameKey));
  for (const name of new Set(sizes.filter((x): x is string => !!x))) {
    if (have.has(itemNameKey(name))) continue;
    const size = await memberSizeFor(name);
    family.push(
      await copyTakeoff(projectId, target.id, {
        name: familyName(target.name, target.memberSize, size.name),
        memberSize: size.name,
        memberSizeId: size.id,
        sizeGroup: group,
        color: size.color ?? (await freshColor(projectId, family.map((f) => f.color))),
      }),
    );
    have.add(itemNameKey(name));
  }
  // …and each size its own color (a family made before this could have several alike).
  await distinctFamilyColors(projectId, group);
  // The job's lumber lines follow — unless the caller does that once for many shapes.
  if (opts.sync !== false) await syncAutoItems(projectId);
  return { conditionId: target.id, size: pick.size, pick, spanFt };
}

/** Walls or beams on a sheet changed: the span-table joists/rafters on it are sized again. */
export async function resizeSheet(projectId: string, sheetId: string, opts: { sync?: boolean } = {}) {
  const shapes = await db.takeoffMeasurement.findMany({
    where: { sheetId, sizeLocked: false, isDeduction: false, condition: { projectId, type: "FRAMING", spanTableId: { not: null } } },
    select: { id: true },
  });
  // Each sized without redoing the job's lumber lines; that's done once at the end.
  for (const s of shapes) await placeBySpan(projectId, s.id, { sync: false });
  if (shapes.length && opts.sync !== false) await syncAutoItems(projectId);
  return shapes.length;
}

/** Every unlocked shape of a span-table family sized again (the table, spacing or a shape changed). */
export async function resizeFamily(projectId: string, conditionId: string) {
  const c = await db.takeoffCondition.findFirst({ where: { id: conditionId, projectId }, select: { id: true, sizeGroup: true, spanTableId: true } });
  if (!c?.spanTableId) return 0;
  const group = c.sizeGroup ?? c.id;
  await distinctFamilyColors(projectId, group);
  const shapes = await db.takeoffMeasurement.findMany({
    where: { sizeLocked: false, condition: { projectId, OR: [{ sizeGroup: group }, { id: group }] } },
    select: { id: true, conditionId: true },
  });
  let moved = 0;
  for (const s of shapes) {
    const p = await placeBySpan(projectId, s.id, { sync: false });
    if (p && p.conditionId !== s.conditionId) moved++;
  }
  if (shapes.length) await syncAutoItems(projectId);
  return moved;
}
