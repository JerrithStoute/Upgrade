/**
 * Span tables: which joist or rafter size a span calls for.
 *
 * Two kinds:
 *  - your own: "up to 12' → 2x6, up to 16' → 2x8", and past the last row a specialty member
 *    (TJI, LVL) if you name one;
 *  - code: figured the way the IRC span tables (and the AWC span tables behind them) are —
 *    the No. 2 design values for the species you buy (NDS), the code's floor / ceiling / roof
 *    loads and deflection limits, at the takeoff's spacing. Bending, deflection and shear are
 *    checked and the shortest wins, to the nearest inch as the tables give it. Check a few against your code book;
 *    your local code or engineer has the last word.
 *
 * Plain numbers in, plain numbers out (no database) — so it can be tested on its own.
 */

export type SpanUse = "FLOOR" | "CEILING" | "RAFTER";
export const SPAN_USES: { key: SpanUse; label: string }[] = [
  { key: "FLOOR", label: "Floor joists" },
  { key: "CEILING", label: "Ceiling joists" },
  { key: "RAFTER", label: "Rafters" },
];

/** No. 2 visually graded dimension lumber (NDS Supplement Tables 4A / 4B): bending, shear, stiffness in psi. */
export type Species = { key: string; label: string; fb: number | Record<string, number>; fv: number; e: number; sizeFactor: boolean };
export const SPECIES: Species[] = [
  { key: "SPF2", label: "Spruce-Pine-Fir #2", fb: 875, fv: 135, e: 1_400_000, sizeFactor: true },
  { key: "DFL2", label: "Douglas Fir-Larch #2", fb: 900, fv: 180, e: 1_600_000, sizeFactor: true },
  { key: "HF2", label: "Hem-Fir #2", fb: 850, fv: 150, e: 1_300_000, sizeFactor: true },
  // Southern Pine's values are given size by size (the size factor is built in).
  { key: "SP2", label: "Southern Pine #2", fb: { "2x4": 1100, "2x6": 1000, "2x8": 925, "2x10": 800, "2x12": 750 }, fv: 175, e: 1_400_000, sizeFactor: false },
];

/** The code's design loads (psf), deflection limit (span ÷ n) and load-duration factor. */
export type SpanLoad = { key: string; use: SpanUse; label: string; live: number; dead: number; deflection: number; duration: number };
export const SPAN_LOADS: SpanLoad[] = [
  { key: "FLOOR40", use: "FLOOR", label: "Living areas — 40 psf live, 10 dead, L/360", live: 40, dead: 10, deflection: 360, duration: 1 },
  { key: "FLOOR30", use: "FLOOR", label: "Sleeping areas — 30 psf live, 10 dead, L/360", live: 30, dead: 10, deflection: 360, duration: 1 },
  { key: "CEIL10", use: "CEILING", label: "Attic, no storage — 10 psf live, 5 dead, L/240", live: 10, dead: 5, deflection: 240, duration: 1 },
  { key: "CEIL20", use: "CEILING", label: "Attic, limited storage — 20 psf live, 10 dead, L/240", live: 20, dead: 10, deflection: 240, duration: 1 },
  { key: "ROOF20", use: "RAFTER", label: "Roof live 20 psf, 10 dead, no ceiling attached (L/180)", live: 20, dead: 10, deflection: 180, duration: 1.25 },
  { key: "ROOF20C", use: "RAFTER", label: "Roof live 20 psf, 10 dead, ceiling attached (L/240)", live: 20, dead: 10, deflection: 240, duration: 1.25 },
  { key: "SNOW30", use: "RAFTER", label: "Ground snow 30 psf, 10 dead, no ceiling attached (L/180)", live: 30, dead: 10, deflection: 180, duration: 1.15 },
  { key: "SNOW50", use: "RAFTER", label: "Ground snow 50 psf, 10 dead, no ceiling attached (L/180)", live: 50, dead: 10, deflection: 180, duration: 1.15 },
];

/** Dimension lumber the code tables cover: actual depth (in), all 1-1/2" thick. */
const LUMBER: [string, number][] = [
  ["2x4", 3.5],
  ["2x6", 5.5],
  ["2x8", 7.25],
  ["2x10", 9.25],
  ["2x12", 11.25],
];
/** Size factor for bending (NDS Table 4A), 2" thick. */
const SIZE_FACTOR: Record<string, number> = { "2x4": 1.5, "2x6": 1.3, "2x8": 1.2, "2x10": 1.1, "2x12": 1.0 };
/** Joists and rafters 24" o.c. or closer share load (repetitive member factor). */
const REPETITIVE = 1.15;

