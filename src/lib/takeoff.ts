/**
 * Takeoff math, shared by the server (totals, send-to-estimate) and the browser
 * (live totals while drawing). Shapes are stored in page units; a sheet's
 * `unitsPerFoot` converts them to feet.
 */

export type Pt = [number, number];

export const CONDITION_TYPES = ["AREA", "LINEAR", "WALL", "OPENING", "DOOR", "WINDOW", "COUNT", "FRAMING", "HIP_VALLEY", "BEAM"] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  AREA: "Area",
  LINEAR: "Linear",
  COUNT: "Count",
  FRAMING: "Joists / Rafters",
  HIP_VALLEY: "Hip / Valley",
  BEAM: "Beams",
  WALL: "Walls",
  OPENING: "Openings / Headers",
  DOOR: "Doors",
  WINDOW: "Windows",
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
  casing_lf: { label: "Casing, one side (2 legs + head)", unit: "lf" },
  door_width_lf: { label: "Door widths", unit: "lf" },
  window_width_lf: { label: "Window widths", unit: "lf" },
} as const;
export type MetricKey = keyof typeof METRICS;

export const METRICS_BY_TYPE: Record<ConditionType, MetricKey[]> = {
  AREA: ["area", "plan_area", "area_sy", "squares", "perimeter", "volume"],
  LINEAR: ["length", "plan_length", "wall_area"],
  COUNT: ["count"],
  FRAMING: ["members", "member_lf", "stock_lf", "board_feet", "area", "plan_area"],
  HIP_VALLEY: ["members", "member_lf", "stock_lf", "board_feet", "plan_length"],
  BEAM: ["members", "member_lf", "stock_lf", "board_feet", "plan_length"],
  WALL: ["length", "wall_area"],
  OPENING: ["count", "length"],
  DOOR: ["count", "casing_lf", "door_width_lf"],
  WINDOW: ["count", "casing_lf", "window_width_lf"],
};

export const DEFAULT_METRIC: Record<ConditionType, MetricKey> = {
  AREA: "area",
  LINEAR: "length",
  COUNT: "count",
  FRAMING: "members",
  HIP_VALLEY: "members",
  BEAM: "members",
  WALL: "length",
  OPENING: "count",
  DOOR: "count",
  WINDOW: "count",
};

