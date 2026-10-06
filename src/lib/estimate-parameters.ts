import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { formulaQty } from "./estimate-sheet-state";
import { settleSales, usesSales } from "./sales-price";
import { parseMarkupTable } from "./markup";

type Tx = Prisma.TransactionClient;

/** Your estimate parameters (Settings → Estimate parameters), in your order. */
export function loadParameters() {
  return db.estimateParameter.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true } });
}
export type EstimateParam = Awaited<ReturnType<typeof loadParameters>>[number];

/** A job's parameter values, by parameter id. */
/** An estimate version's parameter values (each version has its own). */
export async function estimateValues(estimateId: string, client: Tx | typeof db = db) {
  const rows = await client.estimateParameterValue.findMany({ where: { estimateId }, select: { parameterId: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.parameterId, r.value])) as Record<string, number>;
}

/** Saves an estimate version's values (parameters that still exist; a missing value removes it). */
export async function saveEstimateValues(tx: Tx, estimateId: string, values: Record<string, number>) {
  const params = await tx.estimateParameter.findMany({ select: { id: true } });
  for (const { id } of params) {
    const value = values[id];
    if (value === undefined || !Number.isFinite(value)) await tx.estimateParameterValue.deleteMany({ where: { estimateId, parameterId: id } });
    else
      await tx.estimateParameterValue.upsert({
        where: { estimateId_parameterId: { estimateId, parameterId: id } },
        create: { estimateId, parameterId: id, value },
        update: { value },
      });
  }
}

/** A template's parameter values (JSON { parameterId: value }); bad or missing = none. */
export function templateValues(json: string | null | undefined): Record<string, number> {
  try {
    const o = JSON.parse(json ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "number" && Number.isFinite(v))) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Old (values shared by a job's versions) — only for moving them onto each version. */
export async function projectValues(projectId: string, client: Tx | typeof db = db) {
  const rows = await client.projectParameterValue.findMany({ where: { projectId }, select: { parameterId: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.parameterId, r.value])) as Record<string, number>;
}

/**
 * A draft estimate's formula quantities from its parameter values (in case they were
 * changed without the sheet saving them). Sent / approved estimates keep theirs.
 */
export async function refreshFormulaQuantities(estimateId: string) {
  const est = await db.estimate.findUnique({ where: { id: estimateId }, select: { projectId: true, status: true, basePrice: true, markupTable: true, defaultMarkup: true } });
  if (!est || est.status !== "DRAFT") return;
  const items = await db.estimateItem.findMany({
    where: { estimateId },
    select: { id: true, quantity: true, unitCost: true, markupPct: true, isOptional: true, costType: true, qtyFormula: true, costFormula: true },
  });
  if (!items.some((i) => i.qtyFormula || i.costFormula)) return;
  const values = await estimateValues(estimateId);
  // Parameter formulas first; lines using "Sales price" then settle at the price they're part of.
  let lines = items.map((i) => ({
    ...i,
    quantity: i.qtyFormula && !usesSales({ qtyFormula: i.qtyFormula }) ? formulaQty(i.qtyFormula, values) : i.quantity,
    unitCost: i.costFormula && !usesSales({ qtyFormula: null, costFormula: i.costFormula }) ? formulaQty(i.costFormula, values) : i.unitCost,
  }));
  if (lines.some(usesSales)) lines = settleSales(lines, values, est.basePrice, parseMarkupTable(est.markupTable, est.defaultMarkup)).lines;
  const was = new Map(items.map((i) => [i.id, i]));
  const changed = lines.filter((l) => {
    const w = was.get(l.id)!;
    return Math.abs(l.quantity - w.quantity) > 1e-9 || Math.abs(l.unitCost - w.unitCost) > 1e-9;
  });
  if (changed.length) await db.$transaction(changed.map((l) => db.estimateItem.update({ where: { id: l.id }, data: { quantity: l.quantity, unitCost: l.unitCost } })));
}
