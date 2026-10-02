import "server-only";
import { db } from "./db";
import {
  addMetrics,
  assemblyQuantity,
  emptyMetrics,
  framingBoards,
  isMemberType,
  measurementMetrics,
  metricUnit,
  parseArcs,
  parsePoints,
  polylineLength,
  withMemberSize,
  withWaste,
  DEFAULT_OPENING_OPTIONS,
  arcPath,
  DEFAULT_WALL_OPTIONS,
  autoMetricPrefix,
  openingTakeoff,
  parseOptions,
  wallRun,
  wallTakeoff,
  type AutoLine,
  type BoardPattern,
  type MetricKey,
  type Metrics,
} from "./takeoff";

/** Conditions with their measurements (and each measurement's sheet scale) and assembly items. */
export function loadConditions(projectId: string) {
  return db.takeoffCondition.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      costCode: { select: { id: true, code: true, name: true } },
      memberSizeRef: { select: { id: true, name: true, kind: true, widthIn: true, depthIn: true, boardFeet: true, soldAs: true } },
      items: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          costCode: { select: { code: true, name: true, division: true } },
          materialItem: { select: { id: true, name: true, category: true, sku: true, vendor: true, unitCost: true } },
        },
      },
      measurements: {
        include: {
          sheet: { select: { id: true, name: true, pageNumber: true, unitsPerFoot: true, plan: { select: { id: true, name: true } } } },
        },
      },
    },
  });
}

export type LoadedCondition = Awaited<ReturnType<typeof loadConditions>>[number];

export type ConditionTotals = {
  metrics: Metrics;
  quantity: number; // primary metric, before waste
  quantityWithWaste: number;
  unit: string;
  bySheet: { sheetId: string; label: string; planId: string; pageNumber: number; metrics: Metrics; unscaled: boolean }[];
  cutList: [number, number][]; // boards to order: [stock length, count]
  wall: Record<string, number>; // walls & openings: material quantities by "wall:<key>" / "opening:<key>"
  wallLines: AutoLine[];
  boards: BoardPattern[]; // what each stock board is cut into (stock-length sizes)
  unscaledShapes: number;
};

/** Totals for one condition across every sheet. */
export function conditionTotals(c: LoadedCondition): ConditionTotals {
  const calc = withMemberSize(c, c.memberSizeRef);
  let metrics = emptyMetrics();
  const bySheet = new Map<string, ConditionTotals["bySheet"][number]>();
  let unscaledShapes = 0;
  const shapes = c.measurements.map((m) => ({
    m: { points: parsePoints(m.points), arcs: parseArcs(m.points), isDeduction: m.isDeduction, angle: m.angle, pitch: m.pitch, pitch2: m.pitch2 },
    unitsPerFoot: m.sheet.unitsPerFoot,
    sheet: m.sheet,
  }));
  for (const s of shapes) {
    if (!s.unitsPerFoot && c.type !== "COUNT") unscaledShapes++;
    const mm = measurementMetrics(calc, s.m, s.unitsPerFoot);
    metrics = addMetrics(metrics, mm);
    const row = bySheet.get(s.sheet.id) ?? {
      sheetId: s.sheet.id,
      label: `${s.sheet.plan.name} · ${s.sheet.name}`,
      planId: s.sheet.plan.id,
      pageNumber: s.sheet.pageNumber,
      metrics: emptyMetrics(),
      unscaled: !s.unitsPerFoot && c.type !== "COUNT",
    };
    row.metrics = addMetrics(row.metrics, mm);
    bySheet.set(s.sheet.id, row);
  }
  // Lumber is ordered as packed boards (short pieces share a board), so the
  // ordered length and board feet come from the packing, not shape by shape.
  const lumber = isMemberType(c.type) ? framingBoards(calc, shapes) : null;
  if (lumber && lumber.boards.length) {
    const orderedLf = lumber.cutList.reduce((sum, [len, n]) => sum + len * n, 0);
    const bfPerLf = metrics.stock_lf > 0 ? metrics.board_feet / metrics.stock_lf : 0;
    metrics = { ...metrics, stock_lf: orderedLf, board_feet: orderedLf * bfPerLf };
  }
  // Walls and openings: materials from the traced lines and the condition's options.
  const wallLines: AutoLine[] = [];
  const scaled = c.measurements.filter((m) => m.sheet.unitsPerFoot && !m.isDeduction);
  if (c.type === "WALL") {
    const runs = scaled.map((m) => wallRun(parsePoints(m.points), m.sheet.unitsPerFoot!, parseArcs(m.points)));
    wallLines.push(...wallTakeoff({ studSize: c.memberSize ?? "", spacing: c.spacing, heightFt: c.height }, parseOptions(c.options, DEFAULT_WALL_OPTIONS), runs).lines);
  } else if (c.type === "OPENING") {
    const widths = scaled.map((m) => polylineLength(arcPath(parsePoints(m.points), parseArcs(m.points), false)) / m.sheet.unitsPerFoot!);
    wallLines.push(...openingTakeoff({ size: c.memberSize, stockLengths: c.stockLengths }, parseOptions(c.options, DEFAULT_OPENING_OPTIONS), widths).lines);
  }
  const quantity = metrics[c.metric as MetricKey] ?? 0;
  return {
    metrics,
    quantity,
    quantityWithWaste: withWaste(quantity, c.wastePct),
    unit: metricUnit(c.metric),
    bySheet: Array.from(bySheet.values()),
    cutList: lumber?.cutList ?? [],
    wall: Object.fromEntries(wallLines.map((l) => [`${autoMetricPrefix(c.type)}${l.key}`, l.qty])),
    wallLines,
    boards: lumber?.boards ?? [],
    unscaledShapes,
  };
}