export function metricLabel(key: string) {
  if (key.startsWith(WALL_METRIC_PREFIX)) return "From the walls";
  if (key.startsWith(OPENING_METRIC_PREFIX)) return "From the openings";
  if (key.startsWith(DOOR_METRIC_PREFIX)) return "From the doors";
  if (key.startsWith(WINDOW_METRIC_PREFIX)) return "From the windows";
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
  { label: "1\" = 10'", paperInchesPerFoot: 1 / 10 },
  { label: "1\" = 20'", paperInchesPerFoot: 1 / 20 },
  { label: "1\" = 30'", paperInchesPerFoot: 1 / 30 },
  { label: "1\" = 40'", paperInchesPerFoot: 1 / 40 },
  { label: "1\" = 50'", paperInchesPerFoot: 1 / 50 },
  { label: "1\" = 60'", paperInchesPerFoot: 1 / 60 },
  { label: "1\" = 100'", paperInchesPerFoot: 1 / 100 },
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

// --- Arcs ------------------------------------------------------------------------
// A shape's vertices can include arc points: the curve from the vertex before it to
// the vertex after it passes through that point (a 3-point arc). Every quantity is
// worked out on the curve, sampled every 2° (well under 1/100" off on a 20' radius).

const ARC_STEP = (2 * Math.PI) / 180;

/** Points along the circular arc from `a` through `m` to `b` — not including `a`, ending at `b`. Straight if the three line up. */
export function arcThrough(a: Pt, m: Pt, b: Pt): Pt[] {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  const span = Math.max(dist(a, m), dist(m, b), dist(a, b));
  if (Math.abs(d) < 1e-9 * span * span) return [m, b];
  const sq = (p: Pt) => p[0] * p[0] + p[1] * p[1];
  const cx = (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d;
  const cy = (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d;
  const r = Math.hypot(a[0] - cx, a[1] - cy);
  const ang = (p: Pt) => Math.atan2(p[1] - cy, p[0] - cx);
  const a0 = ang(a);
  const TAU = 2 * Math.PI;
  const norm = (x: number) => ((x % TAU) + TAU) % TAU;
  // Sweep counter-clockwise from a to b; if m isn't on that side, go the other way.
  let sweep = norm(ang(b) - a0);
  if (norm(ang(m) - a0) > sweep) sweep -= TAU;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const out: Pt[] = [];
  for (let i = 1; i < n; i++) {
    const t = a0 + (sweep * i) / n;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  out.push(b);
  return out;
}

/**
 * The path a shape really follows: its vertices with each arc point replaced by
 * the curve through it. `closed` outlines may curve on the closing edge too.
 */
export function arcPath(points: Pt[], arcs: number[] | null | undefined, closed: boolean): Pt[] {
  if (!arcs?.length || points.length < 3) return points;
  const isArc = new Set(arcs.filter((i) => i > 0 && (closed || i < points.length - 1)));
  if (!isArc.size) return points;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (isArc.has(i)) {
      const next = i + 1 < points.length ? points[i + 1] : points[0];
      out.push(...arcThrough(points[i - 1], points[i], next));
      if (i + 1 < points.length)
        i++; // the arc ended on the next vertex
      else out.pop(); // closing arc ends back on the first point (the polygon closes itself)
    } else out.push(points[i]);
  }
  return out;
}

/** Outlines (areas, joist/rafter areas) close on themselves; everything else is an open line. */
export function isClosedType(type: string) {
  return type === "AREA" || type === "FRAMING";
}

/** A measurement's real path (arcs drawn out), for quantities and drawing. */
export function shapePath(type: string, m: { points: Pt[]; arcs?: number[] | null }) {
  return arcPath(m.points, m.arcs, isClosedType(type));
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

/**
 * Multiplier from the plan length of a hip/valley line to its true length, for the
 * two roof planes it joins (pitches in inches of rise per 12"). Both planes climb to
 * the same height, so a point on the hip a feet from one eave and b feet from the
 * other has a·p1 = b·p2; the rise over a plan length L works out to
 * L·p1·p2 / (12·√(p1² + p2²)). Equal pitches give the familiar 45° hip
 * (16.97" of plan run per 12" of common run); a 0 pitch on either side is level (ridges).
 */
export function hipFactor(pitch: number, otherPitch: number = pitch) {
  if (!(pitch > 0) || !(otherPitch > 0)) return 1;
  const risePerPlan = (pitch * otherPitch) / (12 * Math.sqrt(pitch ** 2 + otherPitch ** 2));
  return Math.sqrt(1 + risePerPlan ** 2);
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
  pitch2?: number | null; // hips & valleys: the other side (null = same as pitch)
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
  // Joists/rafters: how cuts are packed into boards (see PACK_MODES), and the prices it can use.
  packMode?: string | null;
  packLength?: number | null;
  /** Beams: their bearing and plies, as JSON (beamOptions). */
  options?: string | null;
  lengthPrices?: LengthPrices | null;
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

export type MeasurementShape = {
  points: Pt[];
  isDeduction: boolean;
  angle: number;
  // This shape's own pitch (joists/rafters, hips/valleys); null/undefined = the condition's.
  pitch?: number | null;
  pitch2?: number | null;
  height?: number | null; // Linear: this line's own wall height (ft); null/undefined = the condition's
  arcs?: number[] | null; // indexes of arc points (see arcPath)
  door?: { widthIn: number; heightIn: number; cased?: boolean | null } | null; // Doors / windows: the unit picked for this marker
  /**
   * Joists/rafters on a span table: the member lengths (ft, pitch and overhang in) this shape gives
   * this takeoff — where some of its joists need another size, those go to that size's takeoff.
   */
  memberLengths?: number[] | null;
};

/** Conditions whose shapes become pieces of lumber. */
export function isMemberType(type: string) {
  return type === "FRAMING" || type === "HIP_VALLEY" || type === "BEAM";
}

/** Conditions whose material lines the takeoff writes itself (lumber, wall, opening and door materials). */
export function hasAutoLines(type: string) {
  return isMemberType(type) || type === "WALL" || type === "OPENING" || type === "DOOR" || type === "WINDOW";
}

/** Takeoffs measured by clicking once per item (counts, doors). */
export function isCountType(type: string) {
  return type === "COUNT" || type === "DOOR" || type === "WINDOW";
}

/** Doors and windows: each marker is one unit, picked from the Item List. */
export function isUnitType(type: string) {
  return type === "DOOR" || type === "WINDOW";
}

/** The pitches a shape uses: its own when set, otherwise the condition's (side 2 defaults to side 1). */
export function shapePitches(c: { pitch: number; pitch2?: number | null }, m: { pitch?: number | null; pitch2?: number | null }) {
  const p1 = m.pitch ?? c.pitch;
  const p2 = m.pitch2 ?? (m.pitch != null ? m.pitch : (c.pitch2 ?? c.pitch));
  return { p1, p2 };
}

/**
 * Plan length a hip or valley runs past the wall corner into an overhang of
 * `overhangFt` (horizontal, measured out from the walls). With equal pitches it
 * runs diagonally through the soffit corner (× 1.414); with different pitches it
 * reaches the steeper side's fascia first. Level lines (ridges) just add it straight.
 */
export function hipOverhangPlan(overhangFt: number, p1: number, p2: number) {
  if (!(overhangFt > 0)) return 0;
  if (!(p1 > 0) || !(p2 > 0)) return overhangFt;
  const ratio = Math.min(p1, p2) / Math.max(p1, p2);
  return overhangFt * Math.sqrt(1 + ratio ** 2);
}

/** One hip / valley / ridge piece: true length of the traced line plus its overhang. */
export function hipLength(c: ConditionCalc, m: MeasurementShape, unitsPerFoot: number) {
  const { p1, p2 } = shapePitches(c, m);
  const plan = polylineLength(shapePath(c.type, m)) / unitsPerFoot + hipOverhangPlan(c.overhang / 12, p1, p2);
  return { plan, length: plan * hipFactor(p1, p2) };
}

/** Beams: how long the bearing is at each end, and how many plies (built-up LVLs). */
export type BeamOptions = { bearingIn: number; plies: number };
export const DEFAULT_BEAM_OPTIONS: BeamOptions = { bearingIn: 3, plies: 1 };

export function beamOptions(options: string | null | undefined): BeamOptions {
  try {
    const o = JSON.parse(options ?? "{}") as Partial<BeamOptions>;
    const bearingIn = Number(o.bearingIn);
    const plies = Math.round(Number(o.plies));
    return {
      bearingIn: Number.isFinite(bearingIn) && bearingIn >= 0 ? Math.min(bearingIn, 48) : DEFAULT_BEAM_OPTIONS.bearingIn,
      plies: Number.isFinite(plies) && plies >= 1 ? Math.min(plies, 6) : DEFAULT_BEAM_OPTIONS.plies,
    };
  } catch {
    return DEFAULT_BEAM_OPTIONS;
  }
}

/** One beam: the traced span (level) plus the bearing at both ends, in feet — and its plies. */
export function beamLength(c: ConditionCalc, m: MeasurementShape, unitsPerFoot: number) {
  const { bearingIn, plies } = beamOptions(c.options);
  const span = polylineLength(shapePath(c.type, m)) / unitsPerFoot;
  return { span, length: span + (2 * bearingIn) / 12, plies };
}

/** A beam's label on the plan: "GLB 5-1/8x12 · 18'-7"", "LVL 1-3/4x11-7/8 ×3 · 14'-6"". */
export function beamLabel(c: ConditionCalc & { name: string }, m: MeasurementShape, unitsPerFoot: number) {
  const { length, plies } = beamLength(c, m, unitsPerFoot);
  return `${c.memberSize?.trim() || c.name}${plies > 1 ? ` ×${plies}` : ""} · ${feetInches(length)}`;
}

/** Member lengths in feet for a joist/rafter outline (many), a hip/valley line (one) or a beam (one per ply). */
export function memberLengths(c: ConditionCalc, m: MeasurementShape, unitsPerFoot: number) {
  if (c.type === "HIP_VALLEY") return [hipLength(c, m, unitsPerFoot).length];
  if (c.type === "BEAM") {
    const { length, plies } = beamLength(c, m, unitsPerFoot);
    return Array<number>(plies).fill(length);
  }
  return framingLengths(c, m, unitsPerFoot);
}

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
  if (m.memberLengths) return m.memberLengths;
  const members = framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn));
  const factor = slopeFactor(m.pitch ?? c.pitch);
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
  if (c.type === "DOOR" || c.type === "WINDOW") {
    // One marker per unit; its size (when one is picked) gives the casing (2 legs + head) and width.
    out.count = 1;
    if (m.door) {
      if (c.type === "DOOR") out.door_width_lf = m.door.widthIn / 12;
      else out.window_width_lf = m.door.widthIn / 12;
      // An uncased window has no casing.
      if (!(c.type === "WINDOW" && m.door.cased === false)) out.casing_lf = (2 * m.door.heightIn + m.door.widthIn) / 12;
    }
    return out;
  }
  if (c.type === "OPENING") {
    // One line per opening, drawn across it: its length is the opening width.
    out.count = sign;
    if (unitsPerFoot && unitsPerFoot > 0) {
      out.plan_length = sign * (polylineLength(shapePath(c.type, m)) / unitsPerFoot);
      out.length = out.plan_length;
    }
    return out;
  }
  if (!unitsPerFoot || unitsPerFoot <= 0) return out;
  const sqft = unitsPerFoot * unitsPerFoot;

  if (c.type === "WALL") {
    const plan = polylineLength(shapePath(c.type, m)) / unitsPerFoot;
    out.plan_length = plan;
    out.length = plan;
    out.wall_area = plan * c.height;
    return out;
  }

  if (c.type === "LINEAR") {
    const plan = polylineLength(shapePath(c.type, m)) / unitsPerFoot;
    const factor = c.pitchMode === "HIP" ? hipFactor(c.pitch, c.pitch2 ?? c.pitch) : slopeFactor(c.pitch);
    out.plan_length = sign * plan;
    out.length = sign * plan * factor;
    out.wall_area = sign * plan * (m.height ?? c.height);
    return out;
  }

  if (c.type === "BEAM") {
    if (m.isDeduction) return out;
    const { span, length, plies } = beamLength(c, m, unitsPerFoot);
    const stock = parseStockLengths(c.stockLengths);
    const size = parseMemberSize(c.memberSize);
    out.plan_length = span;
    out.members = plies;
    out.member_lf = length * plies;
    out.stock_lf = stockPieces(length, stock, c.soldAs).reduce((a, b) => a + b, 0) * plies;
    out.board_feet = out.stock_lf * (c.boardFeetPerLf ?? (size ? (size.t * size.w) / 12 : 0));
    return out;
  }

  if (c.type === "HIP_VALLEY") {
    if (m.isDeduction) return out;
    const { plan, length } = hipLength(c, m, unitsPerFoot);
    const stock = parseStockLengths(c.stockLengths);
    const size = parseMemberSize(c.memberSize);
    out.plan_length = plan;
    out.members = 1;
    out.member_lf = length;
    out.stock_lf = stockPieces(length, stock, c.soldAs).reduce((a, b) => a + b, 0);
    out.board_feet = out.stock_lf * (c.boardFeetPerLf ?? (size ? (size.t * size.w) / 12 : 0));
    return out;
  }

  const path = shapePath(c.type, m);
  const plan = polygonArea(path) / sqft;
  const area = plan * slopeFactor(c.type === "FRAMING" ? (m.pitch ?? c.pitch) : c.pitch);
  out.plan_area = sign * plan;
  out.area = sign * area;

  if (c.type === "AREA") {
    out.area_sy = (sign * area) / 9;
    out.squares = (sign * area) / 100;
    out.perimeter = sign * (polygonPerimeter(path) / unitsPerFoot);
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
  return framingBoards(c, shapes).cutList;
}

/** Saw kerf allowed between cuts on one board: 1/8". */
export const SAW_KERF_FT = 1 / 96;

/** Default stock lengths (when a condition has none): even lengths 8'–24'. */
export const DEFAULT_STOCK_LENGTHS = [8, 10, 12, 14, 16, 18, 20, 22, 24];
const DEFAULT_STOCK = DEFAULT_STOCK_LENGTHS;

/** Boards cut the same way. One-piece boards are grouped by length, with `cutsMax` the longest cut. */
export type BoardPattern = { length: number; cuts: number[]; count: number; cutsMax?: number };

/**
 * How joist/rafter cuts are packed into boards:
 * - WASTE: the fewest lineal feet ordered (least waste) — the default;
 * - CHEAPEST: the lowest cost, from your prices for each length;
 * - LENGTH: every board one length you choose (`packLength`).
 */
export const PACK_MODES = ["WASTE", "CHEAPEST", "LENGTH"] as const;
export type PackMode = (typeof PACK_MODES)[number];
export const PACK_MODE_LABELS: Record<PackMode, string> = { WASTE: "Least waste", CHEAPEST: "Cheapest", LENGTH: "One length" };

export function packMode(mode: string | null | undefined): PackMode {
  return (PACK_MODES as readonly string[]).includes(mode ?? "") ? (mode as PackMode) : "WASTE";
}

/** Prices per board length, in dollars (job or Item List), for the lengths that have one. */
export type LengthPrices = Record<number, number>;

/**
 * A board length's price: its own when it has one, else estimated from the
 * per-foot price of the nearest priced length (longer on a tie). Null when
 * nothing is priced.
 */
export function boardPrice(length: number, prices: LengthPrices | null | undefined): { price: number; estimated: boolean } | null {
  const known = Object.entries(prices ?? {})
    .map(([l, p]) => [Number(l), p] as const)
    .filter(([l, p]) => l > 0 && p > 0);
  if (!known.length) return null;
  const own = known.find(([l]) => Math.abs(l - length) < 1e-6);
  if (own) return { price: own[1], estimated: false };
  const [nl, np] = known.reduce((best, k) => {
    const d = Math.abs(k[0] - length) - Math.abs(best[0] - length);
    return d < -1e-9 || (Math.abs(d) <= 1e-9 && k[0] > best[0]) ? k : best;
  });
  return { price: (np / nl) * length, estimated: true };
}

export type PackResult = {
  boards: BoardPattern[];
  cutList: [number, number][];
  /** The method actually used (Cheapest with no prices falls back to Least waste). */
  mode: PackMode;
  /** Cheapest asked for, but nothing priced for this size yet. */
  noPrices?: boolean;
  /** What the boards cost, when any length is priced (null = no prices). */
  cost: number | null;
  /** Board lengths whose price was estimated from another length's. */
  estimated: number[];
};

/**
 * Packs cut lengths into stock boards the way a framer would: longest cuts first,
 * each into the board it fits most snugly (with a saw kerf between cuts).
 *
 * Least waste (default) tries each stock length as the board size (a cut longer than
 * it gets a board of its own), shrinks each
 * board to the shortest stock length that holds its cuts, and keeps the layout
 * that orders the fewest lineal feet (shorter boards on a tie). Cheapest tries the
 * same layouts but sizes each board to the cheapest length that holds it and keeps
 * the lowest cost. One length packs every board at `length` (no shrinking); a single
 * cut longer than that gets the shortest stock length that fits.
 *
 * A cut longer than the longest stock is spliced: full-length boards plus a
 * remainder cut that is packed with the rest.
 */
export function packBoards(
  cutLengths: number[],
  stockList: number[] | null,
  opts: { mode?: string | null; length?: number | null; prices?: LengthPrices | null } = {},
): PackResult {
  const stock = stockList?.length ? stockList : DEFAULT_STOCK;
  const max = stock[stock.length - 1];
  let mode = packMode(opts.mode);
  const fixed = mode === "LENGTH" && opts.length && opts.length > 0 ? opts.length : null;
  if (mode === "LENGTH" && !fixed) mode = "WASTE";
  const priceOf = (len: number) => boardPrice(len, opts.prices);
  const noPrices = mode === "CHEAPEST" && !priceOf(max);
  if (noPrices) mode = "WASTE";

  /** Shortest stock length that holds `used` feet (longer cuts: their own even length). */
  const shortest = (used: number) => stock.find((l) => l >= used - 1e-9) ?? (stockList?.length ? max : stockLength(used));
  /** Cheapest stock length that holds `used` feet (shorter on a tie). */
  const cheapest = (used: number) => {
    let best = shortest(used);
    let bestPrice = priceOf(best)?.price ?? Infinity;
    for (const l of stock) {
      if (l < used - 1e-9) continue;
      const p = priceOf(l)?.price ?? Infinity;
      if (p < bestPrice - 1e-9) {
        best = l;
        bestPrice = p;
      }
    }
    return best;
  };

  const fullBoards: number[] = [];
  const cuts: number[] = [];
  for (const raw of cutLengths) {
    if (!(raw > 0)) continue;
    let left = raw;
    if (!stockList?.length && left > max + 1e-9) {
      // No stock list: longer members are ordered at their own (even) length, as before.
      fullBoards.push(stockLength(left));
      continue;
    }
    while (left > max + 1e-9) {
      fullBoards.push(max);
      left -= max;
    }
    // One length: a piece longer than your length gets its own board, the shortest that fits.
    if (fixed && left > fixed + 1e-9) fullBoards.push(shortest(left));
    else cuts.push(left);
  }
  cuts.sort((a, b) => b - a);

  const packInto = (capacity: number) => {
    const bins: { cuts: number[]; used: number }[] = [];
    for (const cut of cuts) {
      let best: (typeof bins)[number] | null = null;
      let bestLeft = Infinity;
      for (const bin of bins) {
        const left = capacity - (bin.used + SAW_KERF_FT + cut);
        if (left >= -1e-9 && left < bestLeft) {
          best = bin;
          bestLeft = left;
        }
      }
      if (best) {
        best.cuts.push(cut);
        best.used += SAW_KERF_FT + cut;
      } else {
        bins.push({ cuts: [cut], used: cut });
      }
    }
    return bins;
  };

  // Each board's length for a packed bin.
  const sizeOf = fixed ? () => fixed : mode === "CHEAPEST" ? cheapest : shortest;
  let bins: { cuts: number[]; used: number }[] = [];
  if (fixed) bins = packInto(fixed);
  else {
    // Every stock length is tried as the board size — even shorter than the longest cut:
    // a cut that doesn't fit gets a board of its own (e.g. short pieces share 16s
    // while the long ones go on 20s).
    let bestScore = Infinity;
    let bestLf = Infinity;
    for (const capacity of stock) {
      const tryBins = packInto(capacity);
      const lengths = tryBins.map((b) => sizeOf(b.used));
      const lf = lengths.reduce((s, l) => s + l, 0);
      const score = mode === "CHEAPEST" ? lengths.reduce((s, l) => s + (priceOf(l)?.price ?? 0), 0) : lf;
      // Cheapest: on a tie, the fewer feet.
      if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && lf < bestLf - 1e-9)) {
        bins = tryBins;
        bestScore = score;
        bestLf = lf;
      }
    }
  }

  const patterns = new Map<string, BoardPattern>();
  const addBoard = (length: number, boardCuts: number[]) => {
    // One-piece boards group by length (cut range); multi-piece boards by their exact cuts.
    const single = boardCuts.length === 1;
    const key = single ? `${length}|1` : `${length}|${boardCuts.map((x) => Math.round(x * 96)).join(",")}`;
    const p = patterns.get(key) ?? { length, cuts: [...boardCuts], count: 0, ...(single ? { cutsMax: boardCuts[0] } : {}) };
    if (single && p.count > 0) {
      p.cuts = [Math.min(p.cuts[0], boardCuts[0])];
      p.cutsMax = Math.max(p.cutsMax ?? 0, boardCuts[0]);
    }
    p.count++;
    patterns.set(key, p);
  };
  for (const len of fullBoards) addBoard(len, [len]);
  for (const bin of bins) addBoard(sizeOf(bin.used), bin.cuts);

  const boards = Array.from(patterns.values()).sort((a, b) => b.length - a.length || b.count - a.count);
  const counts = new Map<number, number>();
  for (const b of boards) counts.set(b.length, (counts.get(b.length) ?? 0) + b.count);
  const cutList = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  return { boards, cutList, mode, ...(noPrices ? { noPrices } : {}), ...listCost(cutList, opts.prices) };
}

/** "Cheapest (2 prices estimated)", "One length: 26'", … — how a condition's boards were packed. */
export function packLabel(pack: { mode: PackMode; noPrices?: boolean; estimated: number[] }, packLength?: number | null) {
  if (pack.mode === "LENGTH") return `One length: ${num2(packLength ?? 0)}'`;
  if (pack.mode === "CHEAPEST") return `Cheapest${pack.estimated.length ? ` (${pack.estimated.length} price${pack.estimated.length === 1 ? "" : "s"} estimated)` : ""}`;
  return pack.noPrices ? "Least waste — no prices yet to find the cheapest" : "Least waste";
}

function num2(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "");
}

