import "server-only";
import { db } from "./db";
import type { EstimateItem, EstimateSpec } from "@prisma/client";
import { withLengthSubstitutions } from "./substitutions";
import { parseMarkupTable, tableTaxPct } from "./markup";
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
  framingMembers,
  framingLengths,
  memberThickness,
  shapePath,
  type Pt,
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
  wallNetworks,
  wallTakeoff,
  wasteBoards,
  roundOncePerItem,
  withWasteBoards,
  itemNameKey,
  lumberItemName,
  lumberMetric,
  parseStockLengths,
  DEFAULT_STOCK_LENGTHS,
  type LengthPrices,
  type PackMode,
  type AutoLine,
  type BoardPattern,
  type MetricKey,
  type Metrics,
} from "./takeoff";
import { memberSizes, pickSize, spanSpec } from "./span-tables";

/**
 * Conditions with their measurements (and each measurement's sheet scale) and assembly items,
 * plus, for joists/rafters, the price of each board length (for packing by cost).
 */
export async function loadConditions(projectId: string) {
  const [found, lengthSubs] = await Promise.all([findConditions(projectId), db.jobSubstitution.findMany({ where: { projectId, fromLen: { not: null } } })]);
  // A length substituted on this job ("2x6 × 26'" → 28'): its takeoffs don't use that length.
  const conditions = withLengthSubstitutions(found, lengthSubs);
  return withSizeBands(await withLengthPrices(conditions));
}

/** Joists of a span-table area that need another size, given to that size's takeoff: the sheet they're on and their lengths. */
export type BandExtra = { sheet: Awaited<ReturnType<typeof findConditions>>[number]["measurements"][number]["sheet"]; angle: number; pitch: number | null; lengths: number[] };

/**
 * Joists/rafters on a span table: each joist is ordered at the size its own unsupported span
 * calls for. A joist area sits in the takeoff of its biggest size, but where some of its joists
 * need a smaller (or other) size — a wall holds them up partway — those joists are counted in
 * that size's takeoff of the family instead (one takeoff per size: "Joists 2x8", "Joists 2x10").
 * `bandSplit.own`: a shape's joists that stay (by measurement id); `bandSplit.extra`: joists
 * given to this takeoff by shapes in the others. Shapes you sized yourself stay whole.
 */
function withSizeBands<T extends Awaited<ReturnType<typeof findConditions>>[number]>(conditions: T[]) {
  const families = new Map<string, T[]>();
  for (const c of conditions) if (c.type === "FRAMING" && c.spanTable) families.set(c.sizeGroup ?? c.id, [...(families.get(c.sizeGroup ?? c.id) ?? []), c]);
  const empty = { own: new Map<string, number[]>(), extra: [] as BandExtra[], owners: new Map<string, string[]>() };
  if (!families.size) return conditions.map((c) => ({ ...c, bandSplit: empty }));

  // What holds joists up, sheet by sheet: the walls and beams traced on it.
  const supports = new Map<string, [Pt, Pt][]>();
  for (const c of conditions) {
    if (c.type !== "WALL" && c.type !== "BEAM") continue;
    for (const m of c.measurements) {
      if (m.isDeduction) continue;
      const path = arcPath(parsePoints(m.points), parseArcs(m.points), false);
      const list = supports.get(m.sheetId) ?? [];
      for (let i = 1; i < path.length; i++) list.push([path[i - 1], path[i]]);
      supports.set(m.sheetId, list);
    }
  }

  const own = new Map<string, number[]>();
  const extra = new Map<string, BandExtra[]>();
  // Which takeoff each joist of a split area is ordered under (in layout order) — the plan colors them so.
  const owners = new Map<string, string[]>();
  for (const family of families.values()) {
    const bySize = new Map(family.filter((f) => f.memberSize).map((f) => [itemNameKey(f.memberSize!), f]));
    for (const c of family) {
      const calc = withMemberSize(c, c.memberSizeRef);
      const table = spanSpec(c.spanTable!);
      for (const m of c.measurements) {
        const upf = m.sheet.unitsPerFoot;
        if (!upf || m.isDeduction || m.sizeLocked) continue;
        const shape = { points: parsePoints(m.points), arcs: parseArcs(m.points), isDeduction: false, angle: m.angle, pitch: m.pitch };
        const members = framingMembers(shapePath(c.type, shape), m.angle, (c.spacing / 12) * upf, memberThickness(c.memberSize, upf, c.memberSizeRef?.widthIn));
        const lengths = framingLengths(calc, shape, upf);
        const { sizes } = memberSizes(members, supports.get(m.sheetId) ?? [], (span) => pickSize(table, span / upf, c.spacing).size, (4 / 12) * upf);
        const mine: number[] = [];
        const away = new Map<string, number[]>();
        const whose: string[] = [];
        sizes.forEach((size, i) => {
          const to = size ? bySize.get(itemNameKey(size)) : undefined;
          whose.push(to?.id ?? c.id);
          if (!to || to.id === c.id) mine.push(lengths[i]);
          else away.set(to.id, [...(away.get(to.id) ?? []), lengths[i]]);
        });
        if (!away.size) continue;
        own.set(m.id, mine);
        owners.set(m.id, whose);
        for (const [to, ls] of away) extra.set(to, [...(extra.get(to) ?? []), { sheet: m.sheet, angle: m.angle, pitch: m.pitch, lengths: ls }]);
      }
    }
  }
  return conditions.map((c) => ({ ...c, bandSplit: { own, extra: extra.get(c.id) ?? [], owners } }));
}

