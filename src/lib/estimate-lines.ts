import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { resolveMaterialItem } from "./material-items";
import { groupLooseLines, type SaveSheetInput, type SheetSpec } from "./estimate-sheet";
import { NO_VIEW, parseSpecView, specViewJson } from "./proposal-options";
import { evaluateFormula } from "./formula";
import { formulaQty } from "./estimate-sheet-state";
import { projectValues } from "./estimate-parameters";

/**
 * Shared plumbing for estimate-shaped line sets (job estimates and estimate
 * templates): categories → spec items → cost lines. Loading them for the sheet,
 * saving the sheet, and copying one set into another.
 */

type Tx = Prisma.TransactionClient;

export type SourceSpec = {
  id: string;
  name: string;
  category: string;
  specText: string | null;
  kind: string;
  isAllowance: boolean;
  clientNotes: string | null;
  tradeNotes: string | null;
  sortOrder: number;
  // Only on job estimates.
  urgent?: boolean;
  requestedBy?: Date | null;
  proposalView?: string | null;
  allowanceProfit?: boolean | null;
  selectionId?: string | null;
};

export type SourceItem = {
  costCodeId: string | null;
  group: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  markupPct: number;
  costType: string;
  notes: string | null;
  isAllowance: boolean;
  isOptional: boolean;
  sortOrder: number;
  specId: string | null;
  // Only on job estimates: lines sent from a takeoff, or tied to the Item List.
  takeoffConditionId?: string | null;
  takeoffItemId?: string | null;
  takeoffRollup?: string | null;
  materialItemId?: string | null;
  qtyFormula?: string | null;
  costFormula?: string | null;
};

export type LineSet = { items: SourceItem[]; specs: SourceSpec[] };

/** Spec items and lines share one ordering. */
export function nextSortOrder(set: { items: { sortOrder: number }[]; specs: { sortOrder: number }[] }) {
  return Math.max(-1, ...set.items.map((i) => i.sortOrder), ...set.specs.map((a) => a.sortOrder)) + 1;
}

function specCopy(s: SourceSpec, sortOffset: number) {
  return {
    name: s.name,
    category: s.category,
    specText: s.specText,
    kind: s.kind,
    isAllowance: s.isAllowance,
    clientNotes: s.clientNotes,
    tradeNotes: s.tradeNotes,
    sortOrder: s.sortOrder + sortOffset,
  };
}

function itemCopy(i: SourceItem, sortOffset: number, specMap: Map<string, string>) {
  return {
    costCodeId: i.costCodeId,
    group: i.group,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unitCost: i.unitCost,
    markupPct: i.markupPct,
    costType: i.costType,
    notes: i.notes,
    qtyFormula: i.qtyFormula ?? null,
    costFormula: i.costFormula ?? null,
    isAllowance: i.isAllowance,
    isOptional: i.isOptional,
    sortOrder: i.sortOrder + sortOffset,
    specId: i.specId ? (specMap.get(i.specId) ?? null) : null,
  };
}

/**
 * Copies spec items + lines into a job estimate. `sortOffset` places them after any
 * existing ones (used when appending a template to a draft).
 */
export async function copyIntoEstimate(
  tx: Tx,
  estimateId: string,
  source: LineSet,
  opts: { sortOffset?: number; keepSelectionLinks?: boolean; values?: Record<string, number> } = {},
) {
  const sortOffset = opts.sortOffset ?? 0;
  const specMap = new Map<string, string>();
  for (const s of source.specs) {
    const copy = await tx.estimateSpec.create({
      data: {
        estimateId,
        ...specCopy(s, sortOffset),
        urgent: s.urgent ?? false,
        requestedBy: s.requestedBy ?? null,
        proposalView: s.proposalView ?? null,
        allowanceProfit: s.allowanceProfit ?? null,
        selectionId: opts.keepSelectionLinks ? (s.selectionId ?? null) : null,
      },
    });
    specMap.set(s.id, copy.id);
  }
  if (source.items.length) {
    await tx.estimateItem.createMany({
      data: source.items.map((i) => ({
        estimateId,
        ...itemCopy(i, sortOffset, specMap),
        ...(i.qtyFormula && opts.values ? { quantity: formulaQty(i.qtyFormula, opts.values) } : {}),
        ...(i.costFormula && opts.values ? { unitCost: formulaQty(i.costFormula, opts.values) } : {}),
        // A new version keeps its takeoff links so re-sending the takeoff updates these lines.
        takeoffConditionId: i.takeoffConditionId ?? null,
        takeoffItemId: i.takeoffItemId ?? null,
        takeoffRollup: i.takeoffRollup ?? null,
        materialItemId: i.materialItemId ?? null,
      })),
    });
  }
}