/** What a cut list costs at these prices (estimating unpriced lengths), and which lengths were estimated. */
export function listCost(cutList: [number, number][], prices: LengthPrices | null | undefined): { cost: number | null; estimated: number[] } {
  let cost = 0;
  const estimated: number[] = [];
  for (const [len, n] of cutList) {
    const p = boardPrice(len, prices);
    if (!p) return { cost: null, estimated: [] };
    cost += p.price * n;
    if (p.estimated) estimated.push(len);
  }
  return { cost, estimated };
}

/**
 * Waste as whole extra boards: the waste % of the feet ordered, rounded up to
 * boards of the length the order uses most (the longer on a tie). Added once
 * to the whole order, not to each length.
 */
export function wasteBoards(cutList: [number, number][], wastePct: number): { length: number; count: number } | null {
  if (!(wastePct > 0) || !cutList.length) return null;
  const lf = cutList.reduce((s, [len, n]) => s + len * n, 0);
  const [length] = cutList.reduce((best, row) => (row[1] > best[1] || (row[1] === best[1] && row[0] > best[0]) ? row : best));
  const count = Math.ceil((lf * wastePct) / 100 / length - 1e-9);
  return count > 0 ? { length, count } : null;
}

/** A cut list with waste boards added. */
export function withWasteBoards(cutList: [number, number][], extra: { length: number; count: number } | null): [number, number][] {
  if (!extra) return cutList;
  return cutList.map(([len, n]) => [len, Math.abs(len - extra.length) < 1e-6 ? n + extra.count : n]);
}

