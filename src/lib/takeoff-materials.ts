import "server-only";
import { conditionTotals, loadConditions, type LoadedCondition } from "./takeoff-data";
import {
  LUMBER_METRIC_PREFIX,
  METRICS,
  assemblyBase,
  compareMaterialNames,
  lineWastePct,
  packLabel,
  isMemberType,
  itemNameKey,
  type BoardPattern,
  type MetricKey,
} from "./takeoff";
import { syncAutoItems } from "./walls";

export type MaterialLine = {
  key: string;
  name: string;
  category: string;
  sku: string | null;
  vendor: string | null;
  quantity: number;
  unit: string;
  unitCost: number; // average when the same item carries different job prices
  extended: number;
  usedIn: string[];
  pieces: number | null; // made-to-order members listed in lf: how many pieces that is
  /** The Item List item behind it (its price can be changed from the Material list), or null. */
  materialItemId: string | null;
  /** Kept at "this job only". */
  pinned: boolean;
  /** Its cost code (bids are asked for by cost code): the id or "none", and "06-100 Framing". */
  codeKey: string;
  codeLabel: string;
};

/** "06-100 Framing" — or "No cost code". */
export function codeLabelOf(code: { code: string | null; name: string } | null | undefined) {
  return code ? [code.code, code.name].filter(Boolean).join(" ") : "No cost code";
}

export type CutList = {
  condition: string;
  size: string | null;
  pieces: [number, number][];
  exact: boolean;
  boards: BoardPattern[];
  /** How the boards were packed ("Least waste", "Cheapest", "One length: 26'"). */
  method: string | null;
  /** Joists/rafters: the waste, as extra boards on top of `boards`. */
  waste: { length: number; count: number; pct: number } | null;
};

type Acc = Omit<MaterialLine, "quantity" | "unitCost" | "extended" | "usedIn" | "pieces" | "pinned"> & {
  pinned: boolean;
  raw: number;
  cost: number;
  roundUp: boolean;
  usedIn: Set<string>;
  pieces: number | null;
};

/**
 * Everything the takeoff calls for, combined across conditions:
 * - assembly items, summed by Item List entry (or by name + unit when unlinked),
 *   with waste applied and rounded up once on the total;
 * - framing conditions without assembly items, as stock-length lumber pieces;
 * - other conditions without assembly items, as their own line.
 * Costs are job costs (no markup). `planId` limits it to one plan set.
 */
export async function buildMaterialList(projectId: string, planId?: string | null) {
  await syncAutoItems(projectId);
  return materialListFrom(await loadConditions(projectId), planId);
}