/** The sizes a code table picks from, smallest first (2x4 only for ceiling joists). */
export function codeSizes(use: SpanUse) {
  return LUMBER.map(([n]) => n).filter((n) => use === "CEILING" || n !== "2x4");
}

/**
 * Longest allowed span (feet, down to the inch) for a size at a spacing, by the code's method.
 * Null for a size, species or load it doesn't know.
 */
export function codeSpanFt(size: string, speciesKey: string, loadKey: string, spacingIn: number): number | null {
  const sp = SPECIES.find((s) => s.key === speciesKey);
  const load = SPAN_LOADS.find((l) => l.key === loadKey);
  const depth = LUMBER.find(([n]) => n === size)?.[1];
  if (!sp || !load || !depth || !(spacingIn > 0)) return null;
  const b = 1.5;
  const S = (b * depth ** 2) / 6;
  const I = (b * depth ** 3) / 12;
  const A = b * depth;
  const baseFb = typeof sp.fb === "number" ? sp.fb : sp.fb[size];
  if (!baseFb) return null;
  const fb = baseFb * (sp.sizeFactor ? SIZE_FACTOR[size] : 1) * REPETITIVE * load.duration;
  const fv = sp.fv * load.duration;
  // Loads on one member, pounds per inch of length.
  const tributaryFt = spacingIn / 12;
  const wTotal = ((load.live + load.dead) * tributaryFt) / 12;
  const wLive = (load.live * tributaryFt) / 12;
  const bending = Math.sqrt((8 * fb * S) / wTotal);
  const deflection = Math.cbrt((384 * sp.e * I) / (5 * load.deflection * wLive));
  const shear = (2 * ((2 / 3) * fv * A)) / wTotal;
  const inches = Math.min(bending, deflection, shear);
  return Math.round(inches) / 12;
}

/** A span table as saved: your own rows, or the code with a species and load. */
export type SpanTableSpec = {
  use: SpanUse;
  source: "CUSTOM" | "CODE";
  species: string;
  load: string;
  rows: { upToFt: number; size: string }[];
  /** Past the table (longer than any row or code size spans): this member, e.g. "TJI 210". */
  overSize: string | null;
};

export type SizePick = { size: string | null; over: boolean; reason: string };

/** The size a span calls for. `over` when it's past the table (the specialty member, or none set). */
export function pickSize(t: SpanTableSpec, spanFt: number, spacingIn: number): SizePick {
  const ft = (n: number) => `${Math.floor(n)}'-${Math.round((n % 1) * 12)}"`;
  if (t.source === "CUSTOM") {
    const rows = [...t.rows].filter((r) => r.size.trim() && r.upToFt > 0).sort((a, b) => a.upToFt - b.upToFt);
    const row = rows.find((r) => spanFt <= r.upToFt + 1e-9);
    if (row) return { size: row.size, over: false, reason: `${ft(spanFt)} span — up to ${ft(row.upToFt)}: ${row.size}` };
    const last = rows[rows.length - 1];
    return { size: t.overSize, over: true, reason: `${ft(spanFt)} span — past ${last ? ft(last.upToFt) : "the table"}${t.overSize ? `: ${t.overSize}` : ""}` };
  }
  for (const size of codeSizes(t.use)) {
    const max = codeSpanFt(size, t.species, t.load, spacingIn);
    if (max != null && spanFt <= max + 1e-9) return { size, over: false, reason: `${ft(spanFt)} span — ${size} spans up to ${ft(max)} at ${spacingIn}" o.c.` };
  }
  return { size: t.overSize, over: true, reason: `${ft(spanFt)} span — longer than a 2x12 spans at ${spacingIn}" o.c.${t.overSize ? `: ${t.overSize}` : ""}` };
}