/**
 * The lumber a joist/rafter or hip/valley condition orders. Joist/rafter
 * stock-length sizes are packed into boards (short pieces share a board). Hips,
 * valleys and ridges get a board each (rounded up, spliced past the longest
 * stock), and made-to-order and lineal-foot sizes list each member at its own length.
 */
export function framingBoards(c: ConditionCalc, shapes: { m: MeasurementShape; unitsPerFoot: number | null }[]) {
  const lengths: number[] = [];
  for (const { m, unitsPerFoot } of shapes) {
    if (!unitsPerFoot || m.isDeduction) continue;
    lengths.push(...memberLengths(c, m, unitsPerFoot));
  }
  // Hips, valleys and beams: a board each (no sharing); made-to-order and lf sizes: each at its length.
  const onePiece = c.type === "HIP_VALLEY" || c.type === "BEAM";
  if (c.soldAs === "EXACT_LF" || c.soldAs === "LF" || onePiece) {
    const stock = onePiece ? parseStockLengths(c.stockLengths) : null;
    const list = new Map<number, number>();
    for (const l of lengths) {
      for (const s of stockPieces(l, stock, c.soldAs)) {
        const key = Math.round(s * 10000) / 10000;
        list.set(key, (list.get(key) ?? 0) + 1);
      }
    }
    const cutList = Array.from(list.entries()).sort((a, b) => a[0] - b[0]) as [number, number][];
    return { boards: [] as BoardPattern[], cutList, mode: "WASTE" as PackMode, cost: null, estimated: [] as number[], lengths };
  }
  return { ...packBoards(lengths, parseStockLengths(c.stockLengths), { mode: c.packMode, length: c.packLength, prices: c.lengthPrices }), lengths };
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

/** Walls conditions: every material line is "wall:<key>", worked out by wallTakeoff. */
export const WALL_METRIC_PREFIX = "wall:";
/** Openings conditions: headers and king & jack studs, "opening:<key>" (openingTakeoff). */
export const OPENING_METRIC_PREFIX = "opening:";

/** Doors conditions: each door and the casing, "door:<key>" (doorTakeoff). */
export const DOOR_METRIC_PREFIX = "door:";

/** Windows conditions: each window, casing, stool and apron, "window:<key>" (windowTakeoff). */
export const WINDOW_METRIC_PREFIX = "window:";

/** The metric prefix for a condition type's auto material lines (walls, openings, doors, windows). */
export function autoMetricPrefix(type: string) {
  return type === "OPENING" ? OPENING_METRIC_PREFIX : type === "DOOR" ? DOOR_METRIC_PREFIX : type === "WINDOW" ? WINDOW_METRIC_PREFIX : WALL_METRIC_PREFIX;
}

/** Lines the takeoff writes itself (lumber from layouts, wall & opening materials) — not edited by hand. */
export function isLumberMetric(metric: string) {
  return (
    metric.startsWith(LUMBER_METRIC_PREFIX) ||
    metric === LUMBER_LF_METRIC ||
    metric.startsWith(WALL_METRIC_PREFIX) ||
    metric.startsWith(OPENING_METRIC_PREFIX) ||
    metric.startsWith(DOOR_METRIC_PREFIX) ||
    metric.startsWith(WINDOW_METRIC_PREFIX)
  );
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

/** "2x6 × 26'" → { size: "2x6", length: 26 } (lumber sold by the stock length), else null. */
export function lumberOf(name: string): { size: string; length: number } | null {
  const m = /^(.+?) × (\d+(?:\.\d+)?)'$/.exec(name.trim());
  return m ? { size: m[1].trim(), length: Number(m[2]) } : null;
}

/**
 * A substitute written on a bid for a board ("2x6x28", "28'", "2x6 28 ft"): the length it means
 * when it's the same size at another length, else null (another product).
 */
export function substituteLength(boardName: string, text: string): number | null {
  const board = lumberOf(boardName);
  if (!board) return null;
  const tight = (t: string) =>
    t
      .toLowerCase()
      .replace(/\s*[x×]\s*/g, "x")
      .trim();
  let rest = tight(text);
  const size = tight(board.size);
  if (rest.includes(size)) rest = rest.replace(size, " ");
  const m = /^[\sx]*(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)?\s*(?:long)?\s*$/.exec(rest);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 6 && n <= 60 && n !== board.length ? n : null;
}

/** The quantity an assembly item multiplies: a condition metric, a count of lumber pieces, or a wall / opening material. */
export function assemblyBase(item: { metric: string }, metrics: Metrics, cutList: [number, number][] = [], auto: Record<string, number> = {}) {
  if (
    item.metric.startsWith(WALL_METRIC_PREFIX) ||
    item.metric.startsWith(OPENING_METRIC_PREFIX) ||
    item.metric.startsWith(DOOR_METRIC_PREFIX) ||
    item.metric.startsWith(WINDOW_METRIC_PREFIX)
  )
    return auto[item.metric] ?? 0;
  if (item.metric === LUMBER_LF_METRIC) return metrics.member_lf;
  if (isLumberMetric(item.metric)) {
    const len = Number(item.metric.slice(LUMBER_METRIC_PREFIX.length));
    return cutList.find(([l]) => Math.abs(l - len) < 1e-3)?.[1] ?? 0;
  }
  return metrics[item.metric as MetricKey] ?? 0;
}

/**
 * The waste % a line adds itself. Lumber pieces ("2x6 × 20'") add none: the
 * condition's waste is already in their counts, as whole extra boards (wasteBoards).
 */
export function lineWastePct(item: { metric: string; wastePct: number }) {
  return item.metric.startsWith(LUMBER_METRIC_PREFIX) ? 0 : item.wastePct;
}

/** Assembly line quantity: metric × qty ÷ per, plus waste, optionally rounded up. */
export function assemblyQuantity(
  item: { qty: number; per: number; wastePct: number; roundUp: boolean; metric: string },
  metrics: Metrics,
  cutList: [number, number][] = [],
  auto: Record<string, number> = {},
) {
  const base = assemblyBase(item, metrics, cutList, auto);
  const per = item.per > 0 ? item.per : 1;
  const q = withWaste((base * item.qty) / per, lineWastePct(item));
  return item.roundUp ? Math.ceil(q - 1e-9) : q;
}

/** Stored points: [x, y] vertices, [x, y, 1] for an arc point. */
function storedPoints(json: string): number[][] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((p): p is number[] => Array.isArray(p) && (p.length === 2 || p.length === 3) && p.every((n) => typeof n === "number" && Number.isFinite(n)));
  } catch {
    return [];
  }
}

