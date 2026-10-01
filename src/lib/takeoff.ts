/**
 * Takeoff math, shared by the server (totals, send-to-estimate) and the browser
 * (live totals while drawing). Shapes are stored in page units; a sheet's
 * `unitsPerFoot` converts them to feet.
 */

export type Pt = [number, number];

export const CONDITION_TYPES = ["AREA", "LINEAR", "COUNT", "FRAMING"] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  AREA: "Area",
  LINEAR: "Linear",
  COUNT: "Count",
  FRAMING: "Joists / Rafters",
};

export const PITCH_MODES = ["COMMON", "HIP"] as const;

export const CONDITION_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#ea580c", "#475569"] as const;

/** Every quantity a condition can report. The condition's `metric` picks its main one. */
export const METRICS = {
  area: { label: "Area", unit: "sf" },
  plan_area: { label: "Plan area (flat)", unit: "sf" },
  area_sy: { label: "Area", unit: "sy" },
  squares: { label: "Roofing squares", unit: "sq" },
  perimeter: { label: "Perimeter", unit: "lf" },
  volume: { label: "Volume (area × depth)", unit: "cy" },
  length: { label: "Length", unit: "lf" },
  plan_length: { label: "Plan length (flat)", unit: "lf" },
  wall_area: { label: "Wall area (length × height)", unit: "sf" },
  count: { label: "Count", unit: "ea" },
  members: { label: "Members", unit: "ea" },
  member_lf: { label: "Member length", unit: "lf" },
  stock_lf: { label: "Stock length (ordered)", unit: "lf" },
  board_feet: { label: "Board feet (ordered)", unit: "bf" },
} as const;
export type MetricKey = keyof typeof METRICS;

export const METRICS_BY_TYPE: Record<ConditionType, MetricKey[]> = {
  AREA: ["area", "plan_area", "area_sy", "squares", "perimeter", "volume"],
  LINEAR: ["length", "plan_length", "wall_area"],
  COUNT: ["count"],
  FRAMING: ["members", "member_lf", "stock_lf", "board_feet", "area", "plan_area"],
};

export const DEFAULT_METRIC: Record<ConditionType, MetricKey> = {
  AREA: "area",
  LINEAR: "length",
  COUNT: "count",
  FRAMING: "members",
};

export function metricLabel(key: string) {
  if (key === LUMBER_LF_METRIC) return "Member length (lf)";
  if (isLumberMetric(key)) return `${key.slice(LUMBER_METRIC_PREFIX.length)}' pieces (ea)`;
  const m = METRICS[key as MetricKey];
  return m ? `${m.label} (${m.unit})` : key;
}

export function metricUnit(key: string) {
  if (key === LUMBER_LF_METRIC) return "lf";
  if (isLumberMetric(key)) return "ea";
  return METRICS[key as MetricKey]?.unit ?? "ea";
}

export function isMetricFor(type: string, metric: string) {
  return (METRICS_BY_TYPE[type as ConditionType] ?? []).includes(metric as MetricKey);
}

/** Architectural and engineering scales: paper inches per real foot. PDF pages are 72 units per inch. */
export const PRESET_SCALES: { label: string; paperInchesPerFoot: number }[] = [
  { label: '1/16" = 1\'-0"', paperInchesPerFoot: 1 / 16 },
  { label: '3/32" = 1\'-0"', paperInchesPerFoot: 3 / 32 },
  { label: '1/8" = 1\'-0"', paperInchesPerFoot: 1 / 8 },
  { label: '3/16" = 1\'-0"', paperInchesPerFoot: 3 / 16 },
  { label: '1/4" = 1\'-0"', paperInchesPerFoot: 1 / 4 },
  { label: '3/8" = 1\'-0"', paperInchesPerFoot: 3 / 8 },
  { label: '1/2" = 1\'-0"', paperInchesPerFoot: 1 / 2 },
  { label: '3/4" = 1\'-0"', paperInchesPerFoot: 3 / 4 },
  { label: '1" = 1\'-0"', paperInchesPerFoot: 1 },
  { label: '1-1/2" = 1\'-0"', paperInchesPerFoot: 1.5 },
  { label: '1" = 10\'', paperInchesPerFoot: 1 / 10 },
  { label: '1" = 20\'', paperInchesPerFoot: 1 / 20 },
  { label: '1" = 30\'', paperInchesPerFoot: 1 / 30 },
  { label: '1" = 40\'', paperInchesPerFoot: 1 / 40 },
  { label: '1" = 50\'', paperInchesPerFoot: 1 / 50 },
  { label: '1" = 60\'', paperInchesPerFoot: 1 / 60 },
  { label: '1" = 100\'', paperInchesPerFoot: 1 / 100 },
];

