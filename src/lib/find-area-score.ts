/**
 * Find area's score card: what people did with the rooms it found (AreaFindLog), read against what's on
 * their plans now — nobody has to check a plan. For each click that added an area, the area today is:
 *   - kept:    still there, the same outline — it was right;
 *   - split:   gone, and in its place pieces that add up to it (✂ Split) — right, but two rooms in one;
 *   - changed: still there, the outline moved — it was off;
 *   - removed: gone (Ctrl+Z, or deleted) — it was wrong;
 * and clicks that found no room are counted by why. Scored per version of the room finder
 * (ROOM_DETECT_VERSION), so a new version can be held up against the last.
 */

type Pt = [number, number];

export type FindLogRow = {
  version: string;
  ok: boolean;
  reason: string | null;
  outline: string | null;
  measurementId: string | null;
  sheetId: string;
  conditionId: string | null;
  ms: number | null;
  createdAt: Date;
};

/** A shape on a plan now (only `points` matter, plus where and when for spotting a split's pieces). */
export type ShapeNow = { id: string; sheetId: string; conditionId: string; points: string; createdAt: Date };

export type Outcome = "kept" | "split" | "changed" | "removed" | "no-room" | "not-saved";

export type VersionScore = {
  version: string;
  firstUsed: Date;
  lastUsed: Date;
  clicks: number;
  kept: number;
  split: number;
  changed: number;
  removed: number;
  noRoom: Record<string, number>;
  /** Kept or split, of the areas added (null with none). */
  rightShare: number | null;
  /** Of the clicks, the share that found a room. */
  foundShare: number;
  /** Slowest of the usual clicks: 9 in 10 took this long or less (ms). */
  p90Ms: number | null;
};

export function readPoints(json: string | null): Pt[] {
  try {
    const p = JSON.parse(json ?? "[]");
    const list = Array.isArray(p) ? p : (p?.points ?? []);
    return Array.isArray(list) ? list.filter((q: unknown): q is Pt => Array.isArray(q) && q.length >= 2) : [];
  } catch {
    return [];
  }
}

const sameOutline = (a: Pt[], b: Pt[]) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.5 && Math.abs(p[1] - b[i][1]) < 0.5);

export function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function inside(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const centroid = (p: Pt[]): Pt => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/**
 * Whether a removed area was split: shapes added after it with the same takeoff on the same sheet,
 * inside its outline, that between them make up its area (to 2%).
 */
function wasSplit(row: FindLogRow, outline: Pt[], later: ShapeNow[]): boolean {
  const whole = polygonArea(outline);
  if (!(whole > 0)) return false;
  const pieces = later
    .filter((m) => m.sheetId === row.sheetId && m.conditionId === row.conditionId && m.createdAt >= row.createdAt)
    .map((m) => readPoints(m.points))
    .filter((p) => p.length >= 3 && inside(centroid(p), outline));
  if (pieces.length < 2) return false;
  const sum = pieces.reduce((s, p) => s + polygonArea(p), 0);
  return Math.abs(sum - whole) <= 0.02 * whole;
}

export function outcomeOf(row: FindLogRow, now: Map<string, ShapeNow>, onSheets: ShapeNow[]): Outcome {
  if (!row.ok) return "no-room";
  if (!row.measurementId) return "not-saved";
  const cur = now.get(row.measurementId);
  const found = readPoints(row.outline);
  if (cur) return sameOutline(found, readPoints(cur.points)) ? "kept" : "changed";
  return wasSplit(row, found, onSheets) ? "split" : "removed";
}

/** The score for each version, newest first. `shapes`: the shapes now on the sheets the rows are on. */
export function scoreByVersion(rows: FindLogRow[], shapes: ShapeNow[]): VersionScore[] {
  const now = new Map(shapes.map((m) => [m.id, m]));
  const byVersion = new Map<string, FindLogRow[]>();
  for (const r of rows) byVersion.set(r.version, [...(byVersion.get(r.version) ?? []), r]);
  const out: VersionScore[] = [];
  for (const [version, list] of byVersion) {
    const s: VersionScore = {
      version,
      firstUsed: list.reduce((d, r) => (r.createdAt < d ? r.createdAt : d), list[0].createdAt),
      lastUsed: list.reduce((d, r) => (r.createdAt > d ? r.createdAt : d), list[0].createdAt),
      clicks: list.length,
      kept: 0,
      split: 0,
      changed: 0,
      removed: 0,
      noRoom: {},
      rightShare: null,
      foundShare: 0,
      p90Ms: null,
    };
    for (const r of list) {
      const o = outcomeOf(r, now, shapes);
      if (o === "no-room") s.noRoom[r.reason ?? "?"] = (s.noRoom[r.reason ?? "?"] ?? 0) + 1;
      else if (o !== "not-saved") s[o]++;
    }
    const added = s.kept + s.split + s.changed + s.removed;
    s.rightShare = added ? (s.kept + s.split) / added : null;
    s.foundShare = list.filter((r) => r.ok).length / list.length;
    const ms = list.map((r) => r.ms).filter((m): m is number => m != null).sort((a, b) => a - b);
    s.p90Ms = ms.length ? ms[Math.min(ms.length - 1, Math.floor(0.9 * ms.length))] : null;
    out.push(s);
  }
  return out.sort((a, b) => b.firstUsed.getTime() - a.firstUsed.getTime());
}

/** Fewer added areas than this and a version's score is too early to read. */
export const ENOUGH_TO_SCORE = 20;

/** Whether `newer` scores worse than `older`: more than 5 points fewer right, with enough of both to say. */
export function scoresWorse(newer: VersionScore, older: VersionScore): boolean {
  const n = newer.kept + newer.split + newer.changed + newer.removed;
  const o = older.kept + older.split + older.changed + older.removed;
  if (n < ENOUGH_TO_SCORE || o < ENOUGH_TO_SCORE || newer.rightShare == null || older.rightShare == null) return false;
  return newer.rightShare < older.rightShare - 0.05 - 1e-9;
}
