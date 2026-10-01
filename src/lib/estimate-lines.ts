import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { boolField, numField, str, strOrNull } from "./utils";

/**
 * Shared plumbing for estimate-shaped line sets (job estimates and estimate
 * templates): form parsing, ordering, and copying lines + built-up allowances
 * from one set into another.
 */

type Tx = Prisma.TransactionClient;

export type SourceAllowance = {
  id: string;
  name: string;
  group: string;
  description: string | null;
  sortOrder: number;
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
  isAllowance: boolean;
  isOptional: boolean;
  sortOrder: number;
  allowanceId: string | null;
  // Only on job estimates: lines sent from a takeoff.
  takeoffConditionId?: string | null;
  takeoffItemId?: string | null;
};

export type LineSet = { items: SourceItem[]; allowances: SourceAllowance[] };

/** Items and allowances share one ordering so allowances sit among the lines of their group. */
export function nextSortOrder(set: { items: { sortOrder: number }[]; allowances: { sortOrder: number }[] }) {
  return Math.max(-1, ...set.items.map((i) => i.sortOrder), ...set.allowances.map((a) => a.sortOrder)) + 1;
}

/**
 * Line item fields from a form. A line assigned to an allowance takes the allowance's
 * group and is always flagged as an allowance line — its price rolls up into the allowance.
 */
export function lineFields(fd: FormData, allowances: { id: string; group: string }[]) {
  const description = str(fd, "description");
  if (!description) throw new Error("Description is required");
  const allowanceId = strOrNull(fd, "allowanceId");
  const allowance = allowanceId ? allowances.find((a) => a.id === allowanceId) : null;
  if (allowanceId && !allowance) throw new Error("Allowance not found");
  return {
    costCodeId: strOrNull(fd, "costCodeId"),
    group: allowance?.group ?? (str(fd, "group") || "General"),
    description,
    quantity: numField(fd, "quantity", 1),
    unit: str(fd, "unit") || "ea",
    unitCost: numField(fd, "unitCost", 0),
    markupPct: numField(fd, "markupPct", 0),
    isAllowance: allowance ? true : boolField(fd, "isAllowance"),
    isOptional: boolField(fd, "isOptional"),
    allowanceId: allowance?.id ?? null,
  };
}

export function allowanceFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Allowance name is required");
  return {
    name,
    group: str(fd, "group") || "General",
    description: strOrNull(fd, "description"),
  };
}

/** Starter lines for a new allowance: one $0 line per chosen cost code, ready to be priced. */
export async function starterCostCodes(fd: FormData) {
  const ids = fd.getAll("costCodeIds").map(String).filter(Boolean);
  if (!ids.length) return [];
  return db.costCode.findMany({ where: { id: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
}

/** Strips a trailing "allowance" from a line description to name the allowance it becomes. */
export function allowanceNameFromLine(description: string) {
  return description.replace(/\s*\(?allowance\)?\s*$/i, "").trim() || description;
}

function itemCopy(i: SourceItem, sortOffset: number, allowanceMap: Map<string, string>) {
  return {
    costCodeId: i.costCodeId,
    group: i.group,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unitCost: i.unitCost,
    markupPct: i.markupPct,
    isAllowance: i.isAllowance,
    isOptional: i.isOptional,
    sortOrder: i.sortOrder + sortOffset,
    allowanceId: i.allowanceId ? (allowanceMap.get(i.allowanceId) ?? null) : null,
  };
}

/**
 * Copies lines + allowances into a job estimate. `sortOffset` places them after any
 * existing lines (used when appending a template to a draft).
 */
export async function copyIntoEstimate(
  tx: Tx,
  estimateId: string,
  source: LineSet,
  opts: { sortOffset?: number; keepSelectionLinks?: boolean } = {},
) {
  const sortOffset = opts.sortOffset ?? 0;
  const allowanceMap = new Map<string, string>();
  for (const a of source.allowances) {
    const copy = await tx.estimateAllowance.create({
      data: {
        estimateId,
        name: a.name,
        group: a.group,
        description: a.description,
        selectionId: opts.keepSelectionLinks ? (a.selectionId ?? null) : null,
        sortOrder: a.sortOrder + sortOffset,
      },
    });
    allowanceMap.set(a.id, copy.id);
  }
  if (source.items.length) {
    await tx.estimateItem.createMany({
      data: source.items.map((i) => ({
        estimateId,
        ...itemCopy(i, sortOffset, allowanceMap),
        // A new version keeps its takeoff links so re-sending the takeoff updates these lines.
        takeoffConditionId: i.takeoffConditionId ?? null,
        takeoffItemId: i.takeoffItemId ?? null,
      })),
    });
  }
}

/** Copies lines + allowances into an estimate template. */
export async function copyIntoTemplate(tx: Tx, templateId: string, source: LineSet) {
  const allowanceMap = new Map<string, string>();
  for (const a of source.allowances) {
    const copy = await tx.estimateTemplateAllowance.create({
      data: { templateId, name: a.name, group: a.group, description: a.description, sortOrder: a.sortOrder },
    });
    allowanceMap.set(a.id, copy.id);
  }
  if (source.items.length) {
    await tx.estimateTemplateItem.createMany({ data: source.items.map((i) => ({ templateId, ...itemCopy(i, 0, allowanceMap) })) });
  }
}

export async function loadTemplate(templateId: string) {
  const template = await db.estimateTemplate.findUnique({ where: { id: templateId }, include: { items: true, allowances: true } });
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
 * template (lines, allowances, notes, terms, default markup). Moves a lead to
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
        notes: template?.notes ?? null,
        terms: template?.terms ?? null,
      },
    });
    if (template) await copyIntoEstimate(tx, created.id, template);
    return created;
  });
  if (project.status === "LEAD") {
    await db.project.update({ where: { id: projectId }, data: { status: "ESTIMATING" } });
  }
  return { estimate: est, template };
}