export const PDF_UNITS_PER_INCH = 72;

// --- Geometry ----------------------------------------------------------------

export function dist(a: Pt, b: Pt) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function polylineLength(pts: Pt[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

export function polygonPerimeter(pts: Pt[]) {
  return pts.length < 2 ? 0 : polylineLength(pts) + dist(pts[pts.length - 1], pts[0]);
}

/** Shoelace area (always positive). */
export function polygonArea(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function centroid(pts: Pt[]): Pt {
  if (pts.length === 0) return [0, 0];
  const sx = pts.reduce((s, p) => s + p[0], 0);
  const sy = pts.reduce((s, p) => s + p[1], 0);
  return [sx / pts.length, sy / pts.length];
}

/** Direction of a polygon's first edge — framing members run parallel to it by default. */
export function firstEdgeAngle(pts: Pt[]) {
  if (pts.length < 2) return 0;
  return Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
}

/**
 * Lays framing members across a polygon at `spacing` (page units) on center,
 * running in direction `angle`. Members start at one edge and the last one sits
 * on the far edge. Each member is clipped to the polygon (a concave shape can
 * split a member into pieces — each piece is its own member).
 *
 * Lengths are taken where the member is longest within its own width
 * (`thickness`, page units) — the long point a framer cuts to. The two end
 * members sit against walls, so they take the longest cut within half a space
 * inside the wall; that keeps an outline drawn slightly out of square from
 * producing a sliver "member" at the very edge.
 */
export function framingMembers(pts: Pt[], angle: number, spacing: number, thickness = 0): [Pt, Pt][] {
  if (pts.length < 3 || !(spacing > 0)) return [];
  const d: Pt = [Math.cos(angle), Math.sin(angle)];
  const n: Pt = [-d[1], d[0]];
  const along = (p: Pt) => p[0] * d[0] + p[1] * d[1];
  const across = (p: Pt) => p[0] * n[0] + p[1] * n[1];
  const offsets = pts.map(across);
  const min = Math.min(...offsets);
  const max = Math.max(...offsets);
  const span = max - min;
  if (span <= 0) return [];
  const eps = Math.min(spacing, span) * 1e-4;

  const positions: number[] = [];
  const steps = Math.floor(span / spacing + 1e-9);
  for (let k = 0; k <= steps; k++) positions.push(min + k * spacing);
  if (span - steps * spacing > spacing * 0.05) positions.push(max);

  /** Pieces of the polygon cut along the member line at offset t. */
  const chordsAt = (t: number): [Pt, Pt][] => {
    const hits: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const oa = across(a) - t;
      const ob = across(b) - t;
      if ((oa < 0 && ob >= 0) || (oa >= 0 && ob < 0)) {
        const f = oa / (oa - ob);
        hits.push(along(a) + f * (along(b) - along(a)));
      }
    }
    hits.sort((x, y) => x - y);
    const out: [Pt, Pt][] = [];
    for (let i = 0; i + 1 < hits.length; i += 2) {
      if (hits[i + 1] - hits[i] <= eps) continue;
      const p = (s: number): Pt => [d[0] * s + n[0] * t, d[1] * s + n[1] * t];
      out.push([p(hits[i]), p(hits[i + 1])]);
    }
    return out;
  };
  const total = (c: [Pt, Pt][]) => c.reduce((s, [a, b]) => s + dist(a, b), 0);

  const out: [Pt, Pt][] = [];
  positions.forEach((t, k) => {
    const first = k === 0;
    const last = k === positions.length - 1;
    const half = Math.min(spacing / 2, span / 2);
    // The band this member's length is measured over.
    let lo = Math.max(min, t - thickness / 2);
    let hi = Math.min(max, t + thickness / 2);
    if (first) [lo, hi] = [min, min + half];
    else if (last) [lo, hi] = [max - half, max];
    lo = Math.min(lo + eps, max - eps);
    hi = Math.max(hi - eps, min + eps);
    // Cut length changes linearly between corners, so the longest cut is at a band end or a corner.
    const samples = [first ? lo : last ? hi : Math.min(Math.max(t, lo), hi), lo, hi, ...offsets.filter((o) => o > lo && o < hi)];
    let best: [Pt, Pt][] = [];
    for (const s of samples) {
      const c = chordsAt(s);
      if (total(c) > total(best) + eps) best = c;
    }
    out.push(...best);
  });
  return out;
}

/**
 * Actual member thickness in page units. Whole-number sizes are nominal lumber
 * (2x → 1-1/2", 4x → 3-1/2"); fractional ones (LVL 1-3/4) are already actual.
 * 1-1/2" when no size is set.
 */
export function memberThickness(memberSize: string | null | undefined, unitsPerFoot: number, actualWidthIn?: number | null) {
  if (actualWidthIn && actualWidthIn > 0) return (actualWidthIn / 12) * unitsPerFoot;
  const t = parseMemberSize(memberSize)?.t;
  const inches = !t ? 1.5 : Number.isInteger(t) ? Math.max(t - 0.5, 0.5) : t;
  return (inches / 12) * unitsPerFoot;
}

// --- Pitch -------------------------------------------------------------------

/** Multiplier from plan (flat) length/area to true sloped length/area for a common pitch. */
export function slopeFactor(pitch: number) {
  return Math.sqrt(1 + (pitch / 12) ** 2);
}

/** Multiplier from the plan length of a hip/valley line to its true length. */
export function hipFactor(pitch: number) {
  const run = Math.SQRT2 * 12; // a hip covers 16.97" of plan run per 12" of common run
  return Math.sqrt(run ** 2 + pitch ** 2) / run;
}

/** Lumber is sold in 2' increments — round a member up to the next even length (8' minimum). */
export function stockLength(feet: number) {
  if (feet <= 0) return 0;
  return Math.max(8, Math.ceil(feet / 2 - 1e-9) * 2);
}

/** "8, 10, 12-16" style list of stock lengths in feet → sorted lengths, or null for the default. */
export function parseStockLengths(text: string | null | undefined): number[] | null {
  if (!text) return null;
  const out = new Set<number>();
  for (const part of text.split(/[,\s;]+/)) {
    const range = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(part);
    if (range) {
      // "8-24" means every even length in between, like the lumber yard.
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      for (let l = a; l <= b + 1e-9; l += 2) out.add(Math.round(l * 100) / 100);
    } else if (part && Number(part) > 0) {
      out.add(Number(part));
    }
  }
  return out.size ? Array.from(out).sort((x, y) => x - y) : null;
}

/**
 * Stock pieces needed for one member: the shortest stock length that fits, or
 * — when a member is longer than the longest stock — full-length pieces plus one
 * for the remainder (spliced over a bearing).
 */
export function stockPieces(feet: number, stock: number[] | null, soldAs?: string | null): number[] {
  if (feet <= 0) return [];
  // Made-to-order members are listed at their exact length, to the next inch.
  if (soldAs === "EXACT_LF") return [Math.ceil(feet * 12 - 1e-6) / 12];
  if (soldAs === "LF") return [feet];
  if (!stock?.length) return [stockLength(feet)];
  const max = stock[stock.length - 1];
  const pieces: number[] = [];
  let left = feet;
  while (left > max + 1e-9) {
    pieces.push(max);
    left -= max;
  }
  pieces.push(stock.find((l) => l >= left - 1e-9) ?? max);
  return pieces;
}

/** "1-3/4" → 1.75, "11 7/8" → 11.875, "3.5" → 3.5 */
function parseInches(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)(?:[-\s]+(\d+)\/(\d+))?$|^(\d+)\/(\d+)$/.exec(text.trim());
  if (!m) return null;
  if (m[4]) return Number(m[4]) / Number(m[5]);
  return Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}

/** Thickness × width in inches from a size like "2x8", "LVL 1-3/4x11-7/8" or "2 x 10". */
export function parseMemberSize(size: string | null | undefined): { t: number; w: number } | null {
  if (!size) return null;
  const m = /([\d.\-\/ ]*\d)\s*[x×]\s*(\d[\d.\-\/ ]*)/i.exec(size);
  if (!m) return null;
  const t = parseInches(m[1].trim());
  const w = parseInches(m[2].trim());
  return t && w ? { t, w } : null;
}

export const MEMBER_SIZES = ["2x4", "2x6", "2x8", "2x10", "2x12", "4x10", "4x12", "LVL 1-3/4x9-1/4", "LVL 1-3/4x11-7/8", "LVL 1-3/4x14"] as const;

// --- Quantities ----------------------------------------------------------------

export type ConditionCalc = {
  type: string;
  pitch: number;
  pitchMode: string;
  height: number; // ft
  depth: number; // in
  spacing: number; // in
  overhang: number; // in
  memberSize?: string | null;
  stockLengths?: string | null;
  // From the Member sizes library, when the condition uses one of its sizes.
  memberWidthIn?: number | null; // actual thickness
  boardFeetPerLf?: number | null; // 0 = no board feet (I-joists, trusses)
  soldAs?: string | null; // STOCK | EXACT_LF | LF
};

export const SOLD_AS = ["STOCK", "EXACT_LF", "LF"] as const;
export const SOLD_AS_LABELS: Record<(typeof SOLD_AS)[number], string> = {
  STOCK: "Stock lengths — pieces rounded up, priced each",
  EXACT_LF: "Exact length — made to order, priced per lf",
  LF: "Lineal feet — one lf total, priced per lf",
};
export const MEMBER_KINDS = ["DIMENSIONAL", "I_JOIST", "OPEN_WEB", "ENGINEERED", "OTHER"] as const;
export const MEMBER_KIND_LABELS: Record<(typeof MEMBER_KINDS)[number], string> = {
  DIMENSIONAL: "Dimensional lumber",
  I_JOIST: "I-joist",
  OPEN_WEB: "Open-web / floor truss",
  ENGINEERED: "LVL / engineered",
  OTHER: "Other",
};

/** Board feet per lineal foot for a member size: nominal size for dimensional lumber, actual for engineered. */
export function boardFeetPerLf(size: { name: string; kind: string; widthIn: number; depthIn: number; boardFeet: boolean }) {
  if (!size.boardFeet) return 0;
  const nominal = size.kind === "DIMENSIONAL" ? parseMemberSize(size.name) : null;
  return nominal ? (nominal.t * nominal.w) / 12 : (size.widthIn * size.depthIn) / 12;
}

/** Adds a Member sizes library entry's properties to a condition's calc fields. */
export function withMemberSize<T extends ConditionCalc>(
  c: T,
  ref: { name: string; kind: string; widthIn: number; depthIn: number; boardFeet: boolean; soldAs: string } | null | undefined,
): T {
  if (!ref) return c;
  return { ...c, memberWidthIn: ref.widthIn, boardFeetPerLf: boardFeetPerLf(ref), soldAs: ref.soldAs };
}

export type MeasurementShape = { points: Pt[]; isDeduction: boolean; angle: number };

export type Metrics = Record<MetricKey, number>;

export function emptyMetrics(): Metrics {
  return Object.fromEntries(Object.keys(METRICS).map((k) => [k, 0])) as Metrics;
}

export function addMetrics(a: Metrics, b: Metrics): Metrics {
  const out = emptyMetrics();
  for (const k of Object.keys(out) as MetricKey[]) out[k] = a[k] + b[k];
  return out;
}

/** Framing members for one shape, in feet, with pitch and overhang applied. */
export function framingLengths(c: ConditionCalc, m: MeasurementShape, unitsPerFoot: number) {
  const members = framingMembers(m.points, m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn));
  const factor = slopeFactor(c.pitch);
  return members.map(([a, b]) => (dist(a, b) / unitsPerFoot + c.overhang / 12) * factor);
}