/** Copies spec items + lines into an estimate template. */
export async function copyIntoTemplate(tx: Tx, templateId: string, source: LineSet) {
  const specMap = new Map<string, string>();
  for (const s of source.specs) {
    const copy = await tx.estimateTemplateSpec.create({ data: { templateId, ...specCopy(s, 0) } });
    specMap.set(s.id, copy.id);
  }
  if (source.items.length) {
    await tx.estimateTemplateItem.createMany({ data: source.items.map((i) => ({ templateId, ...itemCopy(i, 0, specMap) })) });
  }
}

export async function loadTemplate(templateId: string) {
  await ensureTemplateSpecs(templateId);
  const template = await db.estimateTemplate.findUnique({ where: { id: templateId }, include: { items: true, specs: true } });
  if (!template) throw new Error("Template not found");
  return template;
}

/** Template choices for pickers, with line counts. */
export function templateOptions() {
  return db.estimateTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { items: true } } },
  });
}

/**
 * Creates the next estimate version for a project — blank, or pre-filled from a
 * template (spec items, lines, notes, terms, default markup). Moves a lead to
 * "Estimating". Returns the new estimate.
 */
export async function createProjectEstimate(projectId: string, templateId: string | null) {
  const [project, company, last, template] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.company.findFirst(),
    db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" } }),
    templateId ? loadTemplate(templateId) : null,
  ]);
  if (!project) throw new Error("Project not found");
  const est = await db.$transaction(async (tx) => {
    const created = await tx.estimate.create({
      data: {
        projectId,
        name: template?.name ?? "Estimate",
        version: (last?.version ?? 0) + 1,
        status: "DRAFT",
        defaultMarkup: template?.defaultMarkup ?? company?.defaultMarkup ?? 20,
        // The template's Markup, Margin & Tax table, else your default.
        markupTable: template?.markupTable ?? company?.markupTable ?? null,
        notes: template?.notes ?? null,
        terms: template?.terms ?? null,
      },
    });
    if (template) await copyIntoEstimate(tx, created.id, template, { values: await projectValues(projectId, tx) });
    return created;
  });
  if (project.status === "LEAD") {
    await db.project.update({ where: { id: projectId }, data: { status: "ESTIMATING" } });
  }
  return { estimate: est, template };
}

// --- Every line belongs to a spec item ---------------------------------------------

async function costCodeNames() {
  const codes = await db.costCode.findMany({ select: { id: true, name: true } });
  return new Map(codes.map((c) => [c.id, c.name]));
}

/**
 * Lines without a spec item (estimates from before spec items, or a spec that was
 * deleted elsewhere) are filed into one: per category + cost code, named after the
 * cost code. Nothing happens when every line already has one.
 */
export async function ensureEstimateSpecs(estimateId: string) {
  const loose = await db.estimateItem.findMany({ where: { estimateId, specId: null } });
  if (!loose.length) return;
  const names = await costCodeNames();
  await db.$transaction(async (tx) => {
    for (const g of groupLooseLines(loose, (id) => names.get(id))) {
      const spec = await tx.estimateSpec.create({
        data: { estimateId, name: g.name, category: g.category, sortOrder: g.sortOrder, isAllowance: g.lines.some((l) => l.isAllowance) },
      });
      await tx.estimateItem.updateMany({ where: { id: { in: g.lines.map((l) => l.id) } }, data: { specId: spec.id } });
    }
  });
}

export async function ensureTemplateSpecs(templateId: string) {
  const loose = await db.estimateTemplateItem.findMany({ where: { templateId, specId: null } });
  if (!loose.length) return;
  const names = await costCodeNames();
  await db.$transaction(async (tx) => {
    for (const g of groupLooseLines(loose, (id) => names.get(id))) {
      const spec = await tx.estimateTemplateSpec.create({
        data: { templateId, name: g.name, category: g.category, sortOrder: g.sortOrder, isAllowance: g.lines.some((l) => l.isAllowance) },
      });
      await tx.estimateTemplateItem.updateMany({ where: { id: { in: g.lines.map((l) => l.id) } }, data: { specId: spec.id } });
    }
  });
}

// --- Loading the sheet ----------------------------------------------------------------

type LoadedSpec = SourceSpec & { items: (SourceItem & { id: string })[] };

const byOrder = <T extends { sortOrder: number; id: string }>(a: T, b: T) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);