/** A saved table's JSON rows, cleaned up. */
export function parseSpanRows(json: string | null | undefined): SpanTableSpec["rows"] {
  try {
    const v = JSON.parse(json ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .map((r) => ({ upToFt: Number(r?.upToFt), size: String(r?.size ?? "").trim() }))
      .filter((r) => r.upToFt > 0 && r.size)
      .sort((a, b) => a.upToFt - b.upToFt);
  } catch {
    return [];
  }
}

/** The table as `pickSize` wants it, from its saved row. */
export function spanSpec(row: { use: string; source: string; species: string; load: string; rows: string; overSize: string | null }): SpanTableSpec {
  return {
    use: (SPAN_USES.some((u) => u.key === row.use) ? row.use : "FLOOR") as SpanUse,
    source: row.source === "CODE" ? "CODE" : "CUSTOM",
    species: row.species,
    load: row.load,
    rows: parseSpanRows(row.rows),
    overSize: row.overSize?.trim() || null,
  };
}

type P = [number, number];

/**
 * The longest stretch any joist runs without support, in the units given. A joist is held up at
 * its two ends (the area's edges) and wherever a support — a wall or beam you traced — crosses
 * it. The north joist may only reach a closet wall; the south one runs exterior wall to the wall
 * behind the stove: the longest of all of them is the span that sizes the area.
 */
export function longestUnsupported(members: [P, P][], supports: [P, P][], onWall = 0) {
  let longest = 0;
  for (const [a, b] of members) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) continue;
    if (onWall > 0 && lyingOn([a, b], supports, onWall)) continue; // sitting on a wall the whole way: held up all along
    const at = [0, len];
    for (const [c, d] of supports) {
      const ex = d[0] - c[0];
      const ey = d[1] - c[1];
      const cross = dx * ey - dy * ex;
      if (Math.abs(cross) < 1e-9 * len * Math.hypot(ex, ey)) continue; // parallel: it never holds this joist up
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / cross; // along the joist, 0…1
      const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / cross; // along the support, 0…1
      // A wall stopping just shy of the joist (where its traced line ends) still counts — 1% of its length.
      if (t > 0 && t < 1 && u >= -0.01 && u <= 1.01) at.push(t * len);
    }
    at.sort((x, y) => x - y);
    for (let i = 1; i < at.length; i++) longest = Math.max(longest, at[i] - at[i - 1]);
  }
  return longest;
}

/** A joist lying along a wall (within `tol`) for most of its length. */
function lyingOn([a, b]: [P, P], supports: [P, P][], tol: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  let covered = 0;
  for (const [c, d] of supports) {
    const off = (p: P) => Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
    if (off(c) > tol || off(d) > tol) continue;
    const along = (p: P) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
    covered += Math.max(0, Math.min(len, Math.max(along(c), along(d))) - Math.max(0, Math.min(along(c), along(d))));
  }
  return covered >= 0.8 * len;
}

/**
 * Each joist's size in one area: what its own unsupported span calls for. A joist lying on a wall
 * the whole way has no span of its own and takes the size of the joists beside it.
 */
export function memberSizes(members: [P, P][], supports: [P, P][], sizeFor: (span: number) => string | null, onWall = 0) {
  const spans = members.map((m) => longestUnsupported([m], supports, onWall));
  const sizes: (string | null | undefined)[] = spans.map((span) => (span === 0 ? undefined : sizeFor(span)));
  // On-wall joists go with the group before them (or after, at the start).
  for (let i = 0; i < sizes.length; i++) if (sizes[i] === undefined && i > 0) sizes[i] = sizes[i - 1];
  for (let i = sizes.length - 1; i >= 0; i--) if (sizes[i] === undefined) sizes[i] = i + 1 < sizes.length ? sizes[i + 1] : sizeFor(0);
  return { sizes: sizes as (string | null)[], spans };
}

/**
 * Within one area, the joists side by side grouped by the size their own unsupported span
 * calls for — e.g. nine 2x8s held up by a wall partway, then four 2x10s that run the whole
 * way. Each group: its size, its longest span, how many joists, and its middle joist (for a label).
 */
export function sizeBands(members: [P, P][], supports: [P, P][], sizeFor: (span: number) => string | null, onWall = 0) {
  const { sizes, spans } = memberSizes(members, supports, sizeFor, onWall);
  const bands: { size: string | null; span: number; count: number; members: [P, P][] }[] = [];
  members.forEach((m, i) => {
    const last = bands[bands.length - 1];
    if (last && last.size === sizes[i]) {
      last.count++;
      last.span = Math.max(last.span, spans[i]);
      last.members.push(m);
    } else bands.push({ size: sizes[i], span: spans[i], count: 1, members: [m] });
  });
  return bands.map(({ members: ms, ...b }) => ({ ...b, middle: ms[Math.floor(ms.length / 2)] }));
}