/**
 * Quantities for one measurement. Deductions count negative. Sheets without a
 * scale only yield counts.
 */
export function measurementMetrics(c: ConditionCalc, m: MeasurementShape, unitsPerFoot: number | null): Metrics {
  const out = emptyMetrics();
  const sign = m.isDeduction ? -1 : 1;
  if (c.type === "COUNT") {
    out.count = sign * Math.max(1, m.points.length);
    return out;
  }
  if (!unitsPerFoot || unitsPerFoot <= 0) return out;
  const sqft = unitsPerFoot * unitsPerFoot;

  if (c.type === "LINEAR") {
    const plan = polylineLength(m.points) / unitsPerFoot;
    const factor = c.pitchMode === "HIP" ? hipFactor(c.pitch) : slopeFactor(c.pitch);
    out.plan_length = sign * plan;
    out.length = sign * plan * factor;
    out.wall_area = sign * plan * c.height;
    return out;
  }

  const plan = polygonArea(m.points) / sqft;
  const area = plan * slopeFactor(c.pitch);
  out.plan_area = sign * plan;
  out.area = sign * area;

  if (c.type === "AREA") {
    out.area_sy = (sign * area) / 9;
    out.squares = (sign * area) / 100;
    out.perimeter = sign * (polygonPerimeter(m.points) / unitsPerFoot);
    out.volume = (sign * (area * (c.depth / 12))) / 27;
    return out;
  }

  if (c.type === "FRAMING" && !m.isDeduction) {
    const lengths = framingLengths(c, m, unitsPerFoot);
    const stock = parseStockLengths(c.stockLengths);
    const size = parseMemberSize(c.memberSize);
    const bfPerLf = c.boardFeetPerLf ?? (size ? (size.t * size.w) / 12 : 0);
    out.members = lengths.length;
    out.member_lf = lengths.reduce((s, l) => s + l, 0);
    out.stock_lf = lengths.reduce((s, l) => s + stockPieces(l, stock, c.soldAs).reduce((a, b) => a + b, 0), 0);
    out.board_feet = out.stock_lf * bfPerLf;
  }
  return out;
}