/**
 * Each stock-length joist/rafter condition's board prices, by length: this job's price
 * when its line has one, else the bid you took for it (its price list covers lengths the job
 * doesn't use yet), else the Item List's ("2x6 × 20'"). Unpriced lengths are left out.
 */
async function withLengthPrices<T extends Awaited<ReturnType<typeof findConditions>>[number]>(conditions: T[]) {
  const lengthsOf = (c: T) => {
    const stock = parseStockLengths(c.stockLengths) ?? DEFAULT_STOCK_LENGTHS;
    return c.packLength && c.packLength > 0 && !stock.includes(c.packLength) ? [...stock, c.packLength] : stock;
  };
  const priced = conditions.filter((c) => c.type === "FRAMING" && (c.memberSizeRef?.soldAs ?? "STOCK") === "STOCK");
  const keys = new Set(priced.flatMap((c) => lengthsOf(c).map((l) => itemNameKey(lumberItemName(c.memberSize, c.name, l)))));
  const list = keys.size ? await db.materialItem.findMany({ where: { nameKey: { in: Array.from(keys) } }, select: { nameKey: true, unitCost: true } }) : [];
  const listPrice = new Map(list.map((i) => [i.nameKey, i.unitCost]));
  // Prices from the bids taken on this job, by item name.
  const projectId = priced[0]?.projectId;
  const awarded = projectId
    ? await db.bidAward.findMany({
        where: { projectId },
        select: { bid: { select: { lines: { where: { unitPrice: { not: null }, substitute: null }, select: { name: true, unitPrice: true } } } } },
      })
    : [];
  const bidPrice = new Map<string, number>();
  for (const a of awarded) for (const l of a.bid.lines) if (l.unitPrice! > 0 && keys.has(itemNameKey(l.name))) bidPrice.set(itemNameKey(l.name), l.unitPrice!);
  return conditions.map((c) => {
    if (!priced.includes(c)) return { ...c, lengthPrices: null as LengthPrices | null };
    const prices: LengthPrices = {};
    for (const l of lengthsOf(c)) {
      const job = c.items.find((i) => i.metric === lumberMetric(l))?.unitCost ?? 0;
      const k = itemNameKey(lumberItemName(c.memberSize, c.name, l));
      const p = job > 0 ? job : (bidPrice.get(k) ?? listPrice.get(k) ?? 0);
      if (p > 0) prices[l] = p;
    }
    return { ...c, lengthPrices: prices as LengthPrices | null };
  });
}

