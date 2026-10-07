import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isLumberMetric, itemNameKey } from "./takeoff";

/** Condition settings that a template carries (everything but measurements). */
function conditionData(c: {
  name: string;
  type: string;
  metric: string;
  color: string;
  group: string;
  referenceOnly: boolean;
  costCodeId: string | null;
  unitCost: number;
  markupPct: number;
  wastePct: number;
  pitch: number;
  pitchMode: string;
  pitch2: number | null;
  height: number;
  depth: number;
  spacing: number;
  overhang: number;
  memberSize: string | null;
  memberSizeId: string | null;
  options: string | null;
  stockLengths: string | null;
  packMode: string;
  packLength: number | null;
  spanTableId?: string | null;
}) {
  return {
    name: c.name,
    type: c.type,
    metric: c.metric,
    color: c.color,
    group: c.group,
    referenceOnly: c.referenceOnly,
    costCodeId: c.costCodeId,
    unitCost: c.unitCost,
    markupPct: c.markupPct,
    wastePct: c.wastePct,
    pitch: c.pitch,
    pitchMode: c.pitchMode,
    pitch2: c.pitch2,
    height: c.height,
    depth: c.depth,
    spacing: c.spacing,
    overhang: c.overhang,
    memberSize: c.memberSize,
    memberSizeId: c.memberSizeId,
    options: c.options,
    stockLengths: c.stockLengths,
    packMode: c.packMode,
    packLength: c.packLength,
    spanTableId: c.spanTableId ?? null,
  };
}

function itemData(i: {
  description: string;
  costCodeId: string | null;
  materialItemId: string | null;
  metric: string;
  qty: number;
  per: number;
  unit: string;
  roundUp: boolean;
  wastePct: number;
  unitCost: number;
  markupPct: number;
  sortOrder: number;
}) {
  return {
    description: i.description,
    costCodeId: i.costCodeId,
    materialItemId: i.materialItemId,
    metric: i.metric,
    qty: i.qty,
    per: i.per,
    unit: i.unit,
    roundUp: i.roundUp,
    wastePct: i.wastePct,
    unitCost: i.unitCost,
    markupPct: i.markupPct,
    sortOrder: i.sortOrder,
  };
}

export function templateOptions() {
  return db.takeoffTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { conditions: true } } } });
}

/**
 * Copies a template's conditions (and their assembly items) into a job. Conditions
 * whose name the job already has are skipped, so templates can be stacked.
 * Items picked from the Item List take today's Item List price; joist / rafter
 * lumber is generated from the layout once it's measured.
 */
export async function applyTemplate(templateId: string, projectId: string) {
  const template = await db.takeoffTemplate.findUnique({
    where: { id: templateId },
    include: {
      conditions: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { materialItem: { select: { unitCost: true, markupPct: true } } } } },
      },
    },
  });
  if (!template) throw new Error("Template not found");
  const existing = await db.takeoffCondition.findMany({ where: { projectId }, select: { name: true, sortOrder: true } });
  const taken = new Set(existing.map((c) => itemNameKey(c.name)));
  let sortOrder = Math.max(-1, ...existing.map((c) => c.sortOrder)) + 1;
  const added: string[] = [];
  const skipped: string[] = [];

  // A span table deleted since the template was saved: that takeoff goes back to its fixed size.
  const tables = new Set((await db.spanTable.findMany({ select: { id: true } })).map((t) => t.id));
  await db.$transaction(async (tx) => {
    for (const c of template.conditions) {
      if (taken.has(itemNameKey(c.name))) {
        skipped.push(c.name);
        continue;
      }
      taken.add(itemNameKey(c.name));
      await tx.takeoffCondition.create({
        data: {
          ...conditionData(c),
          spanTableId: c.spanTableId && tables.has(c.spanTableId) ? c.spanTableId : null,
          projectId,
          sortOrder: sortOrder++,
          items: {
            create: c.items.map((i) => ({
              ...itemData(i),
              ...(i.materialItem ? { unitCost: i.materialItem.unitCost, markupPct: i.materialItem.markupPct } : {}),
            })),
          },
        },
      });
      added.push(c.name);
    }
  });
  return { template, added, skipped };
}

/**
 * Adds takeoffs to a template — your toolbox. Ones it doesn't have yet (by name) are
 * added at the end, items and all; ones it has are left as they are, or refreshed from
 * these when `update` is on. Lumber lines aren't saved (they come from each job's layout).
 */
export async function addConditionsToTemplate(
  tx: Prisma.TransactionClient,
  templateId: string,
  conditions: (Parameters<typeof conditionData>[0] & { items: (Parameters<typeof itemData>[0] & { metric: string })[] })[],
  update = false,
) {
  const have = await tx.takeoffTemplateCondition.findMany({ where: { templateId }, select: { id: true, name: true, sortOrder: true } });
  const byName = new Map(have.map((c) => [itemNameKey(c.name), c]));
  let sortOrder = Math.max(-1, ...have.map((c) => c.sortOrder)) + 1;
  const added: string[] = [];
  const updated: string[] = [];
  const kept: string[] = [];
  for (const c of conditions) {
    const items = c.items.filter((i) => !isLumberMetric(i.metric)).map(itemData);
    const there = byName.get(itemNameKey(c.name));
    if (there && !update) {
      kept.push(c.name);
      continue;
    }
    if (there) {
      await tx.takeoffTemplateItem.deleteMany({ where: { conditionId: there.id } });
      await tx.takeoffTemplateCondition.update({ where: { id: there.id }, data: { ...conditionData(c), items: { create: items } } });
      updated.push(c.name);
      continue;
    }
    const made = await tx.takeoffTemplateCondition.create({ data: { ...conditionData(c), templateId, sortOrder: sortOrder++, items: { create: items } } });
    byName.set(itemNameKey(c.name), { id: made.id, name: c.name, sortOrder: made.sortOrder });
    added.push(c.name);
  }
  await tx.takeoffTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  return { added, updated, kept };
}

/**
 * Saves a job's conditions and assembly items as a template — a new one, or
 * replacing the conditions of `replaceId`. Lumber lines aren't saved (they come
 * from each job's layout).
 */
export async function saveTemplateFromProject(projectId: string, opts: { name: string; replaceId?: string | null }) {
  const conditions = await db.takeoffCondition.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (conditions.length === 0) throw new Error("This job has no takeoffs to save");
  return db.$transaction(async (tx) => {
    let templateId = opts.replaceId ?? null;
    if (templateId) {
      const found = await tx.takeoffTemplate.findUnique({ where: { id: templateId }, select: { id: true } });
      if (!found) throw new Error("Template not found");
      await tx.takeoffTemplateCondition.deleteMany({ where: { templateId } });
      await tx.takeoffTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
    } else {
      templateId = (await tx.takeoffTemplate.create({ data: { name: opts.name } })).id;
    }
    for (const [index, c] of conditions.entries()) {
      await tx.takeoffTemplateCondition.create({
        data: {
          ...conditionData(c),
          templateId,
          sortOrder: index,
          items: { create: c.items.filter((i) => !isLumberMetric(i.metric)).map(itemData) },
        },
      });
    }
    return { id: templateId, count: conditions.length };
  });
}