/** Cut list for framing: piece count by stock length, e.g. [[14, 22], [16, 3]]. */
export function framingCutList(c: ConditionCalc, shapes: { m: MeasurementShape; unitsPerFoot: number | null }[]) {
  const list = new Map<number, number>();
  const stock = parseStockLengths(c.stockLengths);
  for (const { m, unitsPerFoot } of shapes) {
    if (!unitsPerFoot || m.isDeduction) continue;
    for (const l of framingLengths(c, m, unitsPerFoot)) {
      for (const s of stockPieces(l, stock, c.soldAs)) {
        const key = Math.round(s * 10000) / 10000;
        list.set(key, (list.get(key) ?? 0) + 1);
      }
    }
  }
  return Array.from(list.entries()).sort((a, b) => a[0] - b[0]);
}

/** Condition quantity with waste. */
export function withWaste(value: number, wastePct: number) {
  return value * (1 + wastePct / 100);
}

// --- Framing lumber as assembly items --------------------------------------------
// A joist/rafter condition's members become assembly items automatically, one per
// stock length, with the metric "pieces:<feet>" (how many pieces of that length).

export const LUMBER_METRIC_PREFIX = "pieces:";
/** Lumber sold by the lineal foot in one total (I-joists bought by the foot). */
export const LUMBER_LF_METRIC = "lumber:lf";