function findConditions(projectId: string) {
  return db.takeoffCondition.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      costCode: { select: { id: true, code: true, name: true } },
      memberSizeRef: { select: { id: true, name: true, kind: true, widthIn: true, depthIn: true, boardFeet: true, soldAs: true } },
      spanTable: true,
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
  cutList: [number, number][]; // boards to order, waste included: [stock length, count]
  neededList: [number, number][]; // the packed boards before waste
  waste: { length: number; count: number } | null; // joists/rafters: the waste boards in cutList
  pack: { mode: PackMode; noPrices?: boolean; cost: number | null; estimated: number[] } | null; // joists/rafters: how it was packed
  memberCuts: number[]; // joists/rafters: every member's length (ft), for comparing packings
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
      // Span-table joists: only the ones this takeoff's size is for (the rest are in their size's takeoff).
      memberLengths: c.bandSplit?.own.get(m.id) ?? null,
    },
    unitsPerFoot: m.sheet.unitsPerFoot,
    sheet: m.sheet,
  }));
  // …and the joists other areas of the family hand to this size.
  for (const x of c.bandSplit?.extra ?? [])
    shapes.push({
      m: { points: [], arcs: [], isDeduction: false, angle: x.angle, pitch: x.pitch, pitch2: null, height: null, door: null, memberLengths: x.lengths },
      unitsPerFoot: x.sheet.unitsPerFoot,
      sheet: x.sheet,
    });
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
    // Each sheet the same way: its own shapes packed (not a board per member).
    for (const row of bySheet.values()) {
      const packed = framingBoards(
        calc,
        shapes.filter((s) => s.sheet.id === row.sheetId),
      );
      const sheetLf = packed.cutList.reduce((sum, [len, n]) => sum + len * n, 0);
      const sheetBfPerLf = row.metrics.stock_lf > 0 ? row.metrics.board_feet / row.metrics.stock_lf : bfPerLf;
      row.metrics = { ...row.metrics, stock_lf: sheetLf, board_feet: sheetLf * sheetBfPerLf };
    }
  }
  // Walls and openings: materials from the traced lines and the condition's options.
  const wallLines: AutoLine[] = [];
  let unassignedDoors = 0;
  const scaled = c.measurements.filter((m) => m.sheet.unitsPerFoot && !m.isDeduction);
  if (c.type === "WALL") {
    // One measurement per wall (Find walls) or a traced run — walls meeting at corners frame as one.
    const runs = wallNetworks(scaled.map((m) => ({ sheetId: m.sheet.id, points: parsePoints(m.points), arcs: parseArcs(m.points), unitsPerFoot: m.sheet.unitsPerFoot! })));
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
  // What to order: the packed boards plus waste. Joists/rafters: waste % of the feet,
  // as whole boards of the most-used length. Hips & valleys (a board each): each length
  // rounded up, as before. Lineal-foot sizes take waste on their one lf line.
  const needed = lumber?.cutList ?? [];
  const soldAs = c.memberSizeRef?.soldAs ?? "STOCK";
  const waste = c.type === "FRAMING" && soldAs !== "LF" ? wasteBoards(needed, c.wastePct) : null;
  const order: [number, number][] =
    (c.type === "HIP_VALLEY" || c.type === "BEAM") && soldAs !== "LF"
      ? needed.map(([len, n]) => [len, Math.ceil(withWaste(n, c.wastePct) - 1e-9)])
      : withWasteBoards(needed, waste);
  const quantity = metrics[c.metric as MetricKey] ?? 0;
  const orderLf = order.reduce((sum, [len, n]) => sum + len * n, 0);
  const neededLf = needed.reduce((sum, [len, n]) => sum + len * n, 0);
  // Ordered lumber "with waste" is what you actually order.
  const quantityWithWaste =
    isMemberType(c.type) && soldAs !== "LF" && neededLf > 0 && (c.metric === "stock_lf" || c.metric === "board_feet")
      ? quantity * (orderLf / neededLf)
      : withWaste(quantity, c.wastePct);
  return {
    metrics,
    quantity,
    quantityWithWaste,
    unit: metricUnit(c.metric),
    bySheet: Array.from(bySheet.values()),
    cutList: order,
    neededList: needed,
    waste,
    pack:
      lumber && c.type === "FRAMING" ? { mode: lumber.mode, noPrices: "noPrices" in lumber ? lumber.noPrices : undefined, cost: lumber.cost, estimated: lumber.estimated } : null,
    memberCuts: c.type === "FRAMING" ? (lumber?.lengths ?? []) : [],
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
  /** Items bought in whole units: which item it is (so takeoffs sharing it round up once) and the exact amount. */
  roundKey?: string;
  raw?: number;
};

/** Every takeoff's estimate lines for the job, items shared by several takeoffs rounded up once. */
export function jobEstimateLines(conditions: LoadedCondition[]) {
  return roundOncePerItem(conditions.flatMap((c) => conditionEstimateLines(c, conditionTotals(c))));
}

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
    ...(i.roundUp
      ? {
          roundKey: `${i.materialItemId ?? `name:${itemNameKey(i.description)}`}|${i.unit}`,
          raw: assemblyQuantity({ ...i, roundUp: false }, totals.metrics, totals.cutList, totals.wall),
        }
      : {}),
  }));
}