export function parsePoints(json: string): Pt[] {
  return storedPoints(json).map((p) => [p[0], p[1]]);
}

/** Indexes of a stored shape's arc points. */
export function parseArcs(json: string): number[] {
  return storedPoints(json).flatMap((p, i) => (p[2] === 1 ? [i] : []));
}

/** Points (and arc points) as stored, rounded to 1/100 page unit. */
export function pointsJson(points: Pt[], arcs?: number[] | null) {
  const set = new Set(arcs ?? []);
  return JSON.stringify(
    points.map(([x, y], i) => (set.has(i) ? [Math.round(x * 100) / 100, Math.round(y * 100) / 100, 1] : [Math.round(x * 100) / 100, Math.round(y * 100) / 100])),
  );
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

/** "16' → 9'-2" + 6'-5" (offcut 0'-4")" — what one stock board is cut into. */
export function boardPatternText(b: { length: number; cuts: number[]; cutsMax?: number }) {
  const len = Number.isInteger(b.length) ? `${b.length}'` : feetInches(b.length);
  if (b.cuts.length === 1) {
    const lo = b.cuts[0];
    const hi = b.cutsMax ?? lo;
    if (Math.abs(lo - b.length) < 1e-6 && Math.abs(hi - b.length) < 1e-6) return `${len} → full length`;
    return `${len} → 1 piece, ${hi - lo >= 1 / 12 ? `${feetInches(lo)} – ${feetInches(hi)}` : feetInches(hi)}`;
  }
  const used = b.cuts.reduce((s, x) => s + x, 0) + SAW_KERF_FT * (b.cuts.length - 1);
  const offcut = b.length - used;
  return `${len} → ${b.cuts.map(feetInches).join(" + ")}${offcut >= 1 / 12 ? ` (offcut ${feetInches(offcut)})` : ""}`;
}

// --- Walls ------------------------------------------------------------------------

export const SHEET_SIZES: Record<string, number> = { "4x8": 32, "4x9": 36, "4x10": 40, "4x12": 48 };

// --- Material List order ----------------------------------------------------------

/**
 * How lumber reads in a list: "2x6 × 16'" → size 2x6, 16', whether it's a stud
 * (precut) or treated. Null for anything that doesn't start with a size (LVLs,
 * I-joists, sheet goods…).
 */
export function lumberSortKey(name: string) {
  const m = name.match(/^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(.*)$/i);
  if (!m) return null;
  const rest = m[3];
  const inches = rest.match(/(\d+)(?:-(\d+)\/(\d+))?\s*(?:"|in\b)/i);
  const feet = rest.match(/(?:^|[x×\s])\s*(\d+(?:\.\d+)?)\s*(?:'|ft\b|$)/i);
  const length = inches ? (Number(inches[1]) + (inches[2] ? Number(inches[2]) / Number(inches[3]) : 0)) / 12 : feet ? Number(feet[1]) : 0;
  return {
    thick: Number(m[1]),
    width: Number(m[2]),
    treated: /treat|\bp\.?t\.?\b|ground.?contact/i.test(rest) ? 1 : 0,
    board: /stud|precut/i.test(rest) ? 0 : 1,
    length,
  };
}

/**
 * Material List order within a category: precut studs first, then treated lumber
 * (plates), then the rest of the lumber — each by size (2x4, 2x6, 2x8…) then length
 * — then everything else by name (2 before 10).
 */
export function compareMaterialNames(a: string, b: string) {
  const ka = lumberSortKey(a);
  const kb = lumberSortKey(b);
  const natural = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  const tier = (k: NonNullable<ReturnType<typeof lumberSortKey>>) => (k.board === 0 ? 0 : k.treated ? 1 : 2);
  if (ka && kb) return tier(ka) - tier(kb) || ka.thick - kb.thick || ka.width - kb.width || ka.length - kb.length || natural;
  if (ka) return -1;
  if (kb) return 1;
  return natural;
}

/** 92.625 → 92-5/8" (to the nearest 1/8"). */
export function inchesText(inches: number) {
  const eighths = Math.round(inches * 8);
  const whole = Math.floor(eighths / 8);
  let num = eighths % 8;
  let den = 8;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${whole}${num ? `-${num}/${den}` : ""}"`;
}

/** Precut stud length for a wall height with the given plates: 8' → 92-5/8", 9' → 104-5/8", 10' → 116-5/8". */
export function precutStudLength(heightFt: number, plates = 3) {
  return heightFt * 12 + 1.125 - 1.5 * plates;
}

const SHEET_SIZE_RE = /\b4\s*[x×']\s*(8|9|10|12)(?!\d)/i;

/** The sheet size named in an item, e.g. '1/2" Drywall 4x12' → "4x12" (null if none). */
export function sheetSizeInName(name: string): string | null {
  const m = name.match(SHEET_SIZE_RE);
  return m ? `4x${m[1]}` : null;
}

/** An item name with its sheet size swapped for `sheet` (names without a size are left alone). */
export function withSheetSize(name: string, sheet: string) {
  return SHEET_SIZE_RE.test(name) && SHEET_SIZES[sheet] ? name.replace(SHEET_SIZE_RE, sheet) : name;
}

/** Walls: everything besides stud size (the condition's member size), spacing and height. */
export type WallOptions = {
  studPrecut: boolean; // precut studs, or cut from stock lengths
  studLengthIn: number; // the precut, or the stock length (in inches)
  cornerStuds: number; // extra studs at each corner of a traced run
  topPlates: number;
  topPlateSize: string; // blank = same as the studs
  topPlateStock: string; // feet, e.g. "16" or "12, 16"
  bottomPlates: number;
  bottomPlateSize: string;
  bottomPlateStock: string;
  treatedBottom: boolean;
  sheathingSides: number; // 0, 1 or 2
  sheathingItem: string;
  sheathingSheet: string;
  drywallSides: number;
  drywallItem: string;
  drywallSheet: string;
  baseSides: number;
  baseItem: string;
};

export const DEFAULT_WALL_OPTIONS: WallOptions = {
  studPrecut: true,
  studLengthIn: 92.625,
  cornerStuds: 2,
  topPlates: 2,
  topPlateSize: "",
  topPlateStock: "16",
  bottomPlates: 1,
  bottomPlateSize: "",
  bottomPlateStock: "16",
  treatedBottom: false,
  sheathingSides: 0,
  sheathingItem: '7/16" OSB 4x8',
  sheathingSheet: "4x8",
  drywallSides: 2,
  drywallItem: '1/2" Drywall 4x8',
  drywallSheet: "4x8",
  baseSides: 0,
  baseItem: "Baseboard",
};

/** Openings: header size and stock lengths are the condition's member size and stock lengths. */
export type OpeningOptions = {
  headerPlies: number;
  headerExtraIn: number; // added to the opening width for the header length (bearing)
  kingStuds: number; // per opening
  jackStuds: number; // per opening
  studSize: string;
  studPrecut: boolean;
  studLengthIn: number;
};

export const DEFAULT_OPENING_OPTIONS: OpeningOptions = {
  headerPlies: 2,
  headerExtraIn: 3,
  kingStuds: 2,
  jackStuds: 2,
  studSize: "2x4",
  studPrecut: true,
  studLengthIn: 92.625,
};

/** A condition's stored options (JSON) over the defaults; anything missing or the wrong type falls back. */
export function parseOptions<T extends Record<string, unknown>>(json: string | null | undefined, defaults: T): T {
  let raw: Record<string, unknown> = {};
  try {
    const v = json ? JSON.parse(json) : null;
    if (v && typeof v === "object" && !Array.isArray(v)) raw = v as Record<string, unknown>;
  } catch {
    /* bad JSON: defaults */
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const k of Object.keys(defaults)) if (typeof raw[k] === typeof defaults[k] && (typeof raw[k] !== "number" || Number.isFinite(raw[k]))) out[k] = raw[k];
  return out as T;
}

/** A material line the takeoff writes for a Walls or Openings condition. `key` is stable (the estimate line follows it). */
export type AutoLine = { key: string; name: string; unit: "ea" | "sf" | "lf"; qty: number; category: string; waste: boolean };
export type WallLine = AutoLine;

/**
 * One traced wall run, in feet: corners are the bends (and the closing corner of a closed run).
 * Walls joined from separate pieces (see wallNetworks) also carry `ends` — the studs that
 * close their open ends — and `cuts`, each piece's length for the plates.
 */
export type WallRun = { lengthFt: number; closed: boolean; corners: number; ends?: number; cuts?: number[] };

export function wallRun(points: Pt[], unitsPerFoot: number, arcs: number[] = []): WallRun {
  const lengthFt = polylineLength(arcPath(points, arcs, false)) / unitsPerFoot;
  const closed = points.length > 2 && dist(points[0], points[points.length - 1]) / unitsPerFoot < 0.5;
  // Bends are the inside vertices; arc points sit on a curved wall, not at a corner.
  const bends = points.slice(1, -1).filter((_, i) => !arcs.includes(i + 1)).length;
  return { lengthFt, closed, corners: bends + (closed ? 1 : 0) };
}

/**
 * Walls drawn as separate pieces (one per wall, so each can be changed on its own) still
 * frame like one run where they meet: pieces whose ends meet (within 6") are joined, each
 * meeting is a corner, and only the run's open ends get a closing stud. Pieces on different
 * sheets never join. A piece by itself counts exactly as `wallRun` does.
 */
export function wallNetworks(pieces: { sheetId: string; points: Pt[]; arcs?: number[]; unitsPerFoot: number }[]): WallRun[] {
  const out: WallRun[] = [];
  const bySheet = new Map<string, typeof pieces>();
  for (const p of pieces) bySheet.set(p.sheetId, [...(bySheet.get(p.sheetId) ?? []), p]);
  for (const list of bySheet.values()) {
    const runs = list.map((p) => wallRun(p.points, p.unitsPerFoot, p.arcs ?? []));
    // Ends that meet are one node.
    const nodes: { at: Pt; tol: number; pieces: number[]; toward: Pt[] }[] = [];
    const nodeOf = (pt: Pt, tol: number) => {
      const n = nodes.find((x) => dist(x.at, pt) <= Math.max(tol, x.tol));
      if (n) return n;
      const fresh = { at: pt, tol, pieces: [] as number[], toward: [] as Pt[] };
      nodes.push(fresh);
      return fresh;
    };
    list.forEach((p, i) => {
      if (runs[i].closed || p.points.length < 2) return;
      const last = p.points.length - 1;
      for (const [pt, next] of [
        [p.points[0], p.points[1]],
        [p.points[last], p.points[last - 1]],
      ]) {
        const n = nodeOf(pt, 0.5 * p.unitsPerFoot);
        n.pieces.push(i);
        n.toward.push(next);
      }
    });
    // Pieces joined through shared ends: one run.
    const group = list.map((_, i) => i);
    const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
    for (const n of nodes) for (const i of n.pieces.slice(1)) group[root(i)] = root(n.pieces[0]);
    const members = new Map<number, number[]>();
    list.forEach((_, i) => members.set(root(i), [...(members.get(root(i)) ?? []), i]));
    for (const idx of members.values()) {
      if (idx.length === 1) {
        out.push(runs[idx[0]]);
        continue;
      }
      const mine = nodes.filter((n) => n.pieces.length && idx.includes(n.pieces[0]));
      // Two pieces carrying straight on (a wall drawn in two) meet without a corner.
      const straightOn = (n: (typeof nodes)[number]) => {
        if (n.pieces.length !== 2) return false;
        const [a, b] = n.toward.map((t) => Math.atan2(t[1] - n.at[1], t[0] - n.at[0]));
        return Math.abs((Math.abs(a - b) % (2 * Math.PI)) - Math.PI) < (15 * Math.PI) / 180;
      };
      const meetings = mine.reduce((sum, n) => sum + (straightOn(n) ? 0 : Math.max(0, n.pieces.length - 1)), 0);
      const openEnds = mine.filter((n) => n.pieces.length === 1).length;
      out.push({
        lengthFt: idx.reduce((sum, i) => sum + runs[i].lengthFt, 0),
        closed: openEnds === 0,
        corners: idx.reduce((sum, i) => sum + runs[i].corners, 0) + meetings,
        ends: Math.ceil(openEnds / 2),
        cuts: idx.map((i) => runs[i].lengthFt),
      });
    }
  }
  return out;
}

/** Precut stud lengths sold for 8', 9' and 10' walls. */
export const STUD_PRECUTS_IN = [92.625, 104.625, 116.625];
/** Stock lengths studs can be cut from (feet). */
export const STUD_STOCK_FT = [8, 10, 12, 14, 16, 18, 20];

/** The stud a wall height calls for: its precut, or the shortest stock length that covers it (less 3 plates). */
export function defaultStudLength(heightFt: number, precut: boolean) {
  if (precut) return precutStudLength(heightFt);
  const needFt = (heightFt * 12 - 4.5) / 12;
  return (STUD_STOCK_FT.find((l) => l >= needFt - 1e-9) ?? Math.ceil(needFt / 2) * 2) * 12;
}

/**
 * "2x6 × 92-5/8" precut stud", or for studs cut from stock "2x6 × 10'" (the same
 * item as 10' plates). Walls and openings use the same names so they add up on
 * the Material List.
 */
export function studItemName(size: string, lengthIn: number, precut = true) {
  const s = size.trim() || "2x4";
  return precut ? `${s} × ${inchesText(lengthIn)} precut stud` : lumberItemName(s, s, lengthIn / 12);
}

/**
 * Every material for a Walls condition's runs. Openings aren't taken out (they're
 * their own condition), so the wall is figured full length and height:
 * - studs: one per spacing along each run, plus one to close an open run, plus the
 *   extra corner studs at each bend;
 * - top and bottom plates: each run × plates, packed into their stock lengths
 *   (together when they're the same lumber);
 * - sheathing and drywall sheets: length × height × sides ÷ sheet size;
 * - baseboard: length × sides.
 */
export function wallTakeoff(wall: { studSize: string; spacing: number; heightFt: number }, o: WallOptions, runs: WallRun[]) {
  let studs = 0;
  let length = 0;
  const topCuts: number[] = [];
  const bottomCuts: number[] = [];
  for (const r of runs) {
    if (!(r.lengthFt > 0)) continue;
    length += r.lengthFt;
    studs += Math.ceil((r.lengthFt * 12) / Math.max(1, wall.spacing) - 1e-9) + (r.ends ?? (r.closed ? 0 : 1)) + r.corners * Math.max(0, o.cornerStuds);
    for (const cut of r.cuts ?? [r.lengthFt]) {
      for (let i = 0; i < Math.max(0, o.topPlates); i++) topCuts.push(cut);
      for (let i = 0; i < Math.max(0, o.bottomPlates); i++) bottomCuts.push(cut);
    }
  }
  const area = length * wall.heightFt;
  const stud = wall.studSize.trim() || "2x4";
  const lines: AutoLine[] = [];
  if (studs > 0) lines.push({ key: "studs", name: studItemName(stud, o.studLengthIn, o.studPrecut), unit: "ea", qty: studs, category: "Framing Lumber", waste: true });

  const topSize = o.topPlateSize.trim() || stud;
  const bottomSize = `${o.bottomPlateSize.trim() || stud}${o.treatedBottom ? " treated" : ""}`;
  const plateLines = (key: string, size: string, cuts: number[], stock: string) => {
    for (const [len, n] of packBoards(cuts, parseStockLengths(stock)).cutList)
      lines.push({ key: `${key}:${len}`, name: lumberItemName(size, size, len), unit: "ea", qty: n, category: "Framing Lumber", waste: false });
  };
  if (itemNameKey(topSize) === itemNameKey(bottomSize) && o.topPlateStock.trim() === o.bottomPlateStock.trim()) {
    plateLines("plates", topSize, [...topCuts, ...bottomCuts], o.topPlateStock);
  } else {
    plateLines("top", topSize, topCuts, o.topPlateStock);
    plateLines("bottom", bottomSize, bottomCuts, o.bottomPlateStock);
  }

  // The sheet size picked is what's counted, and the item's name says the same size.
  const sheet = (k: string) => SHEET_SIZES[k] ?? 32;
  if (o.sheathingSides > 0 && o.sheathingItem.trim() && area > 0)
    lines.push({
      key: "sheathing",
      name: withSheetSize(o.sheathingItem.trim(), o.sheathingSheet),
      unit: "ea",
      qty: (o.sheathingSides * area) / sheet(o.sheathingSheet),
      category: "Sheathing",
      waste: true,
    });
  if (o.drywallSides > 0 && o.drywallItem.trim() && area > 0)
    lines.push({
      key: "drywall",
      name: withSheetSize(o.drywallItem.trim(), o.drywallSheet),
      unit: "ea",
      qty: (o.drywallSides * area) / sheet(o.drywallSheet),
      category: "Drywall",
      waste: true,
    });
  if (o.baseSides > 0 && o.baseItem.trim() && length > 0)
    lines.push({ key: "base", name: o.baseItem.trim(), unit: "lf", qty: o.baseSides * length, category: "Trim", waste: true });
  return { lines, length, area, studs };
}

/**
 * Every material for an Openings condition, one opening per traced line (its
 * length is the opening width):
 * - header: plies × (width + extra), packed into the header's stock lengths;
 * - king & jack studs per opening.
 */
export function openingTakeoff(header: { size: string | null; stockLengths: string | null }, o: OpeningOptions, widthsFt: number[]) {
  const widths = widthsFt.filter((w) => w > 0);
  const lines: AutoLine[] = [];
  const size = header.size?.trim();
  if (size && widths.length) {
    const cuts = widths.flatMap((w) => Array.from({ length: Math.max(1, o.headerPlies) }, () => w + o.headerExtraIn / 12));
    for (const [len, n] of packBoards(cuts, parseStockLengths(header.stockLengths)).cutList)
      lines.push({ key: `header:${len}`, name: lumberItemName(size, size, len), unit: "ea", qty: n, category: "Framing Lumber", waste: false });
  }
  const studs = widths.length * (Math.max(0, o.kingStuds) + Math.max(0, o.jackStuds));
  if (studs > 0) lines.push({ key: "studs", name: studItemName(o.studSize, o.studLengthIn, o.studPrecut), unit: "ea", qty: studs, category: "Framing Lumber", waste: true });
  return { lines, openings: widths.length };
}

/** "2x6 studs @ 16" o.c. · 8' walls (92-5/8" precuts) · 2 top + 1 bottom plate · 1/2" Drywall both sides" */
export function wallSummary(wall: { studSize: string | null; spacing: number; heightFt: number }, o: WallOptions) {
  const side = (n: number) => (n === 2 ? "both sides" : "1 side");
  const parts = [
    `${wall.studSize || "—"} studs @ ${num0(wall.spacing)}" o.c.`,
    `${num0(wall.heightFt)}' walls (${studText(o.studLengthIn, o.studPrecut)} studs)`,
    `${o.topPlates} top + ${o.bottomPlates} bottom plate${o.bottomPlates === 1 ? "" : "s"}${o.treatedBottom ? " (treated)" : ""}`,
  ];
  if (o.sheathingSides > 0 && o.sheathingItem) parts.push(`${o.sheathingItem} ${side(o.sheathingSides)}`);
  if (o.drywallSides > 0 && o.drywallItem) parts.push(`${o.drywallItem} ${side(o.drywallSides)}`);
  if (o.baseSides > 0 && o.baseItem) parts.push(`${o.baseItem} ${side(o.baseSides)}`);
  return parts.join(" · ");
}

// --- Doors ------------------------------------------------------------------------

/** Doors: the casing ordered for them. Each door's size comes from the door picked on its marker. */
export type DoorOptions = {
  casingItem: string; // legs (blank = no casing)
  casingSides: number; // 1 or 2
  casingStickFt: number; // length one stick comes in (0 = order by the lineal foot)
  headItem: string; // head trim when it's different (e.g. 1x6 over 1x4 legs); blank = same as the legs
  headStickFt: number;
};

export const DEFAULT_DOOR_OPTIONS: DoorOptions = { casingItem: "", casingSides: 2, casingStickFt: 0, headItem: "", headStickFt: 0 };

export function feetInchesIn(inches: number) {
  const ft = Math.floor(inches / 12);
  const rest = Math.round((inches - ft * 12) * 8) / 8;
  return rest ? `${ft}'${num0(rest)}"` : `${ft}'`;
}

/** Door size code: 32 × 80 → "2868", 36 × 96 → "3080". */
export function doorSizeCode(widthIn: number, heightIn: number) {
  const part = (i: number) => `${Math.floor(i / 12)}${num0(i - Math.floor(i / 12) * 12)}`;
  return `${part(widthIn)}${part(heightIn)}`;
}

/** One trim item and the pieces cut from it. */
type TrimCuts = { key: string; item: string; stickFt: number; cutsFt: number[] };

/**
 * Trim lines: pieces of the same item are pooled (so 1x4 legs and a 1x4 head share
 * sticks), then cut from whole sticks (packed, 1/8" kerf) when the stick length is
 * known, otherwise ordered by the lineal foot.
 */
function trimLines(parts: TrimCuts[]): AutoLine[] {
  const pooled = new Map<string, TrimCuts>();
  for (const part of parts) {
    const name = part.item.trim();
    if (!name || !part.cutsFt.length) continue;
    const k = itemNameKey(name);
    const cur = pooled.get(k);
    if (cur) {
      cur.cutsFt.push(...part.cutsFt);
      if (!cur.stickFt && part.stickFt) cur.stickFt = part.stickFt;
    } else pooled.set(k, { ...part, item: name, cutsFt: [...part.cutsFt] });
  }
  return Array.from(pooled.values()).map((t) =>
    t.stickFt > 0
      ? { key: t.key, name: t.item, unit: "ea" as const, qty: packBoards(t.cutsFt, [t.stickFt]).cutList.reduce((sum, [, n]) => sum + n, 0), category: "Trim", waste: true }
      : { key: t.key, name: t.item, unit: "lf" as const, qty: t.cutsFt.reduce((a, b) => a + b, 0), category: "Trim", waste: true },
  );
}

/**
 * Everything a Doors takeoff orders:
 * - each door picked, counted by its Item List name;
 * - casing per side: 2 legs (the height) from the leg trim and a head (the width)
 *   from the head trim (the leg trim when none is set).
 * Doors not picked yet are still counted but add no door or casing.
 */
export function doorTakeoff(doors: { name: string | null; widthIn: number; heightIn: number }[], o: DoorOptions) {
  const lines: AutoLine[] = [];
  const counts = new Map<string, number>();
  const legs: number[] = [];
  const heads: number[] = [];
  let unassigned = 0;
  let casingLf = 0;
  for (const d of doors) {
    if (!d.name) {
      unassigned++;
      continue;
    }
    counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
    for (let side = 0; side < Math.max(0, o.casingSides); side++) {
      legs.push(d.heightIn / 12, d.heightIn / 12);
      heads.push(d.widthIn / 12);
      casingLf += (2 * d.heightIn + d.widthIn) / 12;
    }
  }
  for (const [name, n] of counts) lines.push({ key: `door:${itemNameKey(name)}`, name, unit: "ea", qty: n, category: "Doors", waste: false });
  if (o.casingItem.trim())
    lines.push(
      ...trimLines([
        { key: "casing", item: o.casingItem, stickFt: o.casingStickFt, cutsFt: legs },
        { key: "head", item: o.headItem.trim() || o.casingItem, stickFt: o.headItem.trim() ? o.headStickFt : o.casingStickFt, cutsFt: heads },
      ]),
    );
  return { lines, doors: doors.length, unassigned, casingLf };
}

// --- Windows ------------------------------------------------------------------------

/** The stool is always this Item List item; only how much longer than the window it runs is asked. */
export const WINDOW_STOOL_ITEM = "Window stool";

/**
 * Windows: every window gets a stool and an apron. Cased windows (set per window)
 * also get casing legs, a head, and a lining inside the opening (2 × height + width).
 */
export type WindowOptions = {
  casingItem: string; // legs
  casingStickFt: number;
  headItem: string; // blank = same as the legs
  headStickFt: number;
  liningItem: string; // inside the opening of cased windows
  liningStickFt: number;
  stoolStickFt: number; // the Window stool item's stick length (0 = by the foot)
  stoolExtraIn: number; // longer than the window by
  apronItem: string;
  apronStickFt: number;
  apronExtraIn: number;
};

export const DEFAULT_WINDOW_OPTIONS: WindowOptions = {
  casingItem: "",
  casingStickFt: 0,
  headItem: "",
  headStickFt: 0,
  liningItem: "1x6 primed",
  liningStickFt: 0,
  stoolStickFt: 0,
  stoolExtraIn: 6,
  apronItem: "",
  apronStickFt: 0,
  apronExtraIn: 4,
};

/**
 * Everything a Windows takeoff orders: each window picked, counted by name; a
 * stool and an apron for every window; and for cased windows the casing legs, the
 * head and the lining (2 legs + head inside the opening). Windows not picked yet
 * are still counted but add nothing else.
 */
export function windowTakeoff(windows: { name: string | null; widthIn: number; heightIn: number; cased?: boolean }[], o: WindowOptions) {
  const lines: AutoLine[] = [];
  const counts = new Map<string, number>();
  const legs: number[] = [];
  const heads: number[] = [];
  const lining: number[] = [];
  const stool: number[] = [];
  const apron: number[] = [];
  let unassigned = 0;
  let cased = 0;
  for (const w of windows) {
    if (!w.name) {
      unassigned++;
      continue;
    }
    counts.set(w.name, (counts.get(w.name) ?? 0) + 1);
    stool.push((w.widthIn + o.stoolExtraIn) / 12);
    apron.push((w.widthIn + o.apronExtraIn) / 12);
    if (w.cased !== false) {
      cased++;
      legs.push(w.heightIn / 12, w.heightIn / 12);
      heads.push(w.widthIn / 12);
      lining.push(w.heightIn / 12, w.heightIn / 12, w.widthIn / 12);
    }
  }
  for (const [name, n] of counts) lines.push({ key: `unit:${itemNameKey(name)}`, name, unit: "ea", qty: n, category: "Windows", waste: false });
  lines.push(
    ...trimLines([
      ...(o.casingItem.trim()
        ? [
            { key: "casing", item: o.casingItem, stickFt: o.casingStickFt, cutsFt: legs },
            { key: "head", item: o.headItem.trim() || o.casingItem, stickFt: o.headItem.trim() ? o.headStickFt : o.casingStickFt, cutsFt: heads },
          ]
        : []),
      { key: "lining", item: o.liningItem, stickFt: o.liningStickFt, cutsFt: lining },
      { key: "stool", item: WINDOW_STOOL_ITEM, stickFt: o.stoolStickFt, cutsFt: stool },
      { key: "apron", item: o.apronItem, stickFt: o.apronStickFt, cutsFt: apron },
    ]),
  );
  return { lines, windows: windows.length, unassigned, cased };
}

/** "Trim — casing: 1x4 · head: 1x6 · lining: 1x6 primed · stool +6" · apron: 1x4" */
export function windowSummary(o: WindowOptions) {
  const parts = [
    o.casingItem && `casing: ${o.casingItem}`,
    o.casingItem && o.headItem && `head: ${o.headItem}`,
    o.liningItem && `lining (cased): ${o.liningItem}`,
    `stool +${num0(o.stoolExtraIn)}"`,
    o.apronItem && `apron: ${o.apronItem}`,
  ].filter(Boolean);
  return `Trim — ${parts.join(" · ")}`;
}

/** "Casing: 1x4, 1x6 head, both sides, 7' sticks" */
export function doorSummary(o: DoorOptions) {
  if (!o.casingItem || o.casingSides <= 0) return "No casing";
  return `Casing: ${o.casingItem}${o.headItem ? `, ${o.headItem} head` : ""}, ${o.casingSides === 2 ? "both sides" : "1 side"}${o.casingStickFt > 0 ? `, ${num0(o.casingStickFt)}' sticks` : ", by the foot"}`;
}

/** "2-ply 2x10 headers (+3") · 2 king + 2 jack 2x4 studs (92-5/8" precut)" */
export function openingSummary(header: string | null, o: OpeningOptions) {
  const parts = [header ? `${o.headerPlies}-ply ${header} headers (+${num0(o.headerExtraIn)}")` : "no header"];
  if (o.kingStuds + o.jackStuds > 0) parts.push(`${o.kingStuds} king + ${o.jackStuds} jack ${o.studSize} studs (${studText(o.studLengthIn, o.studPrecut)})`);
  return parts.join(" · ");
}

/** 104.625, precut → 104-5/8" precut; 120, stock → 10' */
export function studText(lengthIn: number, precut: boolean) {
  return precut ? `${inchesText(lengthIn)} precut` : `${num0(lengthIn / 12)}'`;
}

function num0(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Items bought in whole units that several takeoffs use (plywood clips, a box of nails)
 * round up once on the job's total — not once per takeoff. The whole units go to the
 * takeoffs that need the most of them (largest remainder), so every line stays a whole
 * number and they add up to the job's total. Lines nobody else shares are unchanged.
 */
export function roundOncePerItem<T extends { roundKey?: string; raw?: number; quantity: number }>(lines: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const l of lines) if (l.roundKey && l.raw != null) groups.set(l.roundKey, [...(groups.get(l.roundKey) ?? []), l]);
  const fixed = new Map<T, number>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const total = Math.ceil(g.reduce((s, l) => s + l.raw!, 0) - 1e-9);
    const floors = g.map((l) => Math.floor(l.raw! + 1e-9));
    let left = total - floors.reduce((a, b) => a + b, 0);
    const byRemainder = g.map((l, i) => i).sort((a, b) => g[b].raw! - floors[b] - (g[a].raw! - floors[a]) || g[b].raw! - g[a].raw!);
    for (const i of byRemainder) {
      if (left <= 0) break;
      floors[i]++;
      left--;
    }
    g.forEach((l, i) => fixed.set(l, floors[i]));
  }
  return lines.map((l) => (fixed.has(l) ? { ...l, quantity: fixed.get(l)! } : l));
}