function toSheet(specs: LoadedSpec[]): SheetSpec[] {
  return [...specs].sort(byOrder).map((s) => ({
    id: s.id,
    key: s.id,
    name: s.name,
    category: s.category,
    specText: s.specText ?? "",
    kind: s.kind,
    isAllowance: s.isAllowance,
    clientNotes: s.clientNotes ?? "",
    tradeNotes: s.tradeNotes ?? "",
    urgent: s.urgent ?? false,
    requestedBy: s.requestedBy ? s.requestedBy.toISOString().slice(0, 10) : "",
    proposalView: s.proposalView ? parseSpecView(s.proposalView) : NO_VIEW,
    allowanceProfit: s.allowanceProfit ?? null,
    lines: [...s.items].sort(byOrder).map((l) => ({
      id: l.id,
      key: l.id,
      costCodeId: l.costCodeId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitCost: l.unitCost,
      markupPct: l.markupPct,
      costType: l.costType,
      notes: l.notes ?? "",
      isOptional: l.isOptional,
      fromTakeoff: !!(l.takeoffRollup || l.takeoffConditionId),
      takeoffKey: l.takeoffRollup ?? null,
      materialItemId: l.materialItemId ?? null,
      addToItemList: false,
      qtyFormula: l.qtyFormula ?? null,
      costFormula: l.costFormula ?? null,
    })),
  }));
}

export async function loadEstimateSheet(estimateId: string) {
  await ensureEstimateSpecs(estimateId);
  const specs = await db.estimateSpec.findMany({ where: { estimateId }, include: { items: true } });
  return toSheet(specs);
}

export async function loadTemplateSheet(templateId: string) {
  await ensureTemplateSpecs(templateId);
  const specs = await db.estimateTemplateSpec.findMany({ where: { templateId }, include: { items: true } });
  return toSheet(specs);
}

// --- Saving the sheet -------------------------------------------------------------------

function specData(s: SaveSheetInput["specs"][number], sortOrder: number) {
  return {
    name: s.name || "Untitled item",
    category: s.category || "General",
    specText: s.specText || null,
    kind: s.kind,
    isAllowance: s.isAllowance,
    clientNotes: s.clientNotes || null,
    tradeNotes: s.tradeNotes || null,
    sortOrder,
  };
}

function lineData(l: SaveSheetInput["specs"][number]["lines"][number], spec: SaveSheetInput["specs"][number], sortOrder: number) {
  return {
    costCodeId: l.costCodeId,
    group: spec.category || "General",
    description: l.description,
    quantity: l.quantity,
    unit: l.unit || "ea",
    unitCost: l.unitCost,
    markupPct: l.markupPct,
    costType: l.costType,
    notes: l.notes || null,
    qtyFormula: l.qtyFormula && !evaluateFormula(l.qtyFormula, {}, []).error ? l.qtyFormula : null,
    costFormula: l.costFormula && !evaluateFormula(l.costFormula, {}, []).error ? l.costFormula : null,
    isAllowance: spec.isAllowance,
    isOptional: l.isOptional,
    sortOrder,
  };
}

/** Only ids that exist (cost codes and Item List items can be deleted while the sheet is open). */
async function existingIds(tx: Tx, input: SaveSheetInput) {
  const lines = input.specs.flatMap((s) => s.lines);
  const codeIds = Array.from(new Set(lines.map((l) => l.costCodeId).filter((x): x is string => !!x)));
  const itemIds = Array.from(new Set(lines.map((l) => l.materialItemId).filter((x): x is string => !!x)));
  const [codes, items] = await Promise.all([
    codeIds.length ? tx.costCode.findMany({ where: { id: { in: codeIds } }, select: { id: true } }) : [],
    itemIds.length ? tx.materialItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } }) : [],
  ]);
  return { codes: new Set(codes.map((c) => c.id)), items: new Set(items.map((i) => i.id)) };
}

/**
 * Writes the sheet into an estimate. `sourceId` is the estimate the sheet was
 * loaded from; `targetId` is the same estimate ("save over") or a new version.
 * Saving over updates rows in place (so takeoff and selection links survive),
 * adds new ones and deletes the ones you removed. A new version copies every row,
 * carrying the takeoff, Item List and selection links along.
 */