/** Framing lines name their lumber size unless the condition name already does. */
function withSize(c: LoadedCondition) {
  const size = isMemberType(c.type) ? c.memberSize?.trim() : null;
  return size && !c.name.toLowerCase().includes(size.toLowerCase()) ? `${c.name} (${size})` : c.name;
}

export type EstimateLine = {
  conditionId: string;
  itemId: string | null;
  costCodeId: string | null;
  group: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  markupPct: number;
};

/**
 * The estimate lines a condition produces. With assembly items, each item is a
 * line; otherwise the condition itself is one line (its main quantity + waste).
 */
export function conditionEstimateLines(c: LoadedCondition, totals: ConditionTotals): EstimateLine[] {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (c.items.length === 0) {
    return [
      {
        conditionId: c.id,
        itemId: null,
        costCodeId: c.costCodeId,
        group: c.group,
        description: withSize(c),
        quantity: round(totals.quantityWithWaste),
        unit: totals.unit,
        unitCost: c.unitCost,
        markupPct: c.markupPct,
      },
    ];
  }
  return c.items.map((i) => ({
    conditionId: c.id,
    itemId: i.id,
    costCodeId: i.costCodeId,
    group: c.group,
    description: `${withSize(c)} — ${i.description}`,
    quantity: round(assemblyQuantity(i, totals.metrics, totals.cutList, totals.wall)),
    unit: i.unit,
    unitCost: i.unitCost,
    markupPct: i.markupPct,
  }));
}

/**
 * Writes the takeoff into a draft estimate. Lines that came from the takeoff
 * before are updated in place; new ones are added after the existing lines;
 * takeoff lines whose condition or assembly item no longer applies are removed.
 * Lines typed straight into the estimate are never touched.
 */
export async function syncTakeoffToEstimate(projectId: string, estimateId: string) {
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, include: { items: true, allowances: true } });
  if (!est) throw new Error("Pick an estimate");
  if (est.status !== "DRAFT") throw new Error("Only draft estimates can be updated");

  const conditions = await loadConditions(projectId);
  const lines = conditions.flatMap((c) => conditionEstimateLines(c, conditionTotals(c)));
  const key = (conditionId: string | null, itemId: string | null) => `${conditionId}:${itemId ?? ""}`;
  const existing = new Map(est.items.filter((i) => i.takeoffConditionId).map((i) => [key(i.takeoffConditionId, i.takeoffItemId), i]));
  let sortOrder = Math.max(-1, ...est.items.map((i) => i.sortOrder), ...est.allowances.map((a) => a.sortOrder)) + 1;
  let created = 0;
  let updated = 0;

  await db.$transaction(async (tx) => {
    for (const line of lines) {
      const data = {
        costCodeId: line.costCodeId,
        group: line.group,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        markupPct: line.markupPct,
      };
      const match = existing.get(key(line.conditionId, line.itemId));
      if (match) {
        existing.delete(key(line.conditionId, line.itemId));
        // A line inside an allowance keeps the allowance's group.
        await tx.estimateItem.update({ where: { id: match.id }, data: match.allowanceId ? { ...data, group: match.group } : data });
        updated++;
      } else {
        await tx.estimateItem.create({
          data: { ...data, estimateId, takeoffConditionId: line.conditionId, takeoffItemId: line.itemId, sortOrder: sortOrder++ },
        });
        created++;
      }
    }
    const stale = Array.from(existing.values()).map((i) => i.id);
    if (stale.length) await tx.estimateItem.deleteMany({ where: { id: { in: stale } } });
  });

  return { estimate: est, created, updated };
}