/** The Material List from conditions already loaded (their auto lines in step). */
export function materialListFrom(conditions: LoadedCondition[], planId?: string | null) {
  const acc = new Map<string, Acc>();
  const cutLists: CutList[] = [];

  const add = (
    key: string,
    base: Omit<Acc, "raw" | "cost" | "roundUp" | "usedIn" | "key" | "pieces" | "pinned" | "materialItemId"> & { materialItemId?: string | null; pinned?: boolean },
    raw: number,
    cost: number,
    roundUp: boolean,
    usedIn: string,
    pieces: number | null = null,
  ) => {
    if (!(raw > 0)) return;
    const row = acc.get(key) ?? {
      key,
      ...base,
      materialItemId: base.materialItemId ?? null,
      pinned: false,
      raw: 0,
      cost: 0,
      roundUp: false,
      usedIn: new Set<string>(),
      pieces: null,
    };
    if (base.pinned) row.pinned = true;
    row.raw += raw;
    if (pieces !== null) row.pieces = (row.pieces ?? 0) + pieces;
    row.cost += cost;
    row.roundUp ||= roundUp;
    row.usedIn.add(usedIn);
    acc.set(key, row);
  };

  for (const c of conditions) {
    if (c.referenceOnly) continue;
    const measurements = planId ? c.measurements.filter((m) => m.sheet.plan.id === planId) : c.measurements;
    // Span-table joists handed to this size by other areas (on this plan).
    const extra = (c.bandSplit?.extra ?? []).filter((x) => !planId || x.sheet.plan.id === planId);
    if (measurements.length === 0 && extra.length === 0) continue;
    const totals = conditionTotals({ ...c, measurements, bandSplit: c.bandSplit ? { ...c.bandSplit, extra } : c.bandSplit });

    if (c.items.length > 0) {
      for (const i of c.items) {
        const base = assemblyBase(i, totals.metrics, totals.cutList, totals.wall);
        const raw = ((base * i.qty) / (i.per > 0 ? i.per : 1)) * (1 + lineWastePct(i) / 100);
        // Made-to-order members share one Item List entry (priced per lf) but are listed per exact length.
        const exactLength = i.metric.startsWith(LUMBER_METRIC_PREFIX) && i.unit === "lf";
        const key = exactLength ? `${i.materialItemId}|${i.metric}` : (i.materialItemId ?? `name:${itemNameKey(i.description)}|${i.unit}`);
        add(
          key,
          {
            name: exactLength ? i.description : (i.materialItem?.name ?? i.description),
            category: i.materialItem?.category ?? i.costCode?.division ?? "Uncategorized",
            sku: i.materialItem?.sku ?? null,
            vendor: i.materialItem?.vendor ?? null,
            unit: i.unit,
            materialItemId: i.materialItemId,
            pinned: i.pricePinned,
            codeKey: i.costCodeId ?? "none",
            codeLabel: codeLabelOf(i.costCode),
          },
          raw,
          raw * i.unitCost,
          i.roundUp,
          c.name,
          exactLength ? Math.ceil(base * (1 + lineWastePct(i) / 100) - 1e-9) : null,
        );
      }
      if (isMemberType(c.type) && totals.cutList.length)
        cutLists.push({
          condition: c.name,
          size: c.memberSize,
          pieces: totals.cutList,
          exact: c.memberSizeRef?.soldAs === "EXACT_LF",
          boards: totals.boards,
          method: totals.pack && totals.boards.length ? packLabel(totals.pack, c.packLength) : null,
          waste: totals.waste ? { ...totals.waste, pct: c.wastePct } : null,
        });
      continue;
    }

    if (c.type === "FRAMING") {
      // Price the lumber like the estimate does (condition quantity × unit cost), spread over the pieces by length.
      const total = totals.quantityWithWaste * c.unitCost;
      const lf = totals.cutList.reduce((s, [len, n]) => s + len * n, 0);
      for (const [len, n] of totals.cutList) {
        const size = c.memberSize?.trim() || null;
        add(
          `lumber:${(size ?? c.name).toLowerCase()}:${len}`,
          {
            name: `${size ?? c.name} × ${len}'`,
            category: "Framing lumber",
            sku: null,
            vendor: null,
            unit: "ea",
            codeKey: c.costCodeId ?? "none",
            codeLabel: codeLabelOf(c.costCode),
          },
          n,
          lf > 0 ? (total * len * n) / lf : 0,
          false,
          c.name,
        );
      }
      continue;
    }

    add(
      `condition:${c.id}`,
      {
        name: c.name,
        category: "Takeoffs",
        sku: null,
        vendor: null,
        unit: METRICS[c.metric as MetricKey]?.unit ?? totals.unit,
        codeKey: c.costCodeId ?? "none",
        codeLabel: codeLabelOf(c.costCode),
      },
      totals.quantityWithWaste,
      totals.quantityWithWaste * c.unitCost,
      false,
      c.name,
    );
  }

  const lines: MaterialLine[] = Array.from(acc.values()).map((r) => {
    const quantity = r.roundUp ? Math.ceil(r.raw - 1e-9) : Math.round(r.raw * 100) / 100;
    const extended = r.raw > 0 ? r.cost * (quantity / r.raw) : 0;
    return {
      key: r.key,
      name: r.name,
      category: r.category,
      sku: r.sku,
      vendor: r.vendor,
      quantity,
      unit: r.unit,
      unitCost: quantity > 0 ? extended / quantity : 0,
      extended,
      usedIn: Array.from(r.usedIn),
      pieces: r.pieces,
      materialItemId: r.materialItemId,
      pinned: r.pinned,
      codeKey: r.codeKey,
      codeLabel: r.codeLabel,
    };
  });
  // One heading per category whatever its capitalization ("Framing lumber" / "Framing Lumber").
  const heading = new Map<string, string>();
  for (const l of lines) {
    const k = l.category.trim().toLowerCase();
    if (!heading.has(k) || /[A-Z]/.test(l.category.split(" ").slice(1).join(" "))) heading.set(k, l.category.trim());
  }
  for (const l of lines) l.category = heading.get(l.category.trim().toLowerCase()) ?? l.category;
  lines.sort((a, b) => a.category.localeCompare(b.category) || compareMaterialNames(a.name, b.name));
  return { lines, cutLists, total: lines.reduce((s, l) => s + l.extended, 0) };
}