export type TakeoffDetailRow = { description: string; quantity: number; unit: string; unitCost: number };

/** The takeoff items behind each takeoff total on the estimate, by its key ("code:<id>"): only that cost code's items. */
export async function takeoffDetail(projectId: string) {
  const out: Record<string, TakeoffDetailRow[]> = {};
  for (const l of jobEstimateLines(await loadConditions(projectId))) {
    if (!(l.quantity > 0)) continue;
    const key = l.costCodeId ? `code:${l.costCodeId}` : `group:${l.group.trim().toLowerCase()}`;
    (out[key] ??= []).push({ description: l.description, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost });
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
 *
 * `quiet`: a brand-new estimate filling in — no "what changed" note (there's no bid to compare with).
 */
export async function syncTakeoffToEstimate(projectId: string, estimateId: string, opts: { quiet?: boolean } = {}) {
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
  // Items shared by several takeoffs are rounded up once (jobEstimateLines).
  const lines = jobEstimateLines(conditions).filter((l) => l.quantity > 0);
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
  // Lines you stopped updating: the takeoff leaves their cost codes alone on this estimate.
  const stopped = new Set(est.items.flatMap((i) => (i.takeoffStopped ? [i.takeoffStopped] : [])));
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
              .filter((i) => i.costCodeId === codeId && i.specId && !i.takeoffConditionId && !i.takeoffRollup && !i.takeoffStopped && !taken.has(i.id))
              .sort((a, b) => a.sortOrder - b.sortOrder)[0]
          : undefined;
      const fill = { quantity: 1, unit: "ls", qtyFormula: null, costFormula: null };

      for (const r of rollups) {
        if (stopped.has(r.key)) continue;
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
              // Taxed when the estimate's tax rows cover its cost type.
              taxPct: tableTaxPct(parseMarkupTable(est.markupTable, est.defaultMarkup), guessCostType(r.name)),
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
      if (changes.length && !opts.quiet) {
        const merged = mergeNote(parseAutoNote(est.autoNote), changes, new Date());
        // The first change since the last save keeps a copy of the estimate as it was saved,
        // so "Put back what I bid" can restore it exactly.
        const base = merged ? (est.autoNote ? est.autoBase : estimateBase(est)) : null;
        // Written without touching the estimate's "updated" time: the open sheet is keyed on it,
        // and a new key would throw away edits you haven't saved yet.
        const json = merged ? JSON.stringify(merged) : null;
        await tx.$executeRaw`UPDATE "Estimate" SET "autoNote" = ${json}, "autoBase" = ${base} WHERE "id" = ${est.id}`;
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
  if (!est || est.status !== "DRAFT" || est.lockedAt) return null;
  // A draft without the takeoff on it yet picks it up too — once the job has a takeoff.
  if (!est.items.length && !(await db.takeoffCondition.count({ where: { projectId } }))) return null;
  const { syncAutoItems } = await import("./walls");
  await syncAutoItems(projectId);
  return syncTakeoffToEstimate(projectId, estimateId);
}

/** A new draft estimate starts with the job's takeoff on it (nothing to compare with yet, so no note). */
export async function fillFromTakeoff(projectId: string, estimateId: string) {
  if (!(await db.takeoffCondition.count({ where: { projectId } }))) return null;
  const { syncAutoItems } = await import("./walls");
  await syncAutoItems(projectId);
  return syncTakeoffToEstimate(projectId, estimateId, { quiet: true });
}

// --- "Put back what I bid" ---------------------------------------------------------------

type EstimateRows = { items: EstimateItem[]; specs: EstimateSpec[] };

/** The estimate's lines and spec items as saved — kept when the takeoff first changes them. */
function estimateBase(est: EstimateRows) {
  return JSON.stringify({ items: est.items, specs: est.specs });
}

function parseBase(json: string | null | undefined): EstimateRows | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as EstimateRows;
    return v && Array.isArray(v.items) && Array.isArray(v.specs) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Locks a draft after the takeoff changed it. Put back (`keep` false): the estimate goes
 * back exactly to how it was last saved (quantities, prices, lines the takeoff added or
 * removed) first, so a bid you already gave doesn't move. Keep: the changes stay.
 */
export async function lockAfterAutoChanges(projectId: string, estimateId: string, keep: boolean) {
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, include: { items: { select: { id: true } }, specs: { select: { id: true } } } });
  if (!est) throw new Error("Estimate not found");
  if (est.status !== "DRAFT") throw new Error("Only a draft estimate changes by itself");
  const base = keep ? null : parseBase(est.autoBase);
  if (!keep && !base) throw new Error("There's no saved copy to put back — these changes came in before this option existed.");

  await db.$transaction(
    async (tx) => {
      if (base) {
        // Things deleted since (an Item List item, a takeoff, a cost code): the line keeps everything else.
        const ids = (vals: (string | null)[]) => Array.from(new Set(vals.filter((v): v is string => !!v)));
        const has = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
        const [codes, mats, conds, tItems, sels] = await Promise.all([
          tx.costCode.findMany({ where: { id: { in: ids(base.items.map((i) => i.costCodeId)) } }, select: { id: true } }).then(has),
          tx.materialItem.findMany({ where: { id: { in: ids(base.items.map((i) => i.materialItemId)) } }, select: { id: true } }).then(has),
          tx.takeoffCondition.findMany({ where: { id: { in: ids(base.items.map((i) => i.takeoffConditionId)) } }, select: { id: true } }).then(has),
          tx.takeoffAssemblyItem.findMany({ where: { id: { in: ids(base.items.map((i) => i.takeoffItemId)) } }, select: { id: true } }).then(has),
          tx.selection.findMany({ where: { id: { in: ids(base.specs.map((s) => s.selectionId)) } }, select: { id: true } }).then(has),
        ]);
        const ok = (set: Set<string>, id: string | null) => (id && set.has(id) ? id : null);
        const specIds = new Set(base.specs.map((s) => s.id));
        const itemIds = new Set(base.items.map((i) => i.id));

        for (const { id, ...s } of base.specs) {
          const data = {
            ...s,
            estimateId,
            requestedBy: s.requestedBy ? new Date(s.requestedBy) : null,
            createdAt: new Date(s.createdAt),
            selectionId: ok(sels, s.selectionId),
          };
          await tx.estimateSpec.upsert({ where: { id }, update: data, create: { ...data, id } });
        }
        const goneItems = est.items.filter((i) => !itemIds.has(i.id)).map((i) => i.id);
        if (goneItems.length) await tx.estimateItem.deleteMany({ where: { id: { in: goneItems } } });
        for (const { id, ...i } of base.items) {
          const data = {
            ...i,
            estimateId,
            specId: i.specId && specIds.has(i.specId) ? i.specId : null,
            costCodeId: ok(codes, i.costCodeId),
            materialItemId: ok(mats, i.materialItemId),
            takeoffConditionId: ok(conds, i.takeoffConditionId),
            takeoffItemId: ok(tItems, i.takeoffItemId),
          };
          await tx.estimateItem.upsert({ where: { id }, update: data, create: { ...data, id } });
        }
        const goneSpecs = est.specs.filter((s) => !specIds.has(s.id)).map((s) => s.id);
        if (goneSpecs.length) await tx.estimateSpec.deleteMany({ where: { id: { in: goneSpecs } } });
      }
      // A normal update (new "updated" time): the sheet reloads with what's saved now.
      await tx.estimate.update({ where: { id: estimateId }, data: { lockedAt: est.lockedAt ?? new Date(), autoNote: null, autoBase: null } });
    },
    { timeout: 60000 },
  );
  return { estimate: est, restored: !!base };
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
