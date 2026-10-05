import "server-only";
import { db } from "./db";
import { guessCostType, rollupTakeoff } from "./estimate-sheet";
import { divisionCategories } from "./estimate-categories";
import { detailChanges, mergeNote, parseAutoNote, parseSnapshot, toSnapshot, type ChangeLine, type SnapRow } from "./takeoff-changes";
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
  DEFAULT_DOOR_OPTIONS,
  DEFAULT_WINDOW_OPTIONS,
  doorTakeoff,
  windowTakeoff,
  isCountType,
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
          materialItem: { select: { id: true, name: true, widthIn: true, heightIn: true } },
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
  unassignedDoors: number; // Doors / windows: markers with nothing picked yet
  boards: BoardPattern[]; // what each stock board is cut into (stock-length sizes)
  unscaledShapes: number;
};

/** A door's size, when the item picked on its marker has one. */
function doorSize(item: { widthIn: number | null; heightIn: number | null } | null, cased: boolean | null = null) {
  return item?.widthIn && item.heightIn ? { widthIn: item.widthIn, heightIn: item.heightIn, cased } : null;
}

/** Totals for one condition across every sheet. */
export function conditionTotals(c: LoadedCondition): ConditionTotals {
  const calc = withMemberSize(c, c.memberSizeRef);
  let metrics = emptyMetrics();
  const bySheet = new Map<string, ConditionTotals["bySheet"][number]>();
  let unscaledShapes = 0;
  const shapes = c.measurements.map((m) => ({
    m: {
      points: parsePoints(m.points),
      arcs: parseArcs(m.points),
      isDeduction: m.isDeduction,
      angle: m.angle,
      pitch: m.pitch,
      pitch2: m.pitch2,
      height: m.height,
      door: doorSize(m.materialItem, m.cased),
    },
    unitsPerFoot: m.sheet.unitsPerFoot,
    sheet: m.sheet,
  }));
  for (const s of shapes) {
    if (!s.unitsPerFoot && !isCountType(c.type)) unscaledShapes++;
    const mm = measurementMetrics(calc, s.m, s.unitsPerFoot);
    metrics = addMetrics(metrics, mm);
    const row = bySheet.get(s.sheet.id) ?? {
      sheetId: s.sheet.id,
      label: `${s.sheet.plan.name} · ${s.sheet.name}`,
      planId: s.sheet.plan.id,
      pageNumber: s.sheet.pageNumber,
      metrics: emptyMetrics(),
      unscaled: !s.unitsPerFoot && !isCountType(c.type),
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
  let unassignedDoors = 0;
  const scaled = c.measurements.filter((m) => m.sheet.unitsPerFoot && !m.isDeduction);
  if (c.type === "WALL") {
    const runs = scaled.map((m) => wallRun(parsePoints(m.points), m.sheet.unitsPerFoot!, parseArcs(m.points)));
    wallLines.push(...wallTakeoff({ studSize: c.memberSize ?? "", spacing: c.spacing, heightFt: c.height }, parseOptions(c.options, DEFAULT_WALL_OPTIONS), runs).lines);
  } else if (c.type === "WINDOW") {
    const windows = c.measurements.map((m) => {
      const size = doorSize(m.materialItem);
      return { name: size ? m.materialItem!.name : null, widthIn: size?.widthIn ?? 0, heightIn: size?.heightIn ?? 0, cased: m.cased !== false };
    });
    const t = windowTakeoff(windows, parseOptions(c.options, DEFAULT_WINDOW_OPTIONS));
    wallLines.push(...t.lines);
    unassignedDoors = t.unassigned;
  } else if (c.type === "DOOR") {
    // Doors don't need a scale: each marker is a door, sized by the door picked on it.
    const doors = c.measurements.map((m) => {
      const size = doorSize(m.materialItem);
      return { name: size ? m.materialItem!.name : null, widthIn: size?.widthIn ?? 0, heightIn: size?.heightIn ?? 0 };
    });
    const t = doorTakeoff(doors, parseOptions(c.options, DEFAULT_DOOR_OPTIONS));
    wallLines.push(...t.lines);
    unassignedDoors = t.unassigned;
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
    unassignedDoors,
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
  // Reference only (Heated & cooled, to check the plan): measured, never priced.
  if (c.referenceOnly) return [];
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

export type TakeoffDetailRow = { description: string; quantity: number; unit: string; unitCost: number };

/** The takeoff items behind each takeoff total on the estimate, by its key ("code:<id>"): only that cost code's items. */
export async function takeoffDetail(projectId: string) {
  const out: Record<string, TakeoffDetailRow[]> = {};
  for (const c of await loadConditions(projectId)) {
    for (const l of conditionEstimateLines(c, conditionTotals(c))) {
      if (!(l.quantity > 0)) continue;
      const key = l.costCodeId ? `code:${l.costCodeId}` : `group:${l.group.trim().toLowerCase()}`;
      (out[key] ??= []).push({ description: l.description, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost });
    }
  }
  return out;
}

/** Lines the takeoff made itself ("From takeoff — 2102 Foundation Material"), as opposed to your own line it fills. */
const madeByTakeoff = (description: string) => description.startsWith("From takeoff");

/**
 * Writes the takeoff into a draft estimate as one line per cost code — e.g. all
 * the framing lumber, sheathing and nails become "From takeoff — 3120 Framing
 * Package" at their total cost. When the estimate already has your own line with that
 * cost code, that line takes the total instead. The items behind it show in its dropdown.
 *
 * Sending again updates that line's cost (its spec item, profit %, cost type and
 * notes are yours and stay). A new line goes into your spec item that already uses
 * its cost code, else where older takeoff lines were, else the item named after the
 * code's division ("3100 Framing"), made in General if it isn't there yet. Lines typed straight into the estimate are never touched.
 */
export async function syncTakeoffToEstimate(projectId: string, estimateId: string) {
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, include: { items: true, specs: true } });
  if (!est) throw new Error("Pick an estimate");
  if (est.status !== "DRAFT") throw new Error("Only draft estimates can be updated");
  if (est.lockedAt) throw new Error("This estimate is locked — unlock it to update it from the takeoff");

  const [conditions, codes, filing] = await Promise.all([
    loadConditions(projectId),
    db.costCode.findMany({ select: { id: true, code: true, name: true, division: true } }),
    divisionCategories(),
  ]);
  const codeById = new Map(codes.map((c) => [c.id, c]));
  // Nothing measured yet (a wall with no length drawn): nothing to send — no $0 placeholder line.
  const lines = conditions.flatMap((c) => conditionEstimateLines(c, conditionTotals(c))).filter((l) => l.quantity > 0);
  // The items behind each takeoff line, for "what changed" next time.
  const snapByKey = new Map<string, SnapRow[]>();
  for (const l of lines) {
    if (!(l.quantity > 0)) continue;
    const key = l.costCodeId && codeById.has(l.costCodeId) ? `code:${l.costCodeId}` : `group:${l.group.trim().toLowerCase()}`;
    snapByKey.set(key, [...(snapByKey.get(key) ?? []), ...toSnapshot([l])]);
  }
  const rollups = rollupTakeoff(lines, (id) => {
    const c = codeById.get(id);
    return c ? { label: c.code ? `${c.code} ${c.name}` : c.name, name: c.name, division: c.division, category: filing.map[c.division] ?? "General" } : undefined;
  });

  const existing = new Map(est.items.filter((i) => i.takeoffRollup).map((i) => [i.takeoffRollup!, i]));
  // Item-by-item takeoff lines from before: replaced by the rolled-up lines.
  const oldLines = est.items.filter((i) => i.takeoffConditionId && !i.takeoffRollup);
  let sortOrder = Math.max(-1, ...est.items.map((i) => i.sortOrder), ...est.specs.map((a) => a.sortOrder)) + 1;
  let created = 0;
  let updated = 0;
  const changes: ChangeLine[] = [];
  const cents = (n: number) => Math.round(n * 100) / 100;

  await db.$transaction(
    async (tx) => {
      const specs = [...est.specs];
      const specFor = async (r: (typeof rollups)[number]) => {
        const sameKey = (i: (typeof est.items)[number]) => (r.costCodeId ? i.costCodeId === r.costCodeId : i.group.trim().toLowerCase() === r.category.trim().toLowerCase());
        // Your own item with this cost code first, then where the older takeoff lines were.
        const yours = r.costCodeId ? est.items.find((i) => i.specId && i.costCodeId === r.costCodeId && !i.takeoffConditionId && !i.takeoffRollup) : undefined;
        if (yours?.specId) return yours.specId;
        const fromOld = oldLines.find((i) => i.specId && sameKey(i));
        if (fromOld?.specId) return fromOld.specId;
        const byName = specs.find((s) => s.name.trim().toLowerCase() === r.name.trim().toLowerCase());
        if (byName) return byName.id;
        const spec = await tx.estimateSpec.create({ data: { estimateId, name: r.name, category: r.category, sortOrder: sortOrder++ } });
        specs.push(spec);
        return spec.id;
      };

      // Your own line with the cost code ("2102 Foundation Material") takes the takeoff's total —
      // no second "From takeoff" line beside it. Its name, profit % and notes stay yours.
      const taken = new Set<string>();
      const ownLine = (codeId: string | null) =>
        codeId
          ? est.items
              .filter((i) => i.costCodeId === codeId && i.specId && !i.takeoffConditionId && !i.takeoffRollup && !taken.has(i.id))
              .sort((a, b) => a.sortOrder - b.sortOrder)[0]
          : undefined;
      const fill = { quantity: 1, unit: "ls", qtyFormula: null, costFormula: null };

      for (const r of rollups) {
        const snap = snapByKey.get(r.key) ?? [];
        const snapshot = JSON.stringify(snap);
        const data = { costCodeId: r.costCodeId, description: r.description, quantity: 1, unit: "ls", unitCost: r.cost, takeoffSnapshot: snapshot };
        const match = existing.get(r.key);
        const own = !match || madeByTakeoff(match.description) ? ownLine(r.costCodeId) : undefined;
        // What this line was before (an older separate takeoff line counts too).
        const was = match ?? own;
        const before = was ? cents(was.quantity * was.unitCost) : 0;
        const note = (name: string) => {
          if (Math.abs(before - r.cost) >= 0.005 || (was && was.takeoffSnapshot && was.takeoffSnapshot !== snapshot))
            changes.push({ key: r.key, name, from: before, to: r.cost, details: detailChanges(parseSnapshot(match?.takeoffSnapshot), snap) });
        };
        if (own) {
          taken.add(own.id);
          // An older separate takeoff line for it goes (it's left in `existing`, so it's removed below).
          await tx.estimateItem.update({ where: { id: own.id }, data: { ...fill, unitCost: r.cost, takeoffRollup: r.key, takeoffSnapshot: snapshot } });
          note(own.description);
          updated++;
        } else if (match) {
          existing.delete(r.key);
          // Nothing moved: leave the line alone (the estimate updates itself often).
          const same =
            Math.abs(match.quantity * match.unitCost - r.cost) < 0.005 &&
            match.quantity === 1 &&
            match.takeoffSnapshot === snapshot &&
            (!madeByTakeoff(match.description) || match.description === r.description);
          if (!same) {
            await tx.estimateItem.update({
              where: { id: match.id },
              data: madeByTakeoff(match.description) ? data : { ...fill, unitCost: r.cost, takeoffSnapshot: snapshot },
            });
            note(madeByTakeoff(match.description) ? r.description.replace(/^From takeoff — /, "") : match.description);
            updated++;
          }
        } else {
          const specId = await specFor(r);
          const spec = specs.find((s) => s.id === specId);
          await tx.estimateItem.create({
            data: {
              ...data,
              estimateId,
              specId,
              group: spec?.category ?? r.category,
              isAllowance: spec?.isAllowance ?? false,
              markupPct: est.defaultMarkup,
              costType: guessCostType(r.name),
              takeoffRollup: r.key,
              sortOrder: sortOrder++,
            },
          });
          if (r.cost > 0) changes.push({ key: r.key, name: `${r.description.replace(/^From takeoff — /, "")} (new line)`, from: 0, to: r.cost, details: [] });
          created++;
        }
      }

      // Takeoff lines that no longer apply, and the old item-by-item ones. Your own lines stay (at $0, no longer tied).
      const left = Array.from(existing.values());
      for (const i of left) {
        // A separate takeoff line your own line just took over isn't a change (the own line's note covers it).
        if (i.takeoffRollup && rollups.some((r) => r.key === i.takeoffRollup)) continue;
        if (i.quantity * i.unitCost >= 0.005)
          changes.push({
            key: i.takeoffRollup ?? i.id,
            name: `${i.description.replace(/^From takeoff — /, "")} (no longer in the takeoff)`,
            from: cents(i.quantity * i.unitCost),
            to: 0,
            details: [],
          });
      }
      for (const i of left.filter((i) => !madeByTakeoff(i.description))) {
        await tx.estimateItem.update({ where: { id: i.id }, data: { unitCost: 0, takeoffRollup: null, takeoffSnapshot: null } });
      }
      const gone = [...left.filter((i) => madeByTakeoff(i.description)), ...oldLines].map((i) => i.id);
      if (gone.length) await tx.estimateItem.deleteMany({ where: { id: { in: gone } } });
      // Spec items that only ever held those old takeoff lines (made by an earlier send) go too.
      const emptied = est.specs.filter((s) => {
        const had = est.items.filter((i) => i.specId === s.id);
        return had.length > 0 && had.every((i) => gone.includes(i.id)) && !s.specText && !s.selectionId;
      });
      for (const s of emptied) {
        if ((await tx.estimateItem.count({ where: { specId: s.id } })) === 0) await tx.estimateSpec.delete({ where: { id: s.id } });
      }
      // "What changed" — piles up until the estimate is saved.
      if (changes.length) {
        const merged = mergeNote(parseAutoNote(est.autoNote), changes, new Date());
        // Written without touching the estimate's "updated" time: the open sheet is keyed on it,
        // and a new key would throw away edits you haven't saved yet.
        const json = merged ? JSON.stringify(merged) : null;
        await tx.$executeRaw`UPDATE "Estimate" SET "autoNote" = ${json} WHERE "id" = ${est.id}`;
      }
    },
    { timeout: 30000 },
  );

  return { estimate: est, created, updated, changes };
}

/**
 * A draft that has the takeoff on it updates itself whenever it's opened: new prices
 * (an unlocked job follows the Item List) and new quantities. Locked estimates, and
 * sent or approved ones, never change.
 */
export async function refreshDraftFromTakeoff(projectId: string, estimateId: string) {
  const est = await db.estimate.findFirst({
    where: { id: estimateId, projectId },
    select: { status: true, lockedAt: true, items: { where: { OR: [{ takeoffRollup: { not: null } }, { takeoffConditionId: { not: null } }] }, select: { id: true }, take: 1 } },
  });
  if (!est || est.status !== "DRAFT" || est.lockedAt || !est.items.length) return null;
  const { syncAutoItems } = await import("./walls");
  await syncAutoItems(projectId);
  return syncTakeoffToEstimate(projectId, estimateId);
}

export type PriceCheck = { unpriced: { name: string; quantity: number; unit: string }[]; changed: { count: number; change: number } };

/**
 * Before a proposal goes out: takeoff items with no price (they'd go in at $0), and
 * Item List prices that moved since a locked job was locked (Price review brings them in).
 */
export async function takeoffPriceCheck(projectId: string): Promise<PriceCheck> {
  const unpriced: PriceCheck["unpriced"] = [];
  let count = 0;
  let change = 0;
  // An unlocked job follows the Item List by itself — only a locked one falls behind it.
  const locked = !!(await db.project.findUnique({ where: { id: projectId }, select: { pricesLockedAt: true } }))?.pricesLockedAt;
  for (const c of await loadConditions(projectId)) {
    const totals = conditionTotals(c);
    for (const l of conditionEstimateLines(c, totals)) if (l.quantity > 0 && !(l.unitCost > 0)) unpriced.push({ name: l.description, quantity: l.quantity, unit: l.unit });
    for (const i of c.items) {
      const list = i.materialItem?.unitCost;
      // An Item List price of $0 isn't a price change — it's unpriced there too.
      if (!locked || i.pricePinned || list === undefined || list === null || !(list > 0) || Math.abs(list - i.unitCost) <= 0.0001) continue;
      const qty = assemblyQuantity(i, totals.metrics, totals.cutList, totals.wall);
      if (qty > 0) {
        count++;
        change += qty * (list - i.unitCost);
      }
    }
  }
  return { unpriced, changed: { count, change: Math.round(change * 100) / 100 } };
}