export async function saveEstimateSheet(tx: Tx, sourceId: string, targetId: string, input: SaveSheetInput) {
  const over = sourceId === targetId;
  const [srcSpecs, srcItems, valid] = await Promise.all([
    tx.estimateSpec.findMany({ where: { estimateId: sourceId }, select: { id: true, selectionId: true } }),
    tx.estimateItem.findMany({ where: { estimateId: sourceId }, select: { id: true, takeoffConditionId: true, takeoffItemId: true, takeoffRollup: true } }),
    existingIds(tx, input),
  ]);
  const specById = new Map(srcSpecs.map((s) => [s.id, s]));
  const itemById = new Map(srcItems.map((i) => [i.id, i]));

  if (over) {
    const keepSpecs = new Set(input.specs.map((s) => s.id).filter(Boolean));
    const keepLines = new Set(input.specs.flatMap((s) => s.lines.map((l) => l.id)).filter(Boolean));
    const goneLines = input.knownLineIds.filter((id) => !keepLines.has(id) && itemById.has(id));
    const goneSpecs = input.knownSpecIds.filter((id) => !keepSpecs.has(id) && specById.has(id));
    if (goneLines.length) await tx.estimateItem.deleteMany({ where: { id: { in: goneLines }, estimateId: sourceId } });
    if (goneSpecs.length) await tx.estimateSpec.deleteMany({ where: { id: { in: goneSpecs }, estimateId: sourceId } });
  }

  let order = 0;
  for (const s of input.specs) {
    const src = s.id ? specById.get(s.id) : undefined;
    const data = {
      ...specData(s, order++),
      urgent: s.urgent,
      requestedBy: s.requestedBy ? new Date(`${s.requestedBy}T12:00:00`) : null,
      proposalView: specViewJson(s.proposalView),
      allowanceProfit: s.allowanceProfit,
    };
    const specId =
      over && src
        ? (await tx.estimateSpec.update({ where: { id: src.id }, data })).id
        : (await tx.estimateSpec.create({ data: { ...data, estimateId: targetId, selectionId: src?.selectionId ?? null } })).id;

    for (const l of s.lines) {
      const srcLine = l.id ? itemById.get(l.id) : undefined;
      let materialItemId = l.materialItemId && valid.items.has(l.materialItemId) ? l.materialItemId : null;
      if (l.addToItemList && !materialItemId && l.description) {
        const item = await resolveMaterialItem(tx, {
          description: l.description,
          unit: l.unit || "ea",
          unitCost: l.unitCost,
          markupPct: l.markupPct,
          wastePct: 0,
          roundUp: false,
          costCodeId: l.costCodeId,
        });
        materialItemId = item.id;
      }
      const data = {
        ...lineData(l, s, order++),
        costCodeId: l.costCodeId && valid.codes.has(l.costCodeId) ? l.costCodeId : null,
        specId,
        materialItemId,
        // "Stop updating" unhooks the line from the takeoff too.
        takeoffConditionId: l.fromTakeoff ? (srcLine?.takeoffConditionId ?? null) : null,
        takeoffItemId: l.fromTakeoff ? (srcLine?.takeoffItemId ?? null) : null,
        takeoffRollup: l.fromTakeoff ? (srcLine?.takeoffRollup ?? null) : null,
      };
      if (over && srcLine) await tx.estimateItem.update({ where: { id: srcLine.id }, data });
      else await tx.estimateItem.create({ data: { ...data, estimateId: targetId } });
    }
  }
}

/** The template version of saveEstimateSheet (always saves over). */
export async function saveTemplateSheet(tx: Tx, templateId: string, input: SaveSheetInput) {
  const [srcSpecs, srcItems, valid] = await Promise.all([
    tx.estimateTemplateSpec.findMany({ where: { templateId }, select: { id: true } }),
    tx.estimateTemplateItem.findMany({ where: { templateId }, select: { id: true } }),
    existingIds(tx, input),
  ]);
  const specIds = new Set(srcSpecs.map((s) => s.id));
  const itemIds = new Set(srcItems.map((i) => i.id));
  const keepSpecs = new Set(input.specs.map((s) => s.id).filter(Boolean));
  const keepLines = new Set(input.specs.flatMap((s) => s.lines.map((l) => l.id)).filter(Boolean));
  const goneLines = input.knownLineIds.filter((id) => !keepLines.has(id) && itemIds.has(id));
  const goneSpecs = input.knownSpecIds.filter((id) => !keepSpecs.has(id) && specIds.has(id));
  if (goneLines.length) await tx.estimateTemplateItem.deleteMany({ where: { id: { in: goneLines }, templateId } });
  if (goneSpecs.length) await tx.estimateTemplateSpec.deleteMany({ where: { id: { in: goneSpecs }, templateId } });

  let order = 0;
  for (const s of input.specs) {
    const data = specData(s, order++);
    const specId =
      s.id && specIds.has(s.id)
        ? (await tx.estimateTemplateSpec.update({ where: { id: s.id }, data })).id
        : (await tx.estimateTemplateSpec.create({ data: { ...data, templateId } })).id;
    for (const l of s.lines) {
      const data = { ...lineData(l, s, order++), costCodeId: l.costCodeId && valid.codes.has(l.costCodeId) ? l.costCodeId : null, specId };
      if (l.id && itemIds.has(l.id)) await tx.estimateTemplateItem.update({ where: { id: l.id }, data });
      else await tx.estimateTemplateItem.create({ data: { ...data, templateId } });
    }
  }
}