export function isLumberMetric(metric: string) {
  return metric.startsWith(LUMBER_METRIC_PREFIX) || metric === LUMBER_LF_METRIC;
}

export function lumberMetric(lengthFt: number) {
  return `${LUMBER_METRIC_PREFIX}${Math.round(lengthFt * 10000) / 10000}`;
}

/** "2x6 × 20'" — or the condition name when no member size is set. */
export function lumberItemName(memberSize: string | null | undefined, conditionName: string, lengthFt: number, exact = false) {
  const base = memberSize?.trim() || conditionName;
  if (exact) return `${base} × ${feetInches(lengthFt)}`;
  const len = Number.isInteger(lengthFt) ? String(lengthFt) : lengthFt.toFixed(2).replace(/0+$/, "");
  return `${base} × ${len}'`;
}

/** The quantity an assembly item multiplies: a condition metric, or a count of lumber pieces. */
export function assemblyBase(item: { metric: string }, metrics: Metrics, cutList: [number, number][] = []) {
  if (item.metric === LUMBER_LF_METRIC) return metrics.member_lf;
  if (isLumberMetric(item.metric)) {
    const len = Number(item.metric.slice(LUMBER_METRIC_PREFIX.length));
    return cutList.find(([l]) => Math.abs(l - len) < 1e-3)?.[1] ?? 0;
  }
  return metrics[item.metric as MetricKey] ?? 0;
}

/** Assembly line quantity: metric × qty ÷ per, plus waste, optionally rounded up. */
export function assemblyQuantity(
  item: { qty: number; per: number; wastePct: number; roundUp: boolean; metric: string },
  metrics: Metrics,
  cutList: [number, number][] = [],
) {
  const base = assemblyBase(item, metrics, cutList);
  const per = item.per > 0 ? item.per : 1;
  const q = withWaste((base * item.qty) / per, item.wastePct);
  return item.roundUp ? Math.ceil(q - 1e-9) : q;
}

export function parsePoints(json: string): Pt[] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((p): p is Pt => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)));
  } catch {
    return [];
  }
}

/** 12.5 → 12'-6" */
export function feetInches(feet: number) {
  const sign = feet < 0 ? "-" : "";
  let total = Math.round(Math.abs(feet) * 12);
  const ft = Math.floor(total / 12);
  total -= ft * 12;
  return `${sign}${ft}'-${total}"`;
}

export function round(value: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Item List identity: ignores case, extra spaces and inch / foot marks, so
 * "Concrete" = "concrete " and '1/2" 4x12 Drywall' = "1/2 4x12 drywall".
 */
export function itemNameKey(name: string) {
  return name
    .replace(/["'‘’“”′″]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
