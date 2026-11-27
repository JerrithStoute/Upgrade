/**
 * Room finder: click inside a room on a plan and get its floor outline — to the inside face of the
 * walls around it, closed straight across the doors.
 *
 * Works on the line work of a CAD-made PDF (the same lines Find walls and Snap use), in page units:
 *  1. The walls near the click: every pair of parallel lines a wall's thickness apart with nothing
 *     drawn between them, whatever the size (2x4, 2x6, brick, a hatched stud space).
 *  2. Door openings are closed: a gap of up to a door's width in a straight wall, or between a wall's
 *     end and the wall it points at — and a wider one (a window, a slider) when it's drawn across.
 *  3. The floor is filled out from the click on a fine grid; anything standing inside the room (an
 *     island, furniture, a label) is ignored — the floor runs under it.
 *  4. Its edge is traced and each side snapped onto the wall face it runs along, so the area is the
 *     drawn one, not the grid's.
 * A room open to another (no wall between, a wide opening) comes back as both — split it after.
 *
 * Plain numbers in, plain numbers out (no database, no screens), like the wall finder.
 */
import { DEG, bucketOf, distToSeg, grid, toLine, type Line, type Pt } from "../wall-detect";

/** Which rules the room finder runs: saved with each Find area click (AreaFindLog). Change it with them. */
export const ROOM_DETECT_VERSION = "2026-11-24g";

export type RoomFindOptions = {
  /** The sheet's scale: page units per real foot. */
  unitsPerFoot: number;
  /** Thinnest and thickest wall (inches, default 2–14). */
  minThicknessIn?: number;
  maxThicknessIn?: number;
  /** Widest door opening closed with nothing drawn across it, in feet (default 6 — double doors). */
  maxDoorFt?: number;
  /** Widest opening closed when it's drawn across (a window, a slider), in feet (default 20). */
  maxOpeningFt?: number;
  /** How far from the click a room can reach, in feet (default 60): past that it's not closed in. */
  reachFt?: number;
  /**
   * The sheet's filled shapes (color, outline rings in page units). A plan that fills its walls solid —
   * one shade of gray, say — marks them: then only those are walls.
   */
  fills?: { color: string; rings: number[][] }[];
  /**
   * The sheet's door swings (hinge, width — from the PDF's quarter circles). With them, an opening
   * wider than 3' is closed only where a door swings in it (or something's drawn across it): an arch, a
   * cased opening, a shower's open side is part of the room. Without any, every opening up to a door's
   * width is closed.
   */
  doors?: { x: number; y: number; r: number; a?: [number, number]; b?: [number, number] }[];
  /** False: a room that runs on outside isn't closed in where it got out (see 3b) — it's "open". */
  closeHouse?: boolean;
  /** (Internal: false closes every opening up to a door's width, swing or not — see `doors`.) */
  passages?: boolean;
  /** How long a click may take, in milliseconds (default 2500), before the sheet counts as unreadable. */
  budgetMs?: number;
  /** (Internal: hand back the wall pieces found — before any are sorted out — and stop.) */
  piecesOnly?: (bands: { half: number; s0: number; s1: number }[]) => void;
  /** (Internal: hand back what's outside the house around the click — see `houseOutsideMap` — and stop.) */
  outsideOnly?: (map: OutsideMap) => void;
  /**
   * A fence the floor can't go past (the room AI's room, a little bigger — see room-ai): pixel (i, j) of `cells`
   * (W×H, 1 = inside) is plan point (ox + i/S, oy + j/S). Inside it the room is found as always — walls, door
   * closings, sides onto wall faces — so only where nothing's drawn does the fence make the edge.
   */
  fence?: { ox: number; oy: number; S: number; W: number; H: number; cells: Uint8Array };
  /**
   * The user's rule (2026-11-22): a room stops at the wall's face, but across an opening between two rooms (a door,
   * a cased opening, nothing drawn) it runs to the MIDDLE of the wall — half the opening's strip each, nothing lost
   * under the door, nothing counted twice. Doors to the outside stay at the face. Default on; false = to the face.
   */
  middle?: boolean;
  /**
   * (Test only.) Close every opening with no door too. Not used: on the user's rooms it cut bathrooms and halls across
   * at wall stubs (a shower's half wall, a vanity's nook) — 82 rooms broken, 19 fixed (2026-11-22).
   */
  splitOpenings?: boolean;
  /** (Test.) Openings up to this wide (feet) with no door are closed too (default 3). */
  splitUpToFt?: number;
};

/**
 * What's outside the house on a sheet, on a grid: `out[j * W + i]` is 1 for the cell at
 * (x0 + (i + ½)·cell, y0 + (j + ½)·cell). The yard and a porch or patio (open to it, 4' wide and more) are
 * outside; rooms, and a garage behind its door, aren't. The same as Find area uses to keep a room in the house.
 */
export type OutsideMap = { x0: number; y0: number; cell: number; W: number; H: number; out: Uint8Array };

const outsideMaps = new WeakMap<object, Map<number, OutsideMap | null>>();
/**
 * The sheet's outside-the-house map (see `OutsideMap`), worked out once per sheet — a second or so on a
 * big sheet, so ahead of the clicks (Find walls reads it). Null when the sheet can't be read in `budgetMs`.
 */
export function houseOutsideMap(segments: Float32Array | number[], opts: Pick<RoomFindOptions, "unitsPerFoot" | "fills" | "budgetMs">): OutsideMap | null {
  const upf = opts.unitsPerFoot;
  const byUpf = outsideMaps.get(segments) ?? new Map<number, OutsideMap | null>();
  outsideMaps.set(segments, byUpf);
  const known = byUpf.get(upf);
  if (known !== undefined) return known;
  if (!(upf > 0) || segments.length < 4 || unreadable.has(segments)) return null;
  let xs = [Infinity, -Infinity];
  let ys = [Infinity, -Infinity];
  for (let i = 0; i + 1 < segments.length; i += 2) {
    xs = [Math.min(xs[0], segments[i]), Math.max(xs[1], segments[i])];
    ys = [Math.min(ys[0], segments[i + 1]), Math.max(ys[1], segments[i + 1])];
  }
  const deadline = performance.now() + (opts.budgetMs ?? 8000);
  let map: OutsideMap | null = null;
  try {
    findRoomOnce(segments, [(xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2], {
      unitsPerFoot: upf,
      fills: opts.fills,
      reachFt: Math.max(xs[1] - xs[0], ys[1] - ys[0]) / 2 / upf + 10,
      outsideOnly: (m) => (map = m),
    }, deadline);
  } catch (e) {
    if (!(e instanceof TooSlow)) throw e;
  }
  byUpf.set(upf, map);
  return map;
}

/**
 * The wall thicknesses a sheet uses (inches, to ¼), worked out once per sheet: every pair of long
 * the wall pieces a click finds, over the whole sheet, by thickness; the thicknesses from 2½" to 9" with
 * 20' or more of them (or a good share of the commonest). `top`: how much there is of the commonest (page units).
 */
const thicknessCache = new WeakMap<object, Map<number, { used: number[]; top: number }>>();
function sheetWallThicknesses(segments: Float32Array | number[], upf: number, deadline = Infinity) {
  const byUpf = thicknessCache.get(segments) ?? new Map<number, { used: number[]; top: number }>();
  thicknessCache.set(segments, byUpf);
  const known = byUpf.get(upf);
  if (known) return known;
  // The same wall pieces a click finds, over the whole sheet.
  let xs = [Infinity, -Infinity];
  let ys = [Infinity, -Infinity];
  for (let i = 0; i + 1 < segments.length; i += 2) {
    xs = [Math.min(xs[0], segments[i]), Math.max(xs[1], segments[i])];
    ys = [Math.min(ys[0], segments[i + 1]), Math.max(ys[1], segments[i + 1])];
  }
  const inch = upf / 12;
  const byThickness = new Map<number, number>();
  // (Within the click's own time: a sheet too crowded to sort out in time is unreadable.)
  findRoom(segments, [(xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2], {
    unitsPerFoot: upf,
    budgetMs: deadline - performance.now(),
    reachFt: Math.max(xs[1] - xs[0], ys[1] - ys[0]) / upf + 10,
    piecesOnly: (bands) => {
      for (const w of bands) {
        if (w.s1 - w.s0 < upf) continue;
        const t = Math.round(((2 * w.half) / inch) * 4) / 4;
        byThickness.set(t, (byThickness.get(t) ?? 0) + (w.s1 - w.s0));
      }
    },
  });
  const wallish = [...byThickness].filter(([t]) => t >= 2.5 && t <= 9);
  const top = Math.max(0, ...wallish.map(([, len]) => len));
  const result = { used: wallish.filter(([, len]) => len >= 20 * upf || len >= 0.08 * top).map(([t]) => t), top };
  byUpf.set(upf, result);
  return result;
}

/** A filled shape: its outline rings ([x, y, x, y, …]) and its box [left, top, right, bottom]. */
export type FilledShape = { rings: number[][]; box: [number, number, number, number] };

/** A sheet's filled shapes by color, with their boxes — paper (white or nearly) left out. */
const byColorCache = new WeakMap<object, Map<string, FilledShape[]>>();
function fillsByColor(fills: { color: string; rings: number[][] }[]): Map<string, FilledShape[]> {
  const known = byColorCache.get(fills);
  if (known) return known;
  const out = new Map<string, FilledShape[]>();
  byColorCache.set(fills, out);
  for (const f of fills) {
    const v = parseInt(f.color.slice(1), 16);
    if (!(v >= 0) || Math.min(v >> 16, (v >> 8) & 255, v & 255) >= 0xf8) continue;
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of f.rings)
      for (let i = 0; i < r.length; i += 2) {
        box[0] = Math.min(box[0], r[i]);
        box[1] = Math.min(box[1], r[i + 1]);
        box[2] = Math.max(box[2], r[i]);
        box[3] = Math.max(box[3], r[i + 1]);
      }
    const list = out.get(f.color) ?? [];
    list.push({ rings: f.rings, box });
    out.set(f.color, list);
  }
  return out;
}

/** Whether (x, y) is inside one of `shapes` (even-odd across a shape's rings: a hole is outside). */
function inFilled(shapes: FilledShape[], x: number, y: number) {
  return filledAt(shapes, x, y) >= 0;
}

/** Which of `shapes` (x, y) is inside, or -1. */
// Shapes filed by where they are (a grid of 24-unit cells), once per list — a sheet can have thousands.
const shapeGrids = new WeakMap<FilledShape[], Map<string, number[]>>();
const CELL = 24;
function shapeGrid(shapes: FilledShape[]) {
  const known = shapeGrids.get(shapes);
  if (known) return known;
  const grid = new Map<string, number[]>();
  shapes.forEach(({ box }, k) => {
    for (let i = Math.floor(box[0] / CELL); i <= Math.floor(box[2] / CELL); i++)
      for (let j = Math.floor(box[1] / CELL); j <= Math.floor(box[3] / CELL); j++) {
        const key = `${i}:${j}`;
        const list = grid.get(key);
        if (list) list.push(k);
        else grid.set(key, [k]);
      }
  });
  shapeGrids.set(shapes, grid);
  return grid;
}

function filledAt(shapes: FilledShape[], x: number, y: number) {
  for (const k of shapeGrid(shapes).get(`${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`) ?? []) {
    const { rings, box } = shapes[k];
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    let inside = false;
    for (const r of rings)
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    if (inside) return k;
  }
  return -1;
}


export type RoomFindResult = { ok: true; outline: Pt[]; areaSf: number } | { ok: false; reason: "no-scale" | "in-wall" | "open" | "too-small" | "unreadable" };

/** Thrown inside the room finder when it runs past its time: the sheet is drawn in a way it can't read. */
class TooSlow extends Error {}
/** Sheets found unreadable (their line work): every later click says so at once. */
const unreadable = new WeakSet<object>();

/** A wall (or a closed opening): its center line along u at offset rho on n, from s0 to s1, and half its thickness. */
type Band = { ang: number; ux: number; uy: number; nx: number; ny: number; rho: number; half: number; s0: number; s1: number };

const bandOf = (l: Line, rho: number, half: number, s0: number, s1: number): Band => ({ ang: l.ang, ux: l.ux, uy: l.uy, nx: l.nx, ny: l.ny, rho, half, s0, s1 });

export function findRoom(segments: Float32Array | number[], click: Pt, opts: RoomFindOptions): RoomFindResult {
  if (unreadable.has(segments)) return { ok: false, reason: "unreadable" };
  // A plan drawn some way it can't make sense of in a couple of seconds (a sheet thick with hatching, words
  // and symbols drawn as lines) isn't worked at any longer: it says so, and the room is traced by hand.
  const deadline = performance.now() + (opts.budgetMs ?? 2500);
  try {
    const once = (more: Partial<RoomFindOptions>) => findRoomOnce(segments, click, { ...opts, ...more, closeHouse: false }, deadline);
    let r = once({});
    // Leaving the passages open (see `doors`) joins rooms, never the outside: if the room ran out to the
    // outside that way, it's found again with every opening closed (the doors still shut theirs).
    if (!r.ok && r.reason === "open" && opts.doors?.length) r = once({ passages: false });
    // Still out: the house is closed where it got out (3b) — the last thing tried.
    if (!r.ok && r.reason === "open" && opts.closeHouse !== false && !opts.piecesOnly) r = findRoomOnce(segments, click, { ...opts, passages: opts.doors?.length ? false : opts.passages }, deadline);
    return r;
  } catch (e) {
    if (!(e instanceof TooSlow)) throw e;
    unreadable.add(segments);
    return { ok: false, reason: "unreadable" };
  }
}

/**
 * Reads a sheet ahead of the first click — the sheet-wide work every click shares (the wall thicknesses
 * it uses, its filled shapes sorted out), kept for the same `segments`/`fills` — so the clicks after
 * come back at once. Given longer than a click (`budgetMs`, default 8000): nobody's waiting on it. False
 * when the sheet can't be read in that time (then every click says so at once).
 */
export function prepareRoomFind(segments: Float32Array | number[], opts: Pick<RoomFindOptions, "unitsPerFoot" | "fills" | "budgetMs">): boolean {
  if (unreadable.has(segments)) return false;
  if (!(opts.unitsPerFoot > 0) || segments.length < 4) return true;
  if (opts.fills?.length) for (const shapes of fillsByColor(opts.fills).values()) shapeGrid(shapes);
  sheetWallThicknesses(segments, opts.unitsPerFoot, performance.now() + (opts.budgetMs ?? 8000));
  return !unreadable.has(segments);
}

function findRoomOnce(segments: Float32Array | number[], click: Pt, opts: RoomFindOptions, deadline = Infinity): RoomFindResult {
  let ticks = 0;
  /** Out of time? (Looked at every so often in the long loops.) */
  const check = (every = 1) => {
    if (++ticks % every === 0 && performance.now() > deadline) throw new TooSlow();
  };
  const upf = opts.unitsPerFoot;
  if (!(upf > 0)) return { ok: false, reason: "no-scale" };
  const inch = upf / 12;
  const tMin = (opts.minThicknessIn ?? 2) * inch;
  const tMax = (opts.maxThicknessIn ?? 14) * inch;
  const maxDoor = (opts.maxDoorFt ?? 6) * upf;
  const maxOpening = (opts.maxOpeningFt ?? 20) * upf;
  const reach = (opts.reachFt ?? 60) * upf;
  const [cx, cy] = click;
  const box = { x0: cx - reach, y0: cy - reach, x1: cx + reach, y1: cy + reach };

  // The lines around the click (specks dropped).
  let lines: Line[] = [];
  // (A fan: six or more lines from one point out to six or more places, each within 3° of the next — what a PDF
  // leaves of a sink or tub shaded as a fan of thin triangles. Never drawn by hand, never a wall: Chirafis,
  // 2026-11-24, where they ran slanted "walls" through the master bath and the kitchen island. Only the fan's own
  // lines go — walls meeting at that point stay, even drawn a little off square (Rothschild).)
  const ends = new Map<string, { l: Line; a: number; far: string }[]>();
  for (let i = 0; i + 3 < segments.length; i += 4) {
    const [x1, y1, x2, y2] = [segments[i], segments[i + 1], segments[i + 2], segments[i + 3]];
    if (Math.max(x1, x2) < box.x0 || Math.min(x1, x2) > box.x1 || Math.max(y1, y2) < box.y0 || Math.min(y1, y2) > box.y1) continue;
    const l = toLine(x1, y1, x2, y2);
    if (!l || l.s1 - l.s0 < inch) continue;
    lines.push(l);
    for (const [px, py, qx, qy] of [[x1, y1, x2, y2], [x2, y2, x1, y1]]) {
      const k = `${Math.round(px * 20)},${Math.round(py * 20)}`;
      const list = ends.get(k);
      const e = { l, a: Math.atan2(qy - py, qx - px), far: `${Math.round(qx * 5)},${Math.round(qy * 5)}` };
      if (list) list.push(e);
      else ends.set(k, [e]);
    }
  }
  {
    const fan = new Set<Line>();
    for (const list of ends.values()) {
      if (list.length < 6) continue;
      const es = list.slice().sort((p, q) => p.a - q.a);
      // (Started after the widest gap, so no cluster runs across the ±180° seam.)
      let w = 0, wide = es[0].a + 2 * Math.PI - es[es.length - 1].a;
      for (let i = 1; i < es.length; i++) if (es[i].a - es[i - 1].a > wide) [wide, w] = [es[i].a - es[i - 1].a, i];
      const ring = [...es.slice(w), ...es.slice(0, w)];
      const turn = (i: number) => (ring[i].a - ring[i - 1].a + 2 * Math.PI) % (2 * Math.PI);
      for (let i = 0; i < ring.length; ) {
        let j = i + 1;
        while (j < ring.length && turn(j) <= 3 * DEG) j++;
        const run = ring.slice(i, j);
        const ways = run.filter((e, k) => k === 0 || (e.a - run[k - 1].a + 2 * Math.PI) % (2 * Math.PI) > 0.05 * DEG).length;
        if (new Set(run.map((e) => e.far)).size >= 6 && ways >= 5) for (const e of run) fan.add(e.l);
        i = j;
      }
    }
    // (The same shading's thin slivers between fans: a line at an odd angle — not square, not 45° — that ends at
    // a fan's outer end.)
    if (fan.size) {
      const rim = new Set<string>();
      for (const l of fan) for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) rim.add(`${Math.round(x)},${Math.round(y)}`);
      const atRim = (x: number, y: number) => {
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (rim.has(`${Math.round(x) + dx},${Math.round(y) + dy}`)) return true;
        return false;
      };
      for (const l of lines)
        if (!fan.has(l) && Math.abs(Math.sin(4 * l.ang)) > Math.sin(12 * DEG) && (atRim(l.x1, l.y1) || atRim(l.x2, l.y2))) fan.add(l);
      lines = lines.filter((l) => !fan.has(l));
    }
  }
  // The same lines filed by direction and by where they lie along it (in 4' stretches), so a piece of wall
  // is only compared with the lines beside it — not every parallel line across the sheet.
  const TILE = 4 * upf;
  const tiles = new Map<string, Line[]>();
  for (const l of lines) {
    const k = bucketOf(l.ang);
    for (let t = Math.floor(l.s0 / TILE); t <= Math.floor(l.s1 / TILE); t++) {
      const key = `${k}:${t}`;
      const list = tiles.get(key);
      if (list) list.push(l);
      else tiles.set(key, [l]);
    }
  }
  for (const list of tiles.values()) list.sort((a, b) => a.rho - b.rho);
  /** Lines parallel to `ang`, offset `lo`–`hi`, overlapping `s0`–`s1` along it (each once; stops past `limit`). */
  const parallelNear = (ang: number, lo: number, hi: number, s0: number, s1: number, limit = Infinity): Line[] => {
    const out: Line[] = [];
    const seen = new Set<Line>();
    const k = bucketOf(ang);
    for (const kk of [k - 1, k, k + 1]) {
      const kb = (kk + 180) % 180;
      for (let t = Math.floor(s0 / TILE); t <= Math.floor(s1 / TILE); t++) {
        const list = tiles.get(`${kb}:${t}`);
        if (!list) continue;
        let i = 0;
        let j = list.length;
        while (i < j) {
          const m = (i + j) >> 1;
          if (list[m].rho < lo) i = m + 1;
          else j = m;
        }
        for (; i < list.length && list[i].rho <= hi; i++) {
          const l = list[i];
          if (l.s1 < s0 || l.s0 > s1 || seen.has(l)) continue;
          seen.add(l);
          out.push(l);
          if (out.length > limit) return out;
        }
      }
    }
    return out;
  };
  const strokesNear = grid(lines, upf);

  const { dimension } = dimensionsIn(lines, strokesNear, upf);
  const isDimension = (l: Line) => dimension.has(l);

  // A label's box (or a small box standing on its own): two short sides the same length, closed across
  // at both ends, nothing inside. Its sides aren't a wall's faces — paired with each other, or with the
  // box stacked next to it. (A short piece of wall on a plan that hatches its walls is hatched inside.)
  const boxSides = new Map<Line, boolean>();
  const boxSide = (l: Line) => {
    const known = boxSides.get(l);
    if (known !== undefined) return known;
    let box = false;
    const len = l.s1 - l.s0;
    // (A window's frame, or a piece of wall between two windows, can be a small empty box too — but it
    // sits in a wall: the wall's long faces run alongside it or on past it, within a wall's thickness.
    // A label stands clear, but for the dimension it labels.)
    const inWallLine = () => {
      for (const m of parallelNear(l.ang, l.rho - tMax, l.rho + tMax, l.s0 - 8 * upf - inch, l.s1 + 8 * upf + inch)) {
        if (m === l || m.s1 - m.s0 < 2 * upf || isDimension(m)) continue;
        const covers = m.s0 <= l.s0 + inch && m.s1 >= l.s1 - inch;
        const before = m.s1 <= l.s0 + inch && l.s0 - m.s1 <= 8 * upf;
        const after = m.s0 >= l.s1 - inch && m.s0 - l.s1 <= 8 * upf;
        if (covers || before || after) return true;
      }
      return false;
    };
    if (len <= 4 * upf && !inWallLine())
      for (const m of parallelNear(l.ang, l.rho - 16 * inch, l.rho + 16 * inch, l.s0 - inch, l.s1 + inch)) {
        const d = m.rho - l.rho;
        if (m === l || Math.abs(d) < inch || Math.abs(m.s1 - m.s0 - len) > inch || Math.abs(m.s0 - l.s0) > inch) continue;
        const mid = l.rho + d / 2;
        const closedAt = (sv: number) => {
          const [x, y] = [l.ux * sv + l.nx * mid, l.uy * sv + l.ny * mid];
          return strokesNear(x, y, x, y).some((k) => Math.abs(Math.sin(k.ang - l.ang)) > Math.sin(80 * DEG) && Math.abs(k.s1 - k.s0 - Math.abs(d)) < inch && distToSeg(x, y, k) < 0.5 * inch);
        };
        if (!closedAt(l.s0) || !closedAt(l.s1)) continue;
        const [lo, hi] = d > 0 ? [l.rho, m.rho] : [m.rho, l.rho];
        const [mx, my] = [l.ux * ((l.s0 + l.s1) / 2) + l.nx * mid, l.uy * ((l.s0 + l.s1) / 2) + l.ny * mid];
        const r = Math.max(len, Math.abs(d)) / 2;
        const hatchedIn = strokesNear(mx - r, my - r, mx + r, my + r).some((k) => {
          const slant = Math.abs(Math.sin(k.ang - l.ang));
          if (slant < Math.sin(20 * DEG) || slant > Math.sin(75 * DEG)) return false;
          const sk = ((k.x1 + k.x2) / 2) * l.ux + ((k.y1 + k.y2) / 2) * l.uy;
          const ok = ((k.x1 + k.x2) / 2) * l.nx + ((k.y1 + k.y2) / 2) * l.ny;
          return sk > l.s0 && sk < l.s1 && ok > lo && ok < hi;
        });
        if (!hatchedIn) {
          box = true;
          break;
        }
      }
    boxSides.set(l, box);
    return box;
  };

  // 0. Stairs aren't floor: a flight is five or more treads — lines alike in length and direction,
  // spaced evenly 8"–13" apart. The whole flight is blocked off like a wall.
  const stairs: Band[] = [];
  const flights: { treads: Line[]; seed: boolean }[] = [];
  {
    const groups = new Map<string, Line[]>();
    for (const l of lines) {
      const len = l.s1 - l.s0;
      if (len < 2 * upf || len > 6 * upf) continue;
      const k = `${Math.round(l.ang / DEG) % 180}:${Math.round(len / inch / 2)}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(l);
    }
    for (const list of groups.values()) {
      if (list.length < 3) continue;
      list.sort((a, b) => a.rho - b.rho);
      let run: Line[] = [list[0]];
      const close = () => {
        if (run.length >= 3) flights.push({ treads: run, seed: run.length >= 5 });
        if (run.length >= 5) {
          const f = run[0];
          const [r0, r1] = [run[0].rho, run[run.length - 1].rho];
          const [s0, s1] = [Math.min(...run.map((l) => l.s0)), Math.max(...run.map((l) => l.s1))];
          // A band along the flight (across the treads): its center line runs down the middle.
          const mid = (s0 + s1) / 2;
          const [ax, ay] = [f.ux * mid + f.nx * r0, f.uy * mid + f.ny * r0];
          const [bx, by] = [f.ux * mid + f.nx * r1, f.uy * mid + f.ny * r1];
          const len = Math.hypot(bx - ax, by - ay);
          const ux = (bx - ax) / len;
          const uy = (by - ay) / len;
          let ang = Math.atan2(uy, ux);
          if (ang < 0) ang += Math.PI;
          const [nx, ny] = [-uy, ux];
          const sa = ax * ux + ay * uy;
          stairs.push({ ang, ux, uy, nx, ny, rho: ax * nx + ay * ny, half: (s1 - s0) / 2, s0: Math.min(sa, sa + len), s1: Math.max(sa, sa + len) });
        }
      };
      for (let i = 1; i < list.length; i++) {
        const prev = run[run.length - 1];
        const gap = list[i].rho - prev.rho;
        const step = run.length > 1 ? prev.rho - run[run.length - 2].rho : gap;
        const overlap = Math.min(prev.s1, list[i].s1) - Math.max(prev.s0, list[i].s0);
        if (gap >= 8 * inch && gap <= 13 * inch && Math.abs(gap - step) <= inch && overlap >= 0.8 * (prev.s1 - prev.s0)) run.push(list[i]);
        else if (gap < 0.5 * inch) continue;
        else {
          close();
          run = [list[i]];
        }
      }
      close();
    }
  }

  // A stair that turns: its other flights (three treads or more, near a flight of five) count too. Every
  // tread of a stair, and the railing and stringers its treads end against, is a barrier — the floor
  // can't get onto the stairs anywhere, and the room's edge follows the stair's own outline around a
  // landing or a turn.
  {
    const seeds = flights.filter((f) => f.seed);
    const gap = (a: Line, b: Line) =>
      Math.min(
        ...[
          [a.x1, a.y1],
          [a.x2, a.y2],
        ].flatMap(([x, y]) => [Math.hypot(x - b.x1, y - b.y1), Math.hypot(x - b.x2, y - b.y2)]),
      );
    const near = (f: (typeof flights)[number]) => f.seed || seeds.some((g) => f.treads.some((a) => g.treads.some((b) => gap(a, b) <= 3 * upf)));
    const thin = (l: Line, s0 = l.s0, s1 = l.s1): Band => ({ ...bandOf(l, l.rho, 0.75 * inch, s0 - inch, s1 + inch) });
    // (A railing or stringer runs across the treads' ends — not alongside them, like a dimension line
    // drawn past the stair — and is no longer than a stair.)
    const ends: { p: Pt; ang: number }[] = [];
    for (const f of flights.filter(near))
      for (const t of f.treads) {
        stairs.push(thin(t));
        ends.push({ p: [t.x1, t.y1], ang: t.ang }, { p: [t.x2, t.y2], ang: t.ang });
      }
    if (ends.length)
      for (const l of lines) {
        if (l.s1 - l.s0 < upf || l.s1 - l.s0 > 12 * upf) continue;
        if (ends.some(({ p: [x, y], ang }) => Math.abs(Math.sin(l.ang - ang)) >= Math.sin(30 * DEG) && distToSeg(x, y, l) <= 4 * inch)) stairs.push(thin(l));
      }
  }

  // Wall pieces along a stair (its railing, its side wall): kept as walls whatever their thickness.
  const stairSide = new Set<Band>();
  // 1. Walls: parallel lines a wall's thickness apart, open between (nothing drawn along the stud space),
  // at least `shortest` long; a label's box isn't one, unless `boxes` (a plan that fills its walls says
  // which small boxes are wall — a short return — so they're kept there, and the fill sorts them out).
  const wallPieces = (shortest: number, boxes: boolean) => {
    const out: Band[] = [];
    for (const a of lines) {
      check(64);
      if (a.s1 - a.s0 < shortest || isDimension(a) || (!boxes && boxSide(a))) continue;
      for (const b of parallelNear(a.ang, a.rho + tMin, a.rho + tMax, a.s0, a.s1)) {
        if (isDimension(b) || (!boxes && boxSide(b))) continue;
        const s0 = Math.max(a.s0, b.s0);
        const s1 = Math.min(a.s1, b.s1);
        if (s1 - s0 < shortest) continue;
        // Where something's drawn between the faces (a pocket door's slot, a window), it isn't open stud
        // space: the wall is the stretches that are — the rest an opening, closed like any other.
        const spans: [number, number][] = [];
        // (More than 40 lines between them: that's cluttered space — words, hatching, fixtures — not a
        // wall's stud space, which has at most a few, at its windows and doors.)
        const between = parallelNear(a.ang, a.rho + 0.3 * inch, b.rho - 0.3 * inch, s0, s1, 40);
        if (between.length > 40) continue;
        for (const c of between)
          if (c.s1 - c.s0 >= shortest && c.s1 > s0 && c.s0 < s1) spans.push([Math.max(c.s0, s0), Math.min(c.s1, s1)]);
        spans.sort((p, q) => p[0] - q[0]);
        let from = s0;
        const open: [number, number][] = [];
        for (const [p, q] of spans) {
          if (p > from) open.push([from, p]);
          from = Math.max(from, q);
        }
        if (s1 > from) open.push([from, s1]);
        for (const [o0, o1] of open) if (o1 - o0 >= shortest) out.push(bandOf(a, (a.rho + b.rho) / 2, (b.rho - a.rho) / 2, o0, o1));
      }
    }
    return out;
  };
  const bands = wallPieces(6 * inch, false);
  // A shelf, a counter or a row of cubbies isn't a wall: its front line and the face of the wall behind it read as one
  // thick wall (9"+, nothing drawn between) — in a pantry, a closet, a mud room it cut the floor short (2026-11-24,
  // ~20 of the misses). A thick wall whose face is also a face of an ordinary wall on its far side (that wall's own
  // two faces, alongside for half its length or more) is that, and is dropped. A real thick wall stands on its own.
  {
    const thin = bands.filter((w) => 2 * w.half <= 9 * inch);
    const shelf = (t: Band) => 2 * t.half > 9 * inch && thin.some((w) => {
      if (Math.abs(Math.sin(w.ang - t.ang)) > 0.02 || Math.abs(w.ux * t.ux + w.uy * t.uy) < 0.99) return false;
      const ov = Math.min(w.s1, t.s1) - Math.max(w.s0, t.s0);
      if (ov < 0.5 * (t.s1 - t.s0)) return false;
      // (w beside t, sharing a face: w's far face is t's near one, w outside t.)
      return [-1, 1].some((k) => Math.abs(w.rho - k * w.half - (t.rho + k * t.half)) < 0.5 * inch);
    });
    if (bands.some(shelf)) bands.splice(0, bands.length, ...bands.filter((t) => !shelf(t)));
  }
  // A short piece (under a foot) is a wall only if it's capped — a short line across an end, the wall's
  // thickness (a jamb, a wall's end). A switch or outlet drawn as two short lines off a wall has only the
  // wall's long face running past it, and its other end open.
  const closedAt = (w: Band, sv: number) => {
    const [x, y] = [w.ux * sv + w.nx * w.rho, w.uy * sv + w.ny * w.rho];
    return strokesNear(x, y, x, y).some((k) => {
      if (Math.abs(Math.sin(k.ang - w.ang)) < Math.sin(60 * DEG)) return false;
      const along = ((k.x1 + k.x2) / 2) * w.ux + ((k.y1 + k.y2) / 2) * w.uy;
      if (Math.abs(along - sv) > inch || k.s1 - k.s0 > 2 * w.half + 1.5 * inch) return false;
      const o1 = k.x1 * w.nx + k.y1 * w.ny;
      const o2 = k.x2 * w.nx + k.y2 * w.ny;
      return Math.min(o1, o2) <= w.rho - w.half + 0.3 * inch && Math.max(o1, o2) >= w.rho + w.half - 0.3 * inch;
    });
  };
  // (Or where a wall jogs: walls running off its two ends to opposite sides — a short stretch of one wall stepped
  // over, behind a microwave's cabinet in the user's pantry, 2026-11-23, where the kitchen ran through a 10" gap.)
  const jogAt = (w: Band, sv: number) => {
    const [x, y] = [w.ux * sv + w.nx * w.rho, w.uy * sv + w.ny * w.rho];
    let side = 0;
    for (const v of bands) {
      // (Real walls, the short piece's own thickness — a tub's or vanity's edge isn't.)
      if (v === w || v.s1 - v.s0 < 1.5 * upf || Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(80 * DEG) || distToBand(x, y, v) > w.half + inch || v.half < 1.5 * inch || Math.abs(v.half - w.half) > 0.75 * inch) continue;
      // Which side of w's line v runs off to (from this end).
      const mid = ((v.s0 + v.s1) / 2) * 1;
      const [vx, vy] = [v.ux * mid + v.nx * v.rho, v.uy * mid + v.ny * v.rho];
      const o = vx * w.nx + vy * w.ny - w.rho;
      if (Math.abs(o) > w.half + inch) side |= o > 0 ? 1 : 2;
    }
    return side;
  };
  // (Off both ends, not the same way at both — a jog, or a jog into a T. The same way at both is a box: a cabinet.)
  const jogs = (w: Band) => { if (w.half < 1.5 * inch) return false; const a = jogAt(w, w.s0), b = jogAt(w, w.s1); return a !== 0 && b !== 0 && a !== b; };
  const openStub = (w: Band) => w.s1 - w.s0 < upf && !closedAt(w, w.s0) && !closedAt(w, w.s1) && !jogs(w);
  if (bands.some(openStub)) bands.splice(0, bands.length, ...bands.filter((w) => !openStub(w)));
  if (opts.piecesOnly) {
    opts.piecesOnly(bands);
    return { ok: false, reason: "open" };
  }

  // 1b. A plan that fills its walls (hatching between the faces — the heavy ink on the page): the walls
  // are the filled bands, and nothing else is — dimensions, labels' boxes, furniture, ridge and beam
  // lines are all thin, so they don't count at all. Pieces of a filled wall that line up across an
  // opening (up to 24' — a garage door) are closed straight across it: a cased opening, a kitchen open
  // to the living room, a garage door.
  // (A plan that fills its walls solid says which they are outright: a band whose center line runs
  // inside the wall fill. The wall fill is the color most of the plan's double lines a wall's thickness
  // apart (2½" or more) run inside, filling just between their faces — not a counter's or a closet
  // shelf's shade, not an elevation's siding, and not heavy lines or words drawn as thin filled strips. Every shape of it is wall then, however small: a door's return.)
  const insideOf = (shapes: FilledShape[], w: Band) =>
    [0.15, 0.5, 0.85].every((f) => {
      const sv = w.s0 + (w.s1 - w.s0) * f;
      return inFilled(shapes, w.ux * sv + w.nx * w.rho, w.uy * sv + w.ny * w.rho);
    });
  let wallFill: FilledShape[] | null = null;
  if (opts.fills?.length) {
    let most = 20 * upf;
    for (const shapes of fillsByColor(opts.fills).values()) {
      check();
      // (A wall's fill is just between its faces: a step past either face is out of it — not lines
      // drawn across a big filled area, like an elevation's siding. Looked at in three places along the
      // wall, two of which must be — one may be where another wall meets it.)
      const between = (w: Band) =>
        [0.2, 0.5, 0.8].filter((f) => {
          const sv = w.s0 + (w.s1 - w.s0) * f;
          return [-1, 1].every((side) => {
            const o = w.rho + side * (w.half + inch);
            return !inFilled(shapes, w.ux * sv + w.nx * o, w.uy * sv + w.ny * o);
          });
        }).length >= 2;
      let len = 0;
      const pieces = new Set<number>();
      for (const w of bands)
        if (w.s1 - w.s0 >= upf && w.half >= 1.25 * inch && insideOf(shapes, w) && between(w)) {
          len += w.s1 - w.s0;
          const sv = (w.s0 + w.s1) / 2;
          pieces.add(filledAt(shapes, w.ux * sv + w.nx * w.rho, w.uy * sv + w.ny * w.rho));
        }
      // (Walls are filled piece by piece all over the plan; a sheet's border drawn as one heavy filled
      // frame is one shape, or a few.)
      if (len > most && pieces.size >= 6) [most, wallFill] = [len, shapes];
    }
  }
  // On a plan that fills its walls, its short pieces too — down to 4" (a door's return beside a corner),
  // small boxes and all: the fill says which are wall.
  if (wallFill) bands.splice(0, bands.length, ...wallPieces(4 * inch, true));
  const filled = (w: Band) => {
    if (wallFill) return insideOf(wallFill, w);
    const [ax, ay] = [w.ux * w.s0 + w.nx * w.rho, w.uy * w.s0 + w.ny * w.rho];
    const [bx, by] = [w.ux * w.s1 + w.nx * w.rho, w.uy * w.s1 + w.ny * w.rho];
    const seen = new Set<number>();
    for (const l of strokesNear(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by))) {
      const slant = Math.abs(Math.sin(l.ang - w.ang));
      if (slant < Math.sin(20 * DEG) || slant > Math.sin(75 * DEG) || l.s1 - l.s0 > 6 * w.half + 2 * inch) continue;
      const o1 = l.x1 * w.nx + l.y1 * w.ny - w.rho;
      const o2 = l.x2 * w.nx + l.y2 * w.ny - w.rho;
      const onFace = (o: number) => Math.abs(Math.abs(o) - w.half) <= 0.75 * inch;
      const sl = ((l.x1 + l.x2) / 2) * w.ux + ((l.y1 + l.y2) / 2) * w.uy;
      if (onFace(o1) && onFace(o2) && Math.sign(o1) !== Math.sign(o2) && sl >= w.s0 && sl <= w.s1) seen.add(Math.round(sl / inch));
    }
    return seen.size >= 2 && seen.size >= (w.s1 - w.s0) / upf;
  };
  // (A plan that fills only some walls — brick on the outside, say — draws the rest as plain pairs: it
  // fills its walls when the filled ones are a good share — a quarter or more — of all the pairs here.)
  // (A short filled piece — under 2' — counts when it's tied into a longer filled wall: a door's return,
  // a wall's end. On its own it's something else drawn with a zigzag — a toilet's tank, say.)
  const filledAll = bands.filter(filled);
  const longFilled = bandGrid(
    filledAll.filter((w) => w.s1 - w.s0 >= 2 * upf),
    2 * upf,
  );
  const tiedToFilled = (w: Band) =>
    [w.s0, w.s1].some((end) => {
      const [ex, ey] = [w.ux * end + w.nx * w.rho, w.uy * end + w.ny * w.rho];
      return longFilled(ex, ey, w.half + 2 * inch).some((v) => {
        if (v === w) return false;
        if (Math.abs(Math.sin(v.ang - w.ang)) > Math.sin(30 * DEG)) return distToBand(ex, ey, v) <= w.half + inch;
        return Math.abs(v.rho - w.rho) <= Math.max(v.half, w.half) && v.s0 <= end + inch && v.s1 >= end - inch;
      });
    });
  // (On a plan that fills its walls solid, the fill's own shade already says it: every piece counts.)
  const filledBands = wallFill ? filledAll : filledAll.filter((w) => w.s1 - w.s0 >= 2 * upf || tiedToFilled(w));
  const lengthOf = (xs: Band[]) => xs.filter((w) => w.s1 - w.s0 >= upf).reduce((n, w) => n + (w.s1 - w.s0), 0);
  const filledLength = lengthOf(filledBands);
  let heavy = filledLength >= 20 * upf && (!!wallFill || filledLength >= 0.25 * lengthOf(bands));
  // (Only the outside walls drawn hatched — the inside ones plain double lines, more of them than the hatched: the
  // plain ones are walls too, not cabinets. A plan that hatches every wall has few plain pairs at wall thickness.
  // Likewise a fill color in only some walls — Derouen, 165' filled of 6,700': not the plan's wall fill.)
  let mixed = false;
  if (heavy) {
    const bk = (w: Band) => Math.round(((2 * w.half) / inch) * 4) / 4;
    const { used } = sheetWallThicknesses(segments, upf, deadline);
    // (Plain pairs as thick as the hatched walls themselves — the thicknesses that carry a good share of the
    // hatched length. Lormand fills its walls at 3½" and 5½" and has plenty of plain pairs at other spacings —
    // cabinets, trim: those don't count.)
    const fillBy = new Map<number, number>();
    for (const w of filledBands) fillBy.set(bk(w), (fillBy.get(bk(w)) ?? 0) + (w.s1 - w.s0));
    const wallT = [...fillBy].filter(([, n]) => n >= 0.15 * filledLength).map(([t]) => t);
    const plain = bands.filter((w) => !filledAll.includes(w) && w.s1 - w.s0 >= 2 * upf && used.some((t) => Math.abs(bk(w) - t) <= 0.375) && wallT.some((t) => Math.abs(bk(w) - t) <= 0.375));
    if (lengthOf(plain) > filledLength) (heavy = false), (mixed = true);
  }
  // (Hatched walls on a plan that draws its other walls plain: each hatched piece is still a wall the way it is on a
  // plan that hatches them all — its loose ends closed to the next piece, short bits included.)
  const hatched = new Set(mixed ? filledAll : []);
  const asHeavy = (w: Band) => heavy || hatched.has(w);
  if (heavy) bands.splice(0, bands.length, ...filledBands);
  else {
    // A plan that draws its walls as plain double lines draws them at a few set thicknesses — 3½" (a
    // 2x4), 5½" (a 2x6), whatever its drafter uses — over and over. Cabinets (12" uppers), stair treads
    // (10–11"), trim and symbols (2" and under) are other spacings. The walls are the pieces at the
    // thicknesses this plan uses a lot (2½"–9": 20' or more of it, or a good share of the commonest) —
    // or any wall-thick piece 2' or longer: a switch or outlet box is a few inches, a short wall isn't.
    // (Counted over the whole sheet, once — not just around the click — so every click in a room
    // sees the same walls.)
    const bucket = (w: Band) => Math.round(((2 * w.half) / inch) * 4) / 4;
    // (A stair's railing or its side wall, however it's drawn, bounds the room like a wall.)
    const besideStairs = (w: Band) => stairSide.has(w) || nearStairsCheck(w);
    const nearStairsCheck = (w: Band) =>
      [w.s0, (w.s0 + w.s1) / 2, w.s1].some((sv) => stairs.some((st) => distToBand(w.ux * sv + w.nx * w.rho, w.uy * sv + w.ny * w.rho, st) <= upf)) && !!stairSide.add(w);
    const { used, top } = sheetWallThicknesses(segments, upf, deadline);
    if (unreadable.has(segments)) throw new TooSlow();
    check();
    if (used.length && top >= 30 * upf) bands.splice(0, bands.length, ...bands.filter((w) => filledAll.includes(w) || used.some((t) => Math.abs(bucket(w) - t) <= 0.375) || besideStairs(w)));
  }

  // A point on a band's line: `along` it, `off` from its center line.
  const at2 = (w: Band, along: number, off: number): [number, number] => [w.ux * along + w.nx * (w.rho + off), w.uy * along + w.ny * (w.rho + off)];
  // The stretches of [from, to] along a band's line drawn by lines within its faces (touching pieces as one).
  const drawnRuns = (w: Band, from: number, to: number, join: number, r0 = w.rho - w.half - inch, r1 = w.rho + w.half + inch) => {
    const spans: [number, number][] = [];
    for (const l of parallelNear(w.ang, r0, r1, from, to)) {
      if (isDimension(l)) continue;
      const a = Math.max(l.s0, from), b = Math.min(l.s1, to);
      if (b > a) spans.push([a, b]);
    }
    spans.sort((p, q) => p[0] - q[0]);
    const runs: [number, number][] = [];
    for (const [a, b] of spans) {
      const r = runs[runs.length - 1];
      if (r && a <= r[1] + join) r[1] = Math.max(r[1], b);
      else runs.push([a, b]);
    }
    return runs;
  };
  // How much of [from, to] along a band's line is drawn by lines within its faces.
  const drawnAlong = (w: Band, from: number, to: number) => {
    const spans: [number, number][] = [];
    for (const l of parallelNear(w.ang, w.rho - w.half - inch, w.rho + w.half + inch, from, to)) {
      // (A dimension line running past isn't something drawn in the wall.)
      if (isDimension(l)) continue;
      const a = Math.max(l.s0, from);
      const b = Math.min(l.s1, to);
      if (b > a) spans.push([a, b]);
    }
    spans.sort((p, q) => p[0] - q[0]);
    let covered = 0;
    let end = from;
    for (const [a, b] of spans) {
      if (b <= end) continue;
      covered += b - Math.max(a, end);
      end = b;
    }
    return covered / (to - from || 1);
  };

  // (Not a wall: a thin piece standing right against a real wall's face — within 1½", the wall running the whole
  // length of it and on past — an appliance's or cabinet's back, a shelf: the room runs to the wall's face behind
  // it. The user's answer key, 2026-11-23: washer and dryer boxes drawn just off the wall.)
  const against = (b: Band) =>
    bands.some((a) => {
      if (a === b || Math.abs(Math.sin(a.ang - b.ang)) > Math.sin(2 * DEG) || a.s1 - a.s0 < b.s1 - b.s0 + upf) return false;
      const same = a.nx * b.nx + a.ny * b.ny > 0 ? 1 : -1;
      const br = same * b.rho;
      const gap = br < a.rho ? a.rho - a.half - (br + b.half) : br - b.half - (a.rho + a.half);
      // (Standing off it, however little: a piece sharing the wall's face line is that wall, drawn with a third line.)
      if (gap < 0.25 * inch || gap > 1.5 * inch) return false;
      const [b0, b1] = same > 0 ? [b.s0, b.s1] : [-b.s1, -b.s0];
      if (Math.min(a.s1, b1) - Math.max(a.s0, b0) < 0.9 * (b1 - b0)) return false;
      // (A box standing in the room — its sides run out from the wall a foot or more at both ends — not a strip of
      // the wall itself, drawn with an extra line in it.)
      const away = br < a.rho ? -1 : 1; // from the wall into the room, along a's normal
      const side = (sv: number) => {
        const [ex, ey] = [b.ux * sv + b.nx * b.rho, b.uy * sv + b.ny * b.rho];
        return strokesNear(ex - upf - inch, ey - upf - inch, ex + upf + inch, ey + upf + inch).some((k) => {
          if (Math.abs(Math.cos(k.ang - b.ang)) > Math.sin(10 * DEG)) return false;
          if (Math.abs((k.x1 + k.x2) / 2 * b.ux + (k.y1 + k.y2) / 2 * b.uy - sv) > 1.5 * inch) return false;
          const o1 = (k.x1 * a.nx + k.y1 * a.ny - a.rho) * away, o2 = (k.x2 * a.nx + k.y2 * a.ny - a.rho) * away;
          // (A box's side, ending at its front — not a room's wall running on past it.)
          return Math.max(o1, o2) >= a.half + upf && Math.max(o1, o2) <= a.half + 3.75 * upf && Math.min(o1, o2) <= a.half + b.half * 2 + 2 * inch;
        });
      };
      if (!side(b.s0) || !side(b.s1)) return false;
      // (And its front: a line across, 1' to 3'6" out from the wall, most of its width — a washer, dryer, cabinet.)
      const [mx, my] = [b.ux * ((b.s0 + b.s1) / 2) + b.nx * b.rho, b.uy * ((b.s0 + b.s1) / 2) + b.ny * b.rho];
      const R = (b.s1 - b.s0) / 2 + 4 * upf;
      return strokesNear(mx - R, my - R, mx + R, my + R).some((k) => {
        if (Math.abs(Math.sin(k.ang - b.ang)) > Math.sin(5 * DEG)) return false;
        const o = (((k.x1 + k.x2) / 2) * a.nx + ((k.y1 + k.y2) / 2) * a.ny - a.rho) * away - a.half;
        if (o < upf || o > 3.5 * upf) return false;
        const t1 = k.x1 * b.ux + k.y1 * b.uy, t2 = k.x2 * b.ux + k.y2 * b.uy;
        return Math.min(Math.max(t1, t2), b.s1) - Math.max(Math.min(t1, t2), b.s0) >= 0.8 * (b.s1 - b.s0);
      });
    });
  {
    const keep = bands.filter((b) => !against(b));
    if (keep.length < bands.length) bands.splice(0, bands.length, ...keep);
  }
  // (A short piece — under 3' — at an angle no long wall here runs at (4' or more, and square and 45° to those) isn't a
  // wall: a sink or a chair drawn turned. Chirafis's baths, 2026-11-24: a lav drawn at 17° closed off the room on a slant.)
  {
    const longAngs = bands.filter((w) => w.s1 - w.s0 >= 4 * upf).map((w) => w.ang);
    if (longAngs.length) {
      const okAng = (a: number) => longAngs.some((b) => [0, 45, 90, 135].some((k) => Math.abs(Math.sin(a - b - k * DEG)) < Math.sin(3 * DEG)));
      const keep = bands.filter((w) => w.s1 - w.s0 >= 3 * upf || okAng(w.ang));
      if (keep.length < bands.length) bands.splice(0, bands.length, ...keep);
    }
  }
  // (A bathtub isn't a wall: the room runs under it to the wall behind. A tub is a box 2'–3'8" deep and 4'–6'8" long,
  // up against walls on two sides or more, with its rounded basin drawn inside — lines along both long sides a few
  // inches in, shorter than the box, the corners curved. Its front and the basin's side, a few inches apart, look
  // like a wall. The user, 2026-11-24: "ignore a bathtub and bring the area to the wall".)
  {
    const tubs: { ux: number; uy: number; nx: number; ny: number; s0: number; s1: number; r0: number; r1: number }[] = [];
    const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
    for (const f of lines) {
      const len = f.s1 - f.s0;
      if (len < 4 * upf || len > 6.75 * upf) continue;
      // The back: parallel, 2'–3'8" off, the same stretch.
      for (const k of parallelNear(f.ang, f.rho - 3.7 * upf, f.rho + 3.7 * upf, f.s0, f.s1, 60)) {
        if (k === f || Math.abs(Math.sin(k.ang - f.ang)) > Math.sin(2 * DEG)) continue;
        const same = f.ux * k.ux + f.uy * k.uy > 0 ? 1 : -1;
        const kr = same * k.rho, [k0, k1] = same > 0 ? [k.s0, k.s1] : [-k.s1, -k.s0];
        const dep = Math.abs(kr - f.rho);
        if (dep < 2 * upf || dep > 3.7 * upf || !near(k0, f.s0, 1.5 * inch) || !near(k1, f.s1, 1.5 * inch) || kr < f.rho) continue;
        const [r0, r1] = [f.rho, kr];
        // Its two ends, across.
        const endAt = (sv: number) =>
          strokesNear(f.ux * sv + f.nx * (r0 + r1) / 2 - inch, f.uy * sv + f.ny * (r0 + r1) / 2 - inch, f.ux * sv + f.nx * (r0 + r1) / 2 + inch, f.uy * sv + f.ny * (r0 + r1) / 2 + inch).some((e) => {
            if (Math.abs(Math.cos(e.ang - f.ang)) > Math.sin(2 * DEG)) return false;
            const o1 = e.x1 * f.nx + e.y1 * f.ny, o2 = e.x2 * f.nx + e.y2 * f.ny, t = ((e.x1 + e.x2) / 2) * f.ux + ((e.y1 + e.y2) / 2) * f.uy;
            return near(t, sv, 1.5 * inch) && Math.min(o1, o2) <= r0 + 1.5 * inch && Math.max(o1, o2) >= r1 - 1.5 * inch;
          });
        if (!endAt(f.s0) || !endAt(f.s1)) continue;
        // The basin: a line along each long side, 1"–9" in, 50%–95% of the box's length, short of both ends.
        const basin = (from: number, dir: number) =>
          parallelNear(f.ang, Math.min(from + dir * inch, from + dir * 9 * inch), Math.max(from + dir * inch, from + dir * 9 * inch), f.s0, f.s1, 40).some((b) => {
            if (Math.abs(Math.sin(b.ang - f.ang)) > Math.sin(2 * DEG)) return false;
            const sm = f.ux * b.ux + f.uy * b.uy > 0 ? 1 : -1, [b0, b1] = sm > 0 ? [b.s0, b.s1] : [-b.s1, -b.s0], br = sm * b.rho;
            if ((br - from) * dir < inch || (br - from) * dir > 9 * inch) return false;
            return b1 - b0 >= 0.5 * len && b1 - b0 <= 0.95 * len && b0 > f.s0 + inch && b1 < f.s1 - inch;
          });
        if (!basin(r0, 1) || !basin(r1, -1)) continue;
        // (Curves at its corners: short strokes on the slant, inside the box.)
        const [cx0, cy0] = [f.ux * f.s0 + f.nx * r0, f.uy * f.s0 + f.ny * r0], [cx1, cy1] = [f.ux * f.s1 + f.nx * r1, f.uy * f.s1 + f.ny * r1];
        const curved = strokesNear(Math.min(cx0, cx1), Math.min(cy0, cy1), Math.max(cx0, cx1), Math.max(cy0, cy1)).filter((e) => {
          if (e.s1 - e.s0 > 8 * inch || Math.abs(Math.sin(2 * (e.ang - f.ang))) < Math.sin(15 * DEG)) return false;
          const t = ((e.x1 + e.x2) / 2) * f.ux + ((e.y1 + e.y2) / 2) * f.uy, o = ((e.x1 + e.x2) / 2) * f.nx + ((e.y1 + e.y2) / 2) * f.ny;
          return t > f.s0 + inch && t < f.s1 - inch && o > r0 + inch && o < r1 - inch;
        }).length;
        if (curved < 3) continue;
        // (Up against walls: two of its sides or more along a wall's face.)
        const P = (s: number, r: number): Pt => [f.ux * s + f.nx * r, f.uy * s + f.ny * r];
        const sideOnWall = (a: Pt, b: Pt) => {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]), [dx, dy] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
          return bands.some((w) => {
            if (Math.abs(dx * w.nx + dy * w.ny) > Math.sin(2 * DEG)) return false;
            const off = Math.abs(((a[0] + b[0]) / 2) * w.nx + ((a[1] + b[1]) / 2) * w.ny - w.rho);
            if (off < w.half - inch || off > w.half + 2 * inch) return false;
            const [ta, tb] = [a[0] * w.ux + a[1] * w.uy, b[0] * w.ux + b[1] * w.uy];
            return Math.min(w.s1, Math.max(ta, tb)) - Math.max(w.s0, Math.min(ta, tb)) >= 0.6 * L;
          });
        };
        const [A, B, C, D] = [P(f.s0, r0), P(f.s1, r0), P(f.s1, r1), P(f.s0, r1)];
        const walled = [sideOnWall(A, B), sideOnWall(B, C), sideOnWall(C, D), sideOnWall(D, A)].filter(Boolean).length;
        if (walled < 2) continue;
        tubs.push({ ux: f.ux, uy: f.uy, nx: f.nx, ny: f.ny, s0: f.s0, s1: f.s1, r0, r1 });
      }
    }
    if (tubs.length) {
      // (A band lying in the box — its whole center line within it, give or take an inch — goes.)
      const inTub = (w: Band) =>
        tubs.some((t) =>
          [w.s0, w.s1].every((sv) => {
            const [x, y] = [w.ux * sv + w.nx * w.rho, w.uy * sv + w.ny * w.rho];
            const s = x * t.ux + y * t.uy, o = x * t.nx + y * t.ny;
            return s >= t.s0 - inch && s <= t.s1 + inch && o >= t.r0 - inch && o <= t.r1 + inch;
          }),
        );
      const keep = bands.filter((w) => !inTub(w));
      if (keep.length < bands.length) bands.splice(0, bands.length, ...keep);
    }
  }

  // 2a. Doors and openings in a straight wall: the gap between two pieces of it, closed. An empty gap
  // (a door) only between pieces of a real wall — each long, or tied into another wall at an end;
  // label boxes and furniture standing in a room aren't strung together.
  const bridges: Band[] = [];
  // (Each closed opening's own stretch, between the wall's ends — for running the room to its middle, step 6.)
  const openSpan = new Map<Band, [number, number]>();
  const bandsNear = bandGrid(bands, 2 * upf);
  const tiedAt = (w: Band, end: number) => {
    const ex = w.ux * end + w.nx * w.rho;
    const ey = w.uy * end + w.ny * w.rho;
    // (Into a real wall — 2' or more: a label box's own short side isn't one.)
    return bandsNear(ex, ey, w.half + 2 * inch).some(
      (v) => v !== w && v.s1 - v.s0 >= 2 * upf && Math.abs(Math.sin(v.ang - w.ang)) > Math.sin(30 * DEG) && distToBand(ex, ey, v) <= w.half + inch,
    );
  };
  // A wall crossing the line of w between s = from and s = to (square-ish to it, running on well past
  // the line on both sides — it divides two rooms there).
  // (Or two walls meeting w's line there from opposite sides, each running on 3' or more — one wall
  // drawn in two pieces that meet at the line.)
  const crossedBetween = (w: Band, from: number, to: number) => {
    const mid = (from + to) / 2;
    const [mx, my] = [w.ux * mid + w.nx * w.rho, w.uy * mid + w.ny * w.rho];
    const ends: [number, number][] = [];
    return bandsNear(mx, my, (to - from) / 2 + inch).some((v) => {
      if (v === w || v.s1 - v.s0 < 2 * upf || Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(45 * DEG)) return false;
      // Where w's line meets v's center line: between the two pieces, and on v (within its length).
      const along = w.ux * v.nx + w.uy * v.ny;
      const [ox, oy] = [w.nx * w.rho, w.ny * w.rho];
      const t = (v.rho - (ox * v.nx + oy * v.ny)) / along;
      if (!(t > from + inch && t < to - inch)) return false;
      const [hx, hy] = [ox + w.ux * t, oy + w.uy * t];
      const sv = hx * v.ux + hy * v.uy;
      // (Running on well past it both ways, 3' or more — a wall that meets the line in a T, or turns a
      // corner just past it, doesn't count.)
      if (sv > v.s0 + w.half + 3 * upf && sv < v.s1 - w.half - 3 * upf) return true;
      // (The same, for a wall drawn in pieces end to end — one ending just past the line, the next carrying
      // on: taken together.)
      if (wallAcross(w, hx, hy, 3 * upf)) return true;
      // Ending at the line, running on 3' or more to one side: which side (the way v runs from it, as
      // seen across w's line).
      const reach = w.half + v.half + inch;
      const side = Math.abs(sv - v.s0) <= reach && v.s1 - sv >= 3 * upf ? 1 : Math.abs(sv - v.s1) <= reach && sv - v.s0 >= 3 * upf ? -1 : 0;
      if (!side) return false;
      const facing = Math.sign(v.ux * w.nx + v.uy * w.ny) * side;
      if (ends.some(([t2, f2]) => f2 === -facing && Math.abs(t2 - t) <= reach)) return true;
      ends.push([t, facing]);
      return false;
    });
  };
  // Whether a wall runs across w's line at (x, y), on past it `run` or more both ways — its pieces taken
  // together where they meet end to end (a wall is often drawn in pieces, broken where another meets it).
  const wallAcross = (w: Band, x: number, y: number, run: number) => {
    const spans: [number, number][] = [];
    let at = 0;
    for (const v of bandsNear(x, y, w.half + run + 4 * upf)) {
      if (v === w || Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(45 * DEG)) continue;
      if (Math.abs(x * v.nx + y * v.ny - v.rho) > v.half + inch) continue;
      // (Measured along the first piece's direction, so pieces drawn either way round compare.)
      if (!spans.length) at = Math.atan2(v.uy, v.ux);
      spans.push(Math.cos(Math.atan2(v.uy, v.ux) - at) < 0 ? [-v.s1, -v.s0] : [v.s0, v.s1]);
    }
    if (!spans.length) return false;
    const sv = x * Math.cos(at) + y * Math.sin(at);
    const holds = (lo: number, hi: number) => lo <= sv + w.half + inch && hi >= sv - w.half - inch;
    spans.sort((p, q) => p[0] - q[0]);
    let [lo, hi] = spans[0];
    for (const [a, b] of spans.slice(1)) {
      if (a <= hi + 2 * inch) hi = Math.max(hi, b);
      else if (holds(lo, hi)) break;
      else [lo, hi] = [a, b];
    }
    return holds(lo, hi) && lo <= sv - w.half - run && hi >= sv + w.half + run;
  };
  // Whether the opening between a wall's free end and the wall it's stretched to (from s = a to b along
  // it) is a doorway to close: 3' or narrower, or a door swings in it (its hinge on the opening's line
  // near it, as wide as the opening — or half, a pair), or something's drawn across it. Otherwise it's a
  // passage — a half wall beside a shower, the way into a bath's vanity — and the room carries on through.
  // With no door swings on the sheet at all, every one is closed. (Gaps between two pieces of one wall
  // in line — doorways, outside walls — are closed as before.)
  const doors = opts.doors ?? [];
  const isDoorway = (w: Band, a: number, b: number) => {
    const width = b - a;
    // (Only inside walls, drawn under 5" thick: an outside wall's opening is a door, a window, a fireplace.)
    if (!doors.length || opts.passages === false || opts.splitOpenings || width <= (opts.splitUpToFt ?? 3) * upf || 2 * w.half >= 5 * inch) return true;
    if (drawnAlong(w, a, b) >= 0.5) return true;
    // A door that shuts this opening: hinged on its line near one end, and its leaf, closed, lies along
    // the opening — one end of its swing sits on the opening's line, inside it. (The door of a room next
    // door, hinged at the same corner, shuts across its own doorway, not this one.)
    const onLine = (p: [number, number]) => {
      const along = p[0] * w.ux + p[1] * w.uy;
      return Math.abs(p[0] * w.nx + p[1] * w.ny - w.rho) <= w.half + 3 * inch && along >= a - 3 * inch && along <= b + 3 * inch;
    };
    const door = doors.some((d) => {
      const along = d.x * w.ux + d.y * w.uy;
      const off = Math.abs(d.x * w.nx + d.y * w.ny - w.rho);
      if (off > w.half + 8 * inch || along < a - 8 * inch || along > b + 8 * inch) return false;
      if (d.r < 0.3 * width || d.r > width + 6 * inch) return false;
      return !d.a || !d.b || onLine(d.a) || onLine(d.b);
    });
    return door;
  };
  const anchored = (w: Band) => w.s1 - w.s0 >= 3 * upf || tiedAt(w, w.s0) || tiedAt(w, w.s1);
  const byLine = [...bands].sort((p, q) => Math.round(p.ang / DEG) - Math.round(q.ang / DEG) || p.rho - q.rho || p.s0 - q.s0);
  for (let i = 0; i < byLine.length; i++) {
    check(64);
    const w = byLine[i];
    // The next piece along the same line (same direction, center lines within a wall's thickness) —
    // looked for both ways through the list (a piece drawn a hair off the line sorts either side).
    // (For a door, the next real piece — past a loose one, like a pair of doors' center post.)
    let next: Band | null = null;
    let nextReal: Band | null = null;
    const real = anchored(w);
    for (const step of [-1, 1]) {
      for (let j = i + step; j >= 0 && j < byLine.length; j += step) {
        const p = byLine[j];
        if (Math.round(p.ang / DEG) !== Math.round(w.ang / DEG) || Math.abs(p.rho - w.rho) > tMax) break;
        if (Math.abs(p.rho - w.rho) > Math.max(w.half, p.half)) continue;
        if (p.s0 <= w.s1) continue;
        if (!next || p.s0 < next.s0) next = p;
        if (real && (!nextReal || p.s0 < nextReal.s0) && anchored(p)) nextReal = p;
      }
    }
    const bridge = (to: Band) => {
      const b = { ...w, rho: (w.rho + to.rho) / 2, half: Math.min(w.half, to.half), s0: w.s1 - inch, s1: to.s0 + inch };
      bridges.push(b);
      openSpan.set(b, [w.s1, to.s0]);
    };
    if (asHeavy(w)) {
      // (Not through another wall: pieces in line on either side of a wall that crosses between them
      // are two rooms' walls, not one wall with an opening.)
      // (Longer — up to 40' — where windows and doors are drawn across most of it: a wall of glass.)
      const gap = next ? next.s0 - w.s1 : Infinity;
      if (next && (gap <= 24 * upf || (gap <= 40 * upf && drawnAlong(w, w.s1, next.s0) >= 0.8)) && !crossedBetween(w, w.s1, next.s0)) bridge(next);
      continue;
    }
    if (nextReal && nextReal.s0 - w.s1 <= maxDoor) bridge(nextReal);
    if (next && next !== nextReal && next.s0 - w.s1 <= maxOpening && drawnAlong(w, w.s1, next.s0) >= 0.8) bridge(next);
  }
  // 2b. A wall ending short of another wall (a door beside a corner, a closet's opening): closed to it.
  // Only a wall that comes off another one at its other end — a label's box or a piece of furniture
  // standing in the room isn't stretched to the walls.
  const solid = [...bands, ...bridges];
  const nearBy = bandGrid(solid, 2 * upf);
  const nearReal = bandGrid(bands, 2 * upf);
  // Walls join up into long runs, tens of feet; a letter's strokes (on a plan whose words are drawn as
  // lines) only join each other, a few feet in all. A real wall is part of a run of 8' or more.
  const runOf = new Map<Band, number>();
  {
    const touching = (w: Band) => {
      const out: Band[] = [];
      for (const end of [w.s0, w.s1]) {
        const ex = w.ux * end + w.nx * w.rho;
        const ey = w.uy * end + w.ny * w.rho;
        for (const v of bandsNear(ex, ey, w.half + 2 * inch)) if (v !== w && distToBand(ex, ey, v) <= Math.max(w.half, v.half) + inch) out.push(v);
      }
      return out;
    };
    const links = new Map<Band, Band[]>(bands.map((w) => [w, []]));
    for (const w of bands) {
      check(64);
      for (const v of touching(w)) {
        links.get(w)!.push(v);
        links.get(v)?.push(w);
      }
    }
    for (const start of bands) {
      check(64);
      if (runOf.has(start)) continue;
      const group: Band[] = [start];
      const seen = new Set([start]);
      for (let k = 0; k < group.length; k++)
        for (const v of links.get(group[k]) ?? [])
          if (!seen.has(v)) {
            seen.add(v);
            group.push(v);
          }
      const total = group.reduce((n, v) => n + (v.s1 - v.s0), 0);
      for (const v of group) runOf.set(v, total);
    }
  }
  const realWall = (v: Band) => (runOf.get(v) ?? v.s1 - v.s0) >= 8 * upf;
  // (`real`: only into, or on as, a real wall — not a letter's stroke.)
  const meets = (w: Band, end: number, real = false) => {
    const ex = w.ux * end + w.nx * w.rho;
    const ey = w.uy * end + w.ny * w.rho;
    return nearBy(ex, ey, w.half + 2 * inch).some(
      (v) =>
        v !== w &&
        (!real || realWall(v)) &&
        Math.abs(Math.sin(v.ang - w.ang)) > Math.sin(30 * DEG) &&
        distToBand(ex, ey, v) <= w.half + inch,
    );
  };
  const runsOn = (w: Band, end: number, real = false) => {
    const ex = w.ux * end + w.nx * w.rho;
    const ey = w.uy * end + w.ny * w.rho;
    return nearBy(ex, ey, 2 * inch).some(
      (v) =>
        v !== w &&
        (!real || realWall(v)) &&
        Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(3 * DEG) &&
        Math.abs(v.rho - w.rho) <= Math.max(v.half, w.half) &&
        v.s0 <= end + inch &&
        v.s1 >= end - inch &&
        (v.s0 < w.s0 - inch || v.s1 > w.s1 + inch),
    );
  };
  // More of the same wall in line past this end (within a door's width), the way `dir` points.
  // (`real`: a real wall, drawn the same thickness — more of the same wall.)
  const inLineBeyond = (w: Band, end: number, dir: number, real = false) =>
    bands.some(
      (v) =>
        v !== w &&
        (!real || (realWall(v) && Math.abs(v.half - w.half) <= 0.75 * inch)) &&
        Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(3 * DEG) &&
        Math.abs(v.rho - w.rho) <= Math.max(v.half, w.half) &&
        (dir > 0 ? v.s0 > end && v.s0 - end <= maxDoor : v.s1 < end && end - v.s1 <= maxDoor),
    );
  for (const w of bands) {
    check(16);
    if (w.s1 - w.s0 < 1.5 * inch) continue;
    for (const [end, dir] of [
      [w.s0, -1],
      [w.s1, 1],
    ] as const) {
      const ex = w.ux * end + w.nx * w.rho;
      const ey = w.uy * end + w.ny * w.rho;
      // Already meeting something there (not a free end), or a loose piece: free at the other end too —
      // not tied into a wall across, not running on as another piece of the same wall, and no more of
      // the wall in line past a door there (a wall between two doors). A beam or soffit drawn double
      // standing in the room isn't stretched to the walls. That other wall is a real one: on a plan whose
      // words are drawn as lines, a letter's arm comes off its spine (an E) — it isn't a wall.
      const other = dir > 0 ? w.s0 : w.s1;
      // (On a plan that fills its walls, every filled piece is a wall.)
      if (meets(w, end) || (!asHeavy(w) && !(meets(w, other, true) || runsOn(w, other, true) || inLineBeyond(w, other, -dir, true) || stairSide.has(w)))) continue;
      const reachDoor = maxDoor;
      let hit = Infinity;
      for (const v of nearBy(ex, ey, reachDoor + inch)) {
        if (v === w || Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(45 * DEG)) continue;
        // Along this wall from its end to v's near face.
        const along = w.ux * v.nx + w.uy * v.ny;
        const off = ex * v.nx + ey * v.ny;
        for (const face of [v.rho - v.half, v.rho + v.half]) {
          const t = ((face - off) / along) * dir;
          if (!(t > 0) || t > reachDoor || t >= hit) continue;
          const hx = ex + w.ux * t * dir;
          const hy = ey + w.uy * t * dir;
          const s = hx * v.ux + hy * v.uy;
          // (Up to a foot past its end: a wall that stops short of the corner, a door's short return there.)
          if (s >= v.s0 - upf && s <= v.s1 + upf) hit = t;
        }
      }
      if (hit < Infinity && !isDoorway(w, dir > 0 ? end : end - hit, dir > 0 ? end + hit : end)) continue;
      if (hit < Infinity) {
        const b = { ...w, s0: dir > 0 ? end - inch : end - hit - inch, s1: dir > 0 ? end + hit + inch : end + inch };
        bridges.push(b);
        openSpan.set(b, dir > 0 ? [end, end + hit] : [end - hit, end]);
      }
    }
  }
  // 2e. A door is a wall, as far as rooms go: every door swing shuts its opening, whatever else is or
  // isn't drawn there — from the hinge along the door's shut position. That's the end of its swing that
  // runs the way the walls around it do (square to the plan) but isn't up against one: an open door drawn
  // at 45° is at an angle; one drawn open 90° lies along the wall beside it. Only door-sized swings
  // (1'6"–4') near the walls: wiring arcs and fan blades aren't.
  for (const d of opts.doors ?? []) {
    if (!d.a || !d.b || d.r < 1.5 * upf || d.r > 4 * upf) continue;
    const around = nearBy(d.x, d.y, upf);
    if (!around.length) continue;
    const shut = [d.a, d.b].filter((e) => {
      const len = Math.hypot(e[0] - d.x, e[1] - d.y);
      if (!(len > 0)) return false;
      const [ux, uy] = [(e[0] - d.x) / len, (e[1] - d.y) / len];
      const square = around.some((v) => Math.min(Math.abs(ux * v.nx + uy * v.ny), Math.abs(ux * v.ux + uy * v.uy)) < Math.sin(5 * DEG));
      const [mx, my] = [(d.x + e[0]) / 2, (d.y + e[1]) / 2];
      const parallel = (v: Band) => Math.abs(ux * v.nx + uy * v.ny) < Math.sin(5 * DEG);
      // (Up against a wall, or an opening already closed. Or a drawn wall a few inches off — an open
      // door's slab is often drawn standing off the wall beside it, by its stop and trim.)
      const alongWall =
        nearBy(mx, my, upf).some((v) => parallel(v) && distToBand(mx, my, v) <= 3 * inch) ||
        nearReal(mx, my, upf).some((v) => parallel(v) && distToBand(mx, my, v) <= 8 * inch);
      return square && !alongWall;
    });
    // (A door hung in a wall at 45°: both ends of its swing at 45°, square to each other — the open end has the door's
    // slab drawn along it, the shut end is the doorway.)
    if (shut.length === 0 && around.some((v) => Math.abs(Math.sin(2 * v.ang)) > Math.sin(80 * DEG))) {
      const dirOf = (e: number[]) => Math.atan2(e[1] - d.y, e[0] - d.x);
      const diag = (a: number) => Math.abs(Math.sin(2 * a)) > Math.sin(80 * DEG);
      const [ea, eb] = [d.a, d.b];
      if (diag(dirOf(ea)) && diag(dirOf(eb)) && Math.abs(Math.cos(dirOf(ea) - dirOf(eb))) < Math.sin(5 * DEG)) {
        const slab = (e: number[]) => {
          const [mx, my] = [(d.x + e[0]) / 2, (d.y + e[1]) / 2];
          const a = dirOf(e);
          return strokesNear(mx - inch, my - inch, mx + inch, my + inch).some((l) => Math.abs(Math.sin(l.ang - a)) < Math.sin(5 * DEG) && distToSeg(mx, my, l) <= 2.5 * inch);
        };
        const open = [ea, eb].filter((e) => !slab(e));
        if (open.length === 1) shut.push(open[0]);
      }
    }
    // (Both ends square to the walls — a door in a wall at 45°: its shut end is the one in line with the wall it's
    // hung in, through the hinge; the open one stands square off it.)
    // (Only beside a wall that itself runs at 45° — a plain door drawn open 90° in a square wall has a different tell.)
    if (shut.length === 2 && around.some((v) => Math.abs(Math.sin(2 * v.ang)) > Math.sin(80 * DEG))) {
      const inLine = shut.filter((e) =>
        around.some((v) => {
          const off = (p: [number, number]) => Math.abs(p[0] * v.nx + p[1] * v.ny - v.rho);
          return off([d.x, d.y]) <= v.half + 3 * inch && off(e as [number, number]) <= v.half + 3 * inch;
        }),
      );
      if (inLine.length === 1) shut.splice(0, 2, inLine[0]);
    }
    // A door hung on a 45° slant, drawn open square to the plan (a toilet room's corner door): its open end has the
    // door's slab drawn along it, the shut end — on the slant — nothing. The shut end closes it, not the slab (the
    // user's master bath, 2026-11-23: the room ran through the 45° doorway).
    let slanted = false;
    const slabAt = (e: number[]) => {
        const L = Math.hypot(e[0] - d.x, e[1] - d.y);
        if (!(L > 0)) return false;
        const a = Math.atan2(e[1] - d.y, e[0] - d.x), [mx, my] = [(d.x + e[0]) / 2, (d.y + e[1]) / 2];
        return strokesNear(mx - inch, my - inch, mx + inch, my + inch).some((l) => Math.abs(Math.sin(l.ang - a)) < Math.sin(5 * DEG) && l.s1 - l.s0 >= 0.3 * L && distToSeg(mx, my, l) <= 2.5 * inch);
      };
    {
      const diag = (e: number[]) => around.every((v) => { const a = Math.atan2(e[1] - d.y, e[0] - d.x); const k = Math.abs(Math.sin(a - v.ang)); return k > Math.sin(35 * DEG) && k < Math.sin(55 * DEG); });
      const sa = slabAt(d.a), sb = slabAt(d.b);
      if (sa !== sb) {
        const free = sa ? d.b : d.a;
        if (diag(free)) { shut.splice(0, shut.length, free); slanted = true; }
      }
    }
    // (Both ends square and free: the door's slab tells them apart. The
    // open end has it drawn along it, the shut end nothing; the shut end must run square to the walls. The user's real
    // clicks, 2026-11-23: 28 rooms ran through a door whose swing was read but never shut.)
    if (shut.length === 2 && !slanted) {
      const sa = slabAt(d.a), sb = slabAt(d.b);
      if (sa !== sb) {
        const free = sa ? d.b : d.a, len = Math.hypot(free[0] - d.x, free[1] - d.y);
        const [ux, uy] = [(free[0] - d.x) / len, (free[1] - d.y) / len];
        // (And in line with the wall it's hung in: that wall runs the shut end's way, through the hinge — an open end taken
        // for the shut one would cut across the room.)
        const inWall = around.some((v) => v.half >= 1.5 * inch && Math.abs(ux * v.nx + uy * v.ny) < Math.sin(5 * DEG) && Math.abs(d.x * v.nx + d.y * v.ny - v.rho) <= v.half + 3 * inch);
        if (len > 0 && inWall) shut.splice(0, shut.length, free);
      }
    }
    if (shut.length !== 1) continue;
    const e = shut[0];
    let ang = Math.atan2(e[1] - d.y, e[0] - d.x);
    if (ang < 0) ang += Math.PI;
    const [lx, ly] = [Math.cos(ang), Math.sin(ang)];
    const [nx, ny] = [-ly, lx];
    const sa = d.x * lx + d.y * ly;
    const sb = e[0] * lx + e[1] * ly;
    // (A few inches past both ends, into the jambs — they're often too short to count as wall.)
    // (On a 45° door: on from each jamb only until it meets a wall — a fixed 6" runs on past the corner the slanted
    // wall turns at, into the room; up to a foot, else 2".)
    const reachWall = (s0: number, dir: number) => {
      for (let t = 0; t <= 12 * inch; t += 0.5 * inch) {
        const sv = s0 + dir * t, [x, y] = [lx * sv + nx * (d.x * nx + d.y * ny), ly * sv + ny * (d.x * nx + d.y * ny)];
        if (nearBy(x, y, upf).some((v) => Math.abs(Math.sin(v.ang - ang)) > Math.sin(30 * DEG) && distToBand(x, y, v) <= v.half)) return t + inch;
      }
      return 2 * inch;
    };
    const [lo, hi] = [Math.min(sa, sb), Math.max(sa, sb)];
    bridges.push({ ang, ux: lx, uy: ly, nx, ny, rho: d.x * nx + d.y * ny, half: 1.5 * inch, s0: lo - (slanted ? reachWall(lo, -1) : 6 * inch), s1: hi + (slanted ? reachWall(hi, 1) : 6 * inch) });
    // (The doorway itself, in the wall the door's hung in — for running the room to the wall's middle across it, step 6
    // — the user's answer key, 2026-11-23: a door shut by its swing went to the face only, never the middle.)
    // (Its wall may stand off past short jamb stubs, too short to be wall themselves — up to 2' on along the doorway's
    // line from either jamb. Stafford's study door, 2026-11-24.)
    let wall: Band | null = null;
    const [dmx, dmy] = [(d.x + e[0]) / 2, (d.y + e[1]) / 2];
    for (const v of new Set([...around, ...nearBy(dmx, dmy, d.r / 2 + 2 * upf)])) {
      if (Math.abs(lx * v.nx + ly * v.ny) > Math.sin(5 * DEG) || v.half < 1.5 * inch) continue;
      {
        const [p0, p1] = [d.x * v.ux + d.y * v.uy, e[0] * v.ux + e[1] * v.uy].sort((p, q) => p - q);
        if (Math.max(v.s0 - p1, p0 - v.s1) > 2 * upf) continue;
      }
      const off = Math.abs(d.x * v.nx + d.y * v.ny - v.rho);
      if (off <= v.half + 3 * inch && (!wall || off < Math.abs(d.x * wall.nx + d.y * wall.ny - wall.rho))) wall = v;
    }
    if (wall) {
      const ta = d.x * wall.ux + d.y * wall.uy, tb = e[0] * wall.ux + e[1] * wall.uy;
      const [o0, o1] = [Math.min(ta, tb), Math.max(ta, tb)];
      const had = [...openSpan].some(([v, [p0, p1]]) => Math.abs(v.rho - wall!.rho) <= wall!.half && v.ux * wall!.ux + v.uy * wall!.uy > 0.99 && Math.min(p1, o1) - Math.max(p0, o0) > 0);
      if (!had) openSpan.set({ ...wall, s0: o0 - inch, s1: o1 + inch }, [o0, o1]);
    }
  }
  const walls = [...bands, ...bridges, ...stairs];

  // 3. The floor, filled out from the click on a grid (walls blocked off, a cell past their faces so
  // corners and diagonals can't leak).
  const cell = 1.5 * inch;
  const W = Math.ceil((box.x1 - box.x0) / cell);
  const H = Math.ceil((box.y1 - box.y0) / cell);
  const blocked = new Uint8Array(W * H);
  const block = (w: Band, into = blocked) => {
    // Its rectangle, a little wider and longer (so walls meeting at corners overlap).
    const S0 = w.s0 - w.half - cell;
    const S1 = w.s1 + w.half + cell;
    const O0 = w.rho - w.half - cell * 0.5;
    const O1 = w.rho + w.half + cell * 0.5;
    // Only the rows its rectangle crosses.
    const ys = [S0, S1].flatMap((sv) => [O0, O1].map((ov) => w.uy * sv + w.ny * ov));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - box.y0) / cell) - 1);
    const j1 = Math.min(H - 1, Math.ceil((Math.max(...ys) - box.y0) / cell) + 1);
    for (let j = j0; j <= j1; j++) {
      const y = box.y0 + (j + 0.5) * cell;
      // x where S0 ≤ ux·x + uy·y ≤ S1 and O0 ≤ nx·x + ny·y ≤ O1.
      let lo = -Infinity;
      let hi = Infinity;
      for (const [k, v, a, b] of [
        [w.ux, w.uy * y, S0, S1],
        [w.nx, w.ny * y, O0, O1],
      ]) {
        if (Math.abs(k) < 1e-9) {
          if (v < a || v > b) {
            lo = Infinity;
            break;
          }
          continue;
        }
        const p = (a - v) / k;
        const q = (b - v) / k;
        lo = Math.max(lo, Math.min(p, q));
        hi = Math.min(hi, Math.max(p, q));
      }
      if (!(hi >= lo)) continue;
      const i0 = Math.max(0, Math.floor((lo - box.x0) / cell));
      const i1 = Math.min(W - 1, Math.ceil((hi - box.x0) / cell));
      for (let i = i0; i <= i1; i++) {
        const x = box.x0 + (i + 0.5) * cell;
        if (x >= lo && x <= hi) into[j * W + i] = 1;
      }
    }
  };
  for (const w of walls) block(w);
  // (The walls alone, before the fence — what's past a doorway is judged by the plan, not cut off by the fence.)
  const wallsOnly = opts.fence ? blocked.slice() : blocked;
  // (The fence: cells outside it are walls.)
  if (opts.fence) {
    const f = opts.fence;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const fi = Math.floor((box.x0 + (i + 0.5) * cell - f.ox) * f.S), fj = Math.floor((box.y0 + (j + 0.5) * cell - f.oy) * f.S);
        if (fi < 0 || fj < 0 || fi >= f.W || fj >= f.H || !f.cells[fj * f.W + fi]) blocked[j * W + i] = 1;
      }
  }
  /** What's outside the house (the yard, a porch, a patio — not the garage, behind its door). */
  const outsideOfHouse = () => {
    // (Not counting the sheet's border — a frame drawn double around the page would close in the yard.
    // A border runs nearly the whole way across the drawing, its own way.)
    const [pw, ph] = sheetSize(segments);
    const house = new Uint8Array(W * H);
    for (const w of walls) if (w.s1 - w.s0 < 0.85 * (Math.abs(w.ux) * pw + Math.abs(w.uy) * ph)) block(w, house);
    // (A garage door — up to 20', something drawn across it — is part of the house's edge: the pieces of
    // a real wall in line across it closed for telling outside from in, so the garage isn't the yard.)
    for (let i = 0; i < byLine.length; i++) {
      const w = byLine[i];
      if (!anchored(w)) continue;
      let next: Band | null = null;
      for (let j = i + 1; j < byLine.length; j++) {
        const p = byLine[j];
        if (Math.round(p.ang / DEG) !== Math.round(w.ang / DEG) || Math.abs(p.rho - w.rho) > tMax) break;
        if (Math.abs(p.rho - w.rho) > Math.max(w.half, p.half) || p.s0 <= w.s1 || !anchored(p)) continue;
        if (!next || p.s0 < next.s0) next = p;
      }
      if (next && next.s0 - w.s1 <= 20 * upf && drawnAlong(w, w.s1, next.s0) >= 0.8 && !crossedBetween(w, w.s1, next.s0))
        block({ ...w, rho: (w.rho + next.rho) / 2, half: Math.min(w.half, next.half), s0: w.s1 - inch, s1: next.s0 + inch }, house);
    }
    return houseOutside(house, W, H, Math.round((4 * upf) / cell));
  };
  if (opts.outsideOnly) {
    opts.outsideOnly({ x0: box.x0, y0: box.y0, cell, W, H, out: outsideOfHouse() });
    return { ok: false, reason: "open" };
  }
  const ci = Math.floor((cx - box.x0) / cell);
  const cj = Math.floor((cy - box.y0) / cell);
  if (blocked[cj * W + ci]) return { ok: false, reason: "in-wall" };
  // 1 = floor (reached from the click). Filled out breadth-first, so when it runs out to the edge of the
  // search the way it went (`from`) is the shortest way out — through the gap it leaked by.
  const floor = new Uint8Array(W * H);
  const from = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  let top = 0;
  let leak = -1;
  const fill = () => {
    floor.fill(0);
    let head = 0;
    top = 0;
    stack[top++] = cj * W + ci;
    floor[cj * W + ci] = 1;
    from[cj * W + ci] = -1;
    while (head < top) {
      check(4096);
      const k = stack[head++];
      const i = k % W;
      const j = (k - i) / W;
      // Reached the edge of the search: it isn't closed in (outside, or open to outside).
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) {
        leak = k;
        return false;
      }
      for (const n of [k - 1, k + 1, k - W, k + W])
        if (!floor[n] && !blocked[n]) {
          floor[n] = 1;
          from[n] = k;
          stack[top++] = n;
        }
    }
    return true;
  };
  // 3b. The house is closed: a room inside it never runs on outside. When the floor gets out (a window,
  // an outside door or a slider the walls above didn't close — drawn some way they don't read), the gap
  // it got out by is closed straight across, in line with the wall it's in, and the floor filled again.
  // Only then: a room that's closed in already comes out just as before. A click outside the house (a
  // porch, the yard) isn't closed in at all.
  // The gap the floor got out by: on its shortest way out, around where it crosses the house's edge, the
  // narrowest stretch in line with a wall that ends there (a jamb) — from that wall's end across to the
  // next thing in the way. Failing that, the narrowest place straight across the way out.
  const freeRun = (x: number, y: number, ux: number, uy: number, max: number) => {
    for (let t = 0; t <= max; t += cell / 2) {
      const i = Math.floor((x + ux * t - box.x0) / cell);
      const j = Math.floor((y + uy * t - box.y0) / cell);
      if (i < 0 || j < 0 || i >= W || j >= H) return Infinity;
      if (blocked[j * W + i]) return t;
    }
    return Infinity;
  };
  const gapClosing = (end: number): Band | null => {
    const path: number[] = [];
    for (let k = end; k >= 0; k = from[k]) path.push(k);
    path.reverse();
    const R = Math.round((4 * upf) / cell);
    // (It has to get out across the house's edge where that's clear — open ground beyond. Otherwise
    // there's no telling where the house ends.)
    const at = path.findIndex((k) => outsideHouse![k]);
    if (at < 0) return null;
    const near = bandGrid(walls, 2 * upf);
    const widest = 24 * upf;
    let best: Band | null = null;
    let bestWidth = Infinity;
    const consider = (ux: number, uy: number, x: number, y: number, half: number, jamb?: number) => {
      const a = freeRun(x, y, -ux, -uy, widest);
      const b = freeRun(x, y, ux, uy, widest);
      if (!(a + b < bestWidth) || a + b < upf || a + b > widest) return;
      // (In line with a wall: one side of the gap is that wall's end.)
      if (jamb !== undefined && Math.min(Math.abs(a - jamb), Math.abs(b - jamb)) > upf) return;
      // (Not in line with a wall: only where something's drawn along it — a door or a wall set at 45°.)
      if (jamb === undefined) {
        const sp = x * ux + y * uy;
        const rho = x * -uy + y * ux;
        const along: [number, number][] = [];
        let ang0 = Math.atan2(uy, ux);
        if (ang0 < 0) ang0 += Math.PI;
        if (ang0 >= Math.PI) ang0 -= Math.PI;
        for (const l of parallelNear(ang0, Math.min(rho, -rho) - 6 * inch, Math.max(rho, -rho) + 6 * inch, Math.min(sp - a, -(sp + b)), Math.max(sp + b, -(sp - a)))) {
          if (Math.abs(Math.sin(l.ang - ang0)) > Math.sin(5 * DEG)) continue;
          const [mx, my] = [(l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2];
          if (Math.abs((mx - x) * -uy + (my - y) * ux) > 6 * inch) continue;
          const t1 = (l.x1 - x) * ux + (l.y1 - y) * uy;
          const t2 = (l.x2 - x) * ux + (l.y2 - y) * uy;
          const [p0, p1] = [Math.max(-a, Math.min(t1, t2)), Math.min(b, Math.max(t1, t2))];
          if (p1 > p0) along.push([p0, p1]);
        }
        along.sort((p, q) => p[0] - q[0]);
        let covered = 0;
        let reach = -a;
        for (const [p0, p1] of along) {
          if (p1 <= reach) continue;
          covered += p1 - Math.max(p0, reach);
          reach = p1;
        }
        if (covered < 0.5 * (a + b)) return;
      }
      let ang = Math.atan2(uy, ux);
      if (ang < 0) ang += Math.PI;
      if (ang >= Math.PI) ang -= Math.PI;
      const [lx, ly] = [Math.cos(ang), Math.sin(ang)];
      const [nx, ny] = [-ly, lx];
      const sp = x * lx + y * ly;
      const flip = lx * ux + ly * uy < 0;
      const [lo, hi] = flip ? [sp - b, sp + a] : [sp - a, sp + b];
      bestWidth = a + b;
      best = { ang, ux: lx, uy: ly, nx, ny, rho: x * nx + y * ny, half, s0: lo - 2 * inch, s1: hi + 2 * inch };
    };
    // (Looked for back along the way out, from where it's out of the house: the line nearest the outside
    // — the outside door, not a doorway between two rooms on the way to it.)
    const inLineAt = (k: number) => {
      const x = box.x0 + ((k % W) + 0.5) * cell;
      const y = box.y0 + (Math.floor(k / W) + 0.5) * cell;
      for (const v of near(x, y, 12 * upf)) {
        if (v.s1 - v.s0 < upf) continue;
        const off = x * v.nx + y * v.ny - v.rho;
        if (Math.abs(off) > v.half + 3 * inch) continue;
        const s = x * v.ux + y * v.uy;
        const past = s > v.s1 ? s - v.s1 : s < v.s0 ? v.s0 - s : 0;
        if (!(past > 0) || past > 12 * upf) continue;
        const [qx, qy] = [x - off * v.nx, y - off * v.ny];
        consider(v.ux, v.uy, qx, qy, Math.max(v.half, 1.5 * inch), past);
      }
    };
    for (let i = Math.min(path.length - 1, at + R); i >= 0 && !best; i--)
      if (!best) {
        inLineAt(path[i]);
        // (Both sides of the gap: the path's next few steps in too.)
        if (best) for (let j = i - 1; j >= Math.max(0, i - 8); j--) inLineAt(path[j]);
      }
    const span = path.slice(Math.max(0, at - R / 2), Math.min(path.length, at + R + 1));
    // (Straight across, any of the plan's square and 45° ways: a door in a corner set at 45° — taken
    // over the wall's line only when it's much the narrower.)
    const inLine = best as Band | null;
    const inLineWidth = bestWidth;
    bestWidth = Math.min(bestWidth * 0.6, 12 * upf);
    for (const k of span) {
      const x = box.x0 + ((k % W) + 0.5) * cell;
      const y = box.y0 + (Math.floor(k / W) + 0.5) * cell;
      for (const deg of [0, 45, 90, 135]) consider(Math.cos(deg * DEG), Math.sin(deg * DEG), x, y, 1.5 * inch);
    }
    if (best !== inLine) return best;
    return inLineWidth < Infinity ? inLine : null;
  };
  let outsideHouse: Uint8Array | null = null;
  let closes = 0;
  while (!fill()) {
    if (opts.closeHouse === false || closes >= 12) return { ok: false, reason: "open" };
    if (!outsideHouse) outsideHouse = outsideOfHouse();
    if (outsideHouse[cj * W + ci]) return { ok: false, reason: "open" };
    const seal = gapClosing(leak);
    if (!seal) return { ok: false, reason: "open" };
    block(seal);
    walls.push(seal);
    closes++;
  }
  // (Closed in, but taking in ground outside the house — a wall it couldn't read, so it closed somewhere
  // out in the yard: that's no room. Up to a few square feet is the doorway's own depth.)
  if (closes && outsideHouse) {
    let out = 0;
    for (let k = 0; k < top; k++) if (outsideHouse[stack[k]]) out++;
    const sf = (out * cell * cell) / (upf * upf);
    if (sf > Math.max(10, (0.03 * top * cell * cell) / (upf * upf))) return { ok: false, reason: "open" };
  }

  // 4. Whatever stands inside the room (an island, a label) is floor too: fill its holes — anything not
  // reachable from the edge of the search without crossing the floor.
  const outside = new Uint8Array(W * H);
  top = 0;
  for (let i = 0; i < W; i++)
    for (const j of [0, H - 1]) {
      outside[j * W + i] = 1;
      stack[top++] = j * W + i;
    }
  for (let j = 0; j < H; j++)
    for (const i of [0, W - 1])
      if (!outside[j * W + i]) {
        outside[j * W + i] = 1;
        stack[top++] = j * W + i;
      }
  while (top) {
    check(4096);
    const k = stack[--top];
    const i = k % W;
    for (const n of [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, k - W, k + W])
      if (n >= 0 && n < W * H && !outside[n] && !floor[n]) {
        outside[n] = 1;
        stack[top++] = n;
      }
  }
  const inRoom = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && !outside[j * W + i];

  // The room's edge: cell sides between room and not, chained into loops (room on the left); the longest.
  const next = new Map<number, number>();
  const key = (i: number, j: number) => j * (W + 1) + i;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!inRoom(i, j)) continue;
      if (!inRoom(i, j - 1)) next.set(key(i + 1, j), key(i, j)); // top side, going left
      if (!inRoom(i, j + 1)) next.set(key(i, j + 1), key(i + 1, j + 1)); // bottom, going right
      if (!inRoom(i - 1, j)) next.set(key(i, j), key(i, j + 1)); // left, going down
      if (!inRoom(i + 1, j)) next.set(key(i + 1, j + 1), key(i + 1, j)); // right, going up
    }
  let loop: number[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const l: number[] = [];
    let k: number | undefined = start;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      l.push(k);
      k = next.get(k);
    }
    if (l.length > loop.length) loop = l;
  }
  const corner = (k: number): Pt => {
    const i = k % (W + 1);
    return [box.x0 + i * cell, box.y0 + ((k - i) / (W + 1)) * cell];
  };
  const raw = loop.map(corner);
  let pts = simplify(raw, 1.5 * cell);
  // (A step kept a step: a side the tidying left a little off square — under 25° — with only one or two steps of the
  // grid's edge under it is a jog in the wall face (a 2x4 meeting a 2x6, a stub, a jamb), not a slanted wall: its
  // square corners back. A real slanted wall leaves a staircase of many steps. The user's real clicks, 2026-11-24:
  // ~200 rooms came back with a long undrawn slant like this.)
  {
    const at = new Map<Pt, number>();
    raw.forEach((p, k) => at.set(p, k));
    const out: Pt[] = [];
    for (let s = 0; s < pts.length; s++) {
      const a = pts[s], b = pts[(s + 1) % pts.length];
      out.push(a);
      const ia = at.get(a), ib = at.get(b);
      if (ia === undefined || ib === undefined) continue;
      const [dx, dy] = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
      const [major, minor] = [Math.max(dx, dy), Math.min(dx, dy)];
      if (minor < 0.5 * cell || minor > Math.tan(25 * DEG) * major) continue;
      const path: Pt[] = [];
      for (let k = ia; k !== ib; k = (k + 1) % raw.length) path.push(raw[k]);
      path.push(b);
      const turns: Pt[] = [];
      for (let k = 1; k < path.length - 1 && turns.length <= 4; k++) {
        const [p, q, r] = [path[k - 1], path[k], path[k + 1]];
        if ((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]) !== 0) turns.push(q);
      }
      // (Stepping one way only, along and across — not a spike out and back, like a door leaf's notch.)
      const q = [a, ...turns, b], [sx, sy] = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
      const oneWay = q.slice(1).every((p, k) => Math.sign(p[0] - q[k][0]) * sx >= 0 && Math.sign(p[1] - q[k][1]) * sy >= 0);
      if (turns.length <= 4 && oneWay) out.push(...turns);
    }
    pts = out;
    // (No needles: a point the outline turns back on itself at — under 20° — is a sliver along a door leaf, not floor.)
    for (let guard = 0; guard < 50 && pts.length > 3; guard++) {
      const k = pts.findIndex((q, i) => {
        const [p, r] = [pts[(i + pts.length - 1) % pts.length], pts[(i + 1) % pts.length]];
        const [ux, uy, vx, vy] = [p[0] - q[0], p[1] - q[1], r[0] - q[0], r[1] - q[1]];
        const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        return l > 0 && (ux * vx + uy * vy) / l > Math.cos(20 * DEG);
      });
      if (k < 0) break;
      pts.splice(k, 1);
    }
  }
  if (pts.length < 3) return { ok: false, reason: "too-small" };

  // 5. Each side onto the wall face it runs along (the grid's edge sits a cell or so off it).
  const faces = walls.flatMap((w) => [w.rho - w.half, w.rho + w.half].map((rho) => ({ ...w, rho })));
  const sides = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const l = toLine(a[0], a[1], b[0], b[1]);
    if (!l) return null;
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let best: { nx: number; ny: number; rho: number } | null = null;
    let bestD = 2.5 * cell;
    for (const f of faces) {
      if (Math.abs(Math.sin(f.ang - l.ang)) > Math.sin(4 * DEG)) continue;
      const s = m[0] * f.ux + m[1] * f.uy;
      if (s < f.s0 - f.half - 2 * cell || s > f.s1 + f.half + 2 * cell) continue;
      const d = Math.abs(m[0] * f.nx + m[1] * f.ny - f.rho);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best ? { nx: best.nx, ny: best.ny, rho: best.rho, face: true, len: Math.hypot(b[0] - a[0], b[1] - a[1]) } : { nx: l.nx, ny: l.ny, rho: l.rho, face: false, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  // A corner the grid cut off: one short side (under 18") or a few in a row (under 2' in all) on no wall face, at a
  // slant, between two sides that meet at an angle — they go, and those two meet in a square corner. (A real angled
  // wall has its face drawn, so it stays; a door's closing line runs in line with a side, not at a slant.)
  {
    type Side = (typeof sides)[number];
    const cand = (q: Side) => !!q && !q.face && q.len < 18 * inch;
    const cross = (a: Side, b: Side) => (a && b ? Math.abs(a.nx * b.ny - a.ny * b.nx) : 0);
    for (let pass = 0; pass < 4; pass++) {
      const n = sides.length;
      if (n <= 3) break;
      let done = false;
      for (let i = 0; i < n && !done; i++) {
        if (!cand(sides[i]) || cand(sides[(i + n - 1) % n])) continue; // start of a run
        let j = i, total = 0;
        while (cand(sides[j % n]) && j - i < n - 2) total += sides[j++ % n]!.len;
        const P = sides[(i + n - 1) % n], R = sides[j % n];
        const run = Array.from({ length: j - i }, (_, k) => sides[(i + k) % n]);
        if (total >= 24 * inch || cross(P, R) < Math.sin(30 * DEG) || !run.some((q) => cross(q, P) >= Math.sin(25 * DEG) && cross(q, R) >= Math.sin(25 * DEG))) continue;
        // Drop the run's sides and the corners inside it (sides[k] runs from pts[k] to pts[k + 1]); the corner at the
        // run's start now leads into R, so it lands where P and R meet.
        const drop = new Set(run.map((_, k) => (i + k) % n));
        const dropPt = new Set(run.map((_, k) => (i + k + 1) % n));
        const order = [...Array(n).keys()].filter((k) => !dropPt.has(k));
        const newPts = order.map((k) => pts[k]);
        const newSides = order.map((k) => {
          let m = k;
          while (drop.has(m % n)) m++;
          return sides[m % n];
        });
        pts.splice(0, pts.length, ...newPts);
        sides.splice(0, sides.length, ...newSides);
        done = true;
      }
      if (!done) break;
    }
  }
  // (And a single slanted cut whose neighbour is another short piece the run above didn't take.)
  for (let pass = 0; pass < 3; pass++)
    for (let i = 0; i < sides.length && sides.length > 3; i++) {
      const q = sides[i];
      if (!q || q.face || q.len >= 18 * inch) continue;
      const p = sides[(i + sides.length - 1) % sides.length], r = sides[(i + 1) % sides.length];
      if (!p || !r || Math.abs(p.nx * r.ny - p.ny * r.nx) < Math.sin(30 * DEG)) continue;
      const slant = (a: { nx: number; ny: number }) => Math.abs(a.nx * q.ny - a.ny * q.nx);
      if (slant(p) < Math.sin(25 * DEG) || slant(r) < Math.sin(25 * DEG)) continue;
      if (i === sides.length - 1) {
        sides.pop();
        pts.shift();
        sides.push(sides.shift()!);
      } else {
        sides.splice(i, 1);
        pts.splice(i + 1, 1);
      }
      i--;
    }
  const snapped: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = sides[(i + pts.length - 1) % pts.length];
    const q = sides[i];
    if (!p || !q) {
      snapped.push(pts[i]);
      continue;
    }
    const det = p.nx * q.ny - p.ny * q.nx;
    // Two sides on one line (or nearly): the corner between them goes.
    if (Math.abs(det) < Math.sin(10 * DEG)) continue;
    snapped.push([(p.rho * q.ny - q.rho * p.ny) / det, (q.rho * p.nx - p.rho * q.nx) / det]);
  }
  pts = snapped.length >= 3 ? snapped : pts;
  // A small jog where a window or door jamb pokes in or out (up to 10" deep, 4' wide), or a thin slit
  // (up to 6" wide, 4' deep), with the wall lining up on both sides of it: straightened out.
  pts = dropNicks(pts, 10 * inch, 4 * upf, 1.5 * inch, 2.5 * inch, 10 * upf);
  // 6. Across an opening into another room, the side runs on to the middle of the wall (see `middle`): that piece of
  // the side, pushed out from the wall's face to its center line. Not where the far side is the yard or a porch.
  if (opts.middle !== false && openSpan.size) {
    let outMap: Uint8Array | null = null;
    const farIsRoom = (x: number, y: number) => {
      const i = Math.floor((x - box.x0) / cell), j = Math.floor((y - box.y0) / cell);
      if (i < 0 || j < 0 || i >= W || j >= H || wallsOnly[j * W + i]) return false;
      outMap ??= outsideOfHouse();
      return !outMap[j * W + i];
    };
    // (Not from a porch or patio — the room clicked is outside: its side stays on the house's face, the doorway the
    // house's. The user's answer key, 2026-11-23.)
    const ci = Math.floor((click[0] - box.x0) / cell), cj = Math.floor((click[1] - box.y0) / cell);
    outMap ??= outsideOfHouse();
    const fromOutside = ci >= 0 && cj >= 0 && ci < W && cj < H && !!outMap[cj * W + ci];
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      out.push(a);
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 12 * inch || fromOutside) continue;
      const ux = (c[0] - a[0]) / L, uy = (c[1] - a[1]) / L;
      const cuts: [number, number, number, number, number][] = []; // along from, along to, push x, push y
      for (const [b, [o0, o1]] of openSpan) {
        // (Nor a garage door — over 7' wide, it opens onto the drive: the room stops at the wall's face. 2026-11-24.)
        if (Math.abs(ux * b.nx + uy * b.ny) > Math.sin(4 * DEG) || o1 - o0 < 12 * inch || o1 - o0 > 7 * upf) continue;
        const d = ((a[0] + c[0]) / 2) * b.nx + ((a[1] + c[1]) / 2) * b.ny - b.rho;
        // (The side on the opening's face — not one running down its middle already, or off in the room.)
        if (Math.abs(d) < b.half - inch || Math.abs(d) > b.half + 2 * inch || b.half < 1.5 * inch) continue;
        // (A real opening: not drawn along the wall's line most of the way across — a wall drawn in pieces, a window, a
        // pocket door's slab are. An arch's or cased opening's dashed header leaves gaps: ~70% on Kala.)
        if (drawnAlong(b, o0, o1) >= 0.85) continue;
        // Where the opening's stretch lies along this side.
        const sa = a[0] * b.ux + a[1] * b.uy, sc = c[0] * b.ux + c[1] * b.uy;
        let lo = Math.max(Math.min(sa, sc), o0), hi = Math.min(Math.max(sa, sc), o1);
        // (Not over a short piece of wall left at either end — a jamb's stub between the opening and a corner,
        // too short to count as a wall of its own: where the wall is drawn — both its faces, not a dimension's end
        // line laid along one — the room stops at its face.)
        const runs: [number, number][] = [];
        {
          const f0 = drawnRuns(b, lo, hi, 0.5 * inch, b.rho - b.half - inch, b.rho), f1 = drawnRuns(b, lo, hi, 0.5 * inch, b.rho, b.rho + b.half + inch);
          // (The far face has a gap where another wall joins it from beyond — a T: that's still wall, not opening.)
          const toFar = d > 0 ? -1 : 1, far = toFar > 0 ? f1 : f0;
          const isWall = (x: number, y: number) => {
            const i = Math.floor((x - box.x0) / cell), j = Math.floor((y - box.y0) / cell);
            return i >= 0 && j >= 0 && i < W && j < H && !!wallsOnly[j * W + i];
          };
          let t0: number | null = null;
          for (let t = lo; t <= hi + 1e-9; t += 0.5 * inch) {
            const w = isWall(...at2(b, t, toFar * (b.half + 2 * inch))) && isWall(...at2(b, t, toFar * (b.half + 4 * inch)));
            if (w && t0 === null) t0 = t;
            if ((!w || t + 0.5 * inch > hi) && t0 !== null) { far.push([t0, w ? hi : t]); t0 = null; }
          }
          far.sort((p, q) => p[0] - q[0]);
          for (let k = far.length - 1; k > 0; k--) if (far[k][0] <= far[k - 1][1] + 0.5 * inch) { far[k - 1][1] = Math.max(far[k - 1][1], far[k][1]); far.splice(k, 1); }
          for (const [a0, a1] of f0)
            for (const [c0, c1] of f1) {
              const x0 = Math.max(a0, c0), x1 = Math.min(a1, c1);
              if (x1 <= x0) continue;
              const r = runs[runs.length - 1];
              if (r && x0 <= r[1] + 0.5 * inch) r[1] = Math.max(r[1], x1);
              else runs.push([x0, x1]);
            }
          runs.sort((p, q) => p[0] - q[0]);
        }
        // (To the stub's drawn end, across the wall, where it has one: an arch's dashed header can start right at it.)
        const caps = (r0: number, r1: number) =>
          strokesNear(...at2(b, r0 - inch, -b.half), ...at2(b, r1 + inch, b.half))
            .filter((k) => Math.abs(Math.cos(k.ang - b.ang)) < Math.sin(10 * DEG))
            .filter((k) => {
              const e0 = k.x1 * b.nx + k.y1 * b.ny - b.rho, e1 = k.x2 * b.nx + k.y2 * b.ny - b.rho;
              return Math.min(e0, e1) <= -b.half + 0.5 * inch && Math.max(e0, e1) >= b.half - 0.5 * inch;
            })
            .map((k) => ((k.x1 + k.x2) / 2) * b.ux + ((k.y1 + k.y2) / 2) * b.uy)
            .filter((t) => t >= r0 - 0.5 * inch && t <= r1 + 0.5 * inch);
        if (runs.length && runs[0][0] <= lo + 0.5 * inch && runs[0][1] - runs[0][0] >= 2 * inch) {
          const c = caps(runs[0][0], runs[0][1]);
          lo = c.length ? Math.max(lo, ...c) : runs[0][1];
        }
        const lr = runs[runs.length - 1];
        if (lr && lr[1] >= hi - 0.5 * inch && lr[1] - lr[0] >= 2 * inch && lr[0] > lo) {
          const c = caps(lr[0], lr[1]);
          hi = c.length ? Math.min(hi, ...c) : lr[0];
        }
        if (hi - lo < 12 * inch) continue;
        const sign = d > 0 ? -1 : 1; // toward the wall's center
        const mid = (lo + hi) / 2;
        const fx = b.ux * mid + b.nx * (b.rho + sign * (b.half + 6 * inch)), fy = b.uy * mid + b.ny * (b.rho + sign * (b.half + 6 * inch));
        if (!farIsRoom(fx, fy)) continue;
        // (Outward only: the strip it takes in lies outside the room — never a wall's end standing in the room.)
        // (The side is at rho − sign·|d|: the room lies past it, away from the wall's center.)
        const at = (o: number): Pt => [b.ux * mid + b.nx * (b.rho + sign * o), b.uy * mid + b.ny * (b.rho + sign * o)];
        if (inside(pts, at(-Math.abs(d) / 2)) || !inside(pts, at(-Math.abs(d) - inch))) continue;
        const ta = (lo - sa) / (sc - sa), tb = (hi - sa) / (sc - sa);
        const [t0, t1] = ta < tb ? [ta, tb] : [tb, ta];
        cuts.push([t0 * L, t1 * L, b.nx * sign * Math.abs(d), b.ny * sign * Math.abs(d), 0]);
      }
      cuts.sort((p, q) => p[0] - q[0]);
      // (Two doorways side by side, the same push, a post up to 6" between them — a pair of doors: one stretch, no notch.)
      for (let k = cuts.length - 1; k > 0; k--) {
        const [p, q] = [cuts[k - 1], cuts[k]];
        if (q[0] >= p[1] && q[0] - p[1] <= 6 * inch && Math.hypot(q[2] - p[2], q[3] - p[3]) <= 0.5 * inch) {
          p[1] = Math.max(p[1], q[1]);
          cuts.splice(k, 1);
        }
      }
      let last = 0;
      for (const [t0, t1, px, py] of cuts) {
        if (t0 < last) continue;
        const at = (t: number): Pt => [a[0] + ux * t, a[1] + uy * t];
        const p0 = at(t0), p1 = at(t1);
        out.push(p0, [p0[0] + px, p0[1] + py], [p1[0] + px, p1[1] + py], p1);
        last = t1;
      }
    }
    // (Corners that landed on each other where a piece started at a corner: one.)
    pts = out.filter((q, k) => { const r = out[(k + out.length - 1) % out.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 0.05 * inch; });
  }
  {
    // (No strips under 4" wide poking out of the room — a door leaf's slot: points in a straight line first made
    // one side, then any two sides running out and back that close together, their end cut off.)
    pts = pts.filter((q, i) => {
      const [p, r] = [pts[(i + pts.length - 1) % pts.length], pts[(i + 1) % pts.length]];
      return Math.abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) > 0.02 * Math.hypot(q[0] - p[0], q[1] - p[1]) * Math.hypot(r[0] - q[0], r[1] - q[1]);
    });
    for (let guard = 0; guard < 50 && pts.length > 5; guard++) {
      const n = pts.length;
      let cut = -1;
      for (let i = 0; i < n && cut < 0; i++) {
        const [a, b, c, d] = [pts[i], pts[(i + 1) % n], pts[(i + 2) % n], pts[(i + 3) % n]];
        const [u, w] = [[b[0] - a[0], b[1] - a[1]], [d[0] - c[0], d[1] - c[1]]], [lu, lw] = [Math.hypot(...u), Math.hypot(...w)];
        const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
        if (bc > 4 * inch || lu < 2 * bc || lw < 2 * bc || (u[0] * w[0] + u[1] * w[1]) / (lu * lw) > -Math.cos(10 * DEG)) continue;
        // (Out of the room — or a notch into it along a door's leaf, the leaf's own thin box cut out of the floor. A
        // 3½" stub wall standing into the room is a notch too, and stays out.)
        if (Math.sign(shoelace([a, b, c, d])) !== Math.sign(shoelace(pts))) {
          const m: Pt = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4];
          const leaf = (opts.doors ?? []).some((dr) =>
            [dr.a, dr.b].some((e) => {
              if (!e) return false;
              const L = Math.hypot(e[0] - dr.x, e[1] - dr.y);
              if (L < upf || Math.abs((e[0] - dr.x) * u[1] - (e[1] - dr.y) * u[0]) / (L * lu) > Math.sin(10 * DEG)) return false;
              return distToSeg(m[0], m[1], { x1: dr.x, y1: dr.y, x2: e[0], y2: e[1] }) <= 3 * inch;
            }),
          );
          if (!leaf) continue;
        }
        cut = i;
      }
      if (cut < 0) break;
      pts = pts.filter((_, k) => k !== (cut + 1) % n && k !== (cut + 2) % n);
    }
  }
  // 7. No short slanted bits left: a side under a foot, off the room's own directions (its sides 2' and longer) and
  // on nothing drawn, is a corner the grid bit into — squared off whichever way changes the floor least: one of its
  // ends dropped, or the sides either side of it run on to meet. (The user's real clicks, 2026-11-24: the commonest
  // 2"–6" miss.)
  {
    const dirs = pts.flatMap((a, i) => { const b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return L >= 2 * upf ? [Math.atan2(b[1] - a[1], b[0] - a[0])] : []; });
    const onDir = (a: Pt, b: Pt) => { const t = Math.atan2(b[1] - a[1], b[0] - a[0]); return dirs.some((d) => Math.abs(Math.sin(2 * (t - d))) < Math.sin(6 * DEG)) || Math.abs(Math.sin(2 * t)) < Math.sin(3 * DEG); };
    const drawn = (a: Pt, b: Pt) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.atan2(b[1] - a[1], b[0] - a[0]);
      return strokesNear(Math.min(a[0], b[0]) - inch, Math.min(a[1], b[1]) - inch, Math.max(a[0], b[0]) + inch, Math.max(a[1], b[1]) + inch).some(
        (k) => Math.abs(Math.sin(k.ang - t)) < Math.sin(4 * DEG) && k.s1 - k.s0 >= 0.8 * L && distToSeg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, k) <= inch,
      );
    };
    const meet = (p: Pt, q: Pt, r: Pt, s: Pt): Pt | null => {
      const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
      if (Math.abs(d) < 1e-9) return null;
      const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
    };
    for (let guard = 0; guard < 12 && pts.length > 4; guard++) {
      const n = pts.length;
      let fixed = false;
      for (let i = 0; i < n && !fixed; i++) {
        const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L > 12 * inch || L < 0.25 * inch || onDir(a, b) || drawn(a, b)) continue;
        const p = pts[(i + n - 1) % n], c = pts[(i + 2) % n];
        const opts2: Pt[][] = [];
        opts2.push(pts.filter((_, k) => k !== (i + 1) % n)); // drop b
        opts2.push(pts.filter((_, k) => k !== i)); // drop a
        const m = meet(p, a, b, c);
        if (m && Math.hypot(m[0] - a[0], m[1] - a[1]) <= 18 * inch && Math.hypot(m[0] - b[0], m[1] - b[1]) <= 18 * inch)
          opts2.push(pts.flatMap((q, k) => (k === i ? [m] : k === (i + 1) % n ? [] : [q])));
        const A0 = Math.abs(shoelace(pts));
        let best: Pt[] | null = null, bestD = L * 6 * inch;
        for (const o of opts2) {
          // (Every side it leaves at the fix square to the room — no new slant.)
          const ok = o.every((q, k) => { const r = o[(k + 1) % o.length]; const LL = Math.hypot(r[0] - q[0], r[1] - q[1]); return LL < 0.25 * inch || onDir(q, r) || drawn(q, r) || !((Math.hypot(q[0] - a[0], q[1] - a[1]) < 2 * upf) || (Math.hypot(r[0] - b[0], r[1] - b[1]) < 2 * upf)); });
          const dA = Math.abs(Math.abs(shoelace(o)) - A0);
          if (ok && dA < bestD) { bestD = dA; best = o; }
        }
        if (best) { pts = best; fixed = true; }
      }
      if (!fixed) break;
    }
    // (A short side across a wall's end — a stub's or jamb's end, under 8" — onto the end's drawn line when one runs
    // along it within 5": the user's fixes, 2026-11-24, pull these 2"–4" onto the line.)
    {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[(i + n - 1) % n], a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L > 8 * inch || L < 1.5 * inch) continue;
        const [ux, uy] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], [nx, ny] = [-uy, ux];
        // (Square to both its neighbours, which run on 6" or more: it's an end, not a jog.)
        const sq = (q: Pt, r: Pt) => { const l = Math.hypot(r[0] - q[0], r[1] - q[1]); return l >= 6 * inch && Math.abs(((r[0] - q[0]) * ux + (r[1] - q[1]) * uy) / l) < Math.sin(5 * DEG); };
        if (!sq(p, a) || !sq(b, c)) continue;
        const rho = a[0] * nx + a[1] * ny, s0 = Math.min(a[0] * ux + a[1] * uy, b[0] * ux + b[1] * uy), s1 = s0 + L;
        let best: number | null = null;
        for (const k of strokesNear(Math.min(a[0], b[0]) - 5 * inch, Math.min(a[1], b[1]) - 5 * inch, Math.max(a[0], b[0]) + 5 * inch, Math.max(a[1], b[1]) + 5 * inch)) {
          if (Math.abs(Math.sin(k.ang - Math.atan2(uy, ux))) > Math.sin(3 * DEG) || k.s1 - k.s0 > 14 * inch) continue;
          const kr = ((k.x1 + k.x2) / 2) * nx + ((k.y1 + k.y2) / 2) * ny, d = kr - rho;
          const t1 = k.x1 * ux + k.y1 * uy, t2 = k.x2 * ux + k.y2 * uy;
          if (Math.abs(d) < 0.5 * inch || Math.abs(d) > 5 * inch || Math.min(s1, Math.max(t1, t2)) - Math.max(s0, Math.min(t1, t2)) < 0.8 * L) continue;
          if (best === null || Math.abs(d) < Math.abs(best)) best = d;
        }
        if (best === null) continue;
        pts[i] = [a[0] + nx * best, a[1] + ny * best];
        pts[(i + 1) % n] = [b[0] + nx * best, b[1] + ny * best];
      }
    }
    // (And a tiny tab at a corner — two sides under 6" stepping out past it, into a jamb: the corner, square.)
    for (let guard = 0; guard < 12 && pts.length > 5; guard++) {
      const n = pts.length;
      let fixed = false;
      for (let i = 0; i < n && !fixed; i++) {
        const p = pts[(i + n - 1) % n], a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n], d = pts[(i + 3) % n];
        const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
        if (ab > 6 * inch || bc > 6 * inch || ab < 0.25 * inch || bc < 0.25 * inch) continue;
        const [u1, u2] = [[a[0] - p[0], a[1] - p[1]], [d[0] - c[0], d[1] - c[1]]], l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
        if (l1 < 6 * inch || l2 < 6 * inch || Math.abs(u1[0] * u2[1] - u1[1] * u2[0]) / (l1 * l2) < Math.sin(60 * DEG)) continue;
        const m = meet(p, a, c, d);
        if (!m || Math.hypot(m[0] - b[0], m[1] - b[1]) > 8 * inch) continue;
        const o = pts.flatMap((q, k) => (k === i ? [m] : k === (i + 1) % n || k === (i + 2) % n ? [] : [q]));
        if (Math.abs(Math.abs(shoelace(o)) - Math.abs(shoelace(pts))) > 36 * inch * inch) continue;
        pts = o;
        fixed = true;
      }
      if (!fixed) break;
    }
    pts = pts.filter((q, k) => { const r = pts[(k + pts.length - 1) % pts.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 0.05 * inch; });
  }
  const areaSf = Math.abs(shoelace(pts)) / (upf * upf);
  if (areaSf < 2) return { ok: false, reason: "too-small" };
  return { ok: true, outline: pts, areaSf };
}

/** Bands by where they are (cells of `size`): the ones within r of a point. */
/**
 * The dimension lines among `lines`: a line ending at a tick, or a piece
 * of one broken up around its numbers. `strokesNear` finds lines in a box; `upf`: page units per foot.
 */
function dimensionsIn(lines: Line[], strokesNear: ReturnType<typeof grid>, upf: number): { dimension: Set<Line> } {
  const inch = upf / 12;
  // A dimension (or its extension line) isn't a wall's face: it ends at a tick — a short slash crossing
  // it right through (hatching only runs up to a wall's face). A dimension drawn up to a wall puts its
  // tick on the wall's face too, but partway along the face, not at its end. Two dimension strings close
  // together would otherwise look like a wall.
  // Hatching: a row of short strokes alike, packed side by side (brick, a hatched stud space) — not
  // ticks (two dimension strings' ticks at one mark are alike, but a foot or so apart).
  const inHatchRow = (m: Line) => {
    const len = m.s1 - m.s0;
    const [mx, my] = [(m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2];
    let like = 0;
    for (const o of strokesNear(mx, my, mx, my))
      if (o !== m && Math.abs(Math.sin(o.ang - m.ang)) < Math.sin(1.5 * DEG) && Math.abs(o.s1 - o.s0 - len) < 0.5 * inch && Math.abs(o.rho - m.rho) >= 0.3 * inch && Math.abs(o.rho - m.rho) <= 4 * inch && ++like >= 3)
        return true;
    return false;
  };
  // A hatch stroke runs from one of a wall's faces to the other — both its ends on lines (even one cut
  // short at a corner, unlike the rest of its row). A tick floats free.
  const boundAtBothEnds = (m: Line) =>
    [
      [m.x1, m.y1],
      [m.x2, m.y2],
    ].every(([x, y]) => strokesNear(x, y, x, y).some((k) => k !== m && Math.abs(Math.sin(k.ang - m.ang)) > Math.sin(15 * DEG) && distToSeg(x, y, k) <= 0.3 * inch));
  // …or in the middle of hatching: strokes the same way packed around it, whatever their lengths (a row's
  // strokes clipped short where a wall starts don't look alike). A tick has its twin, if drawn twice.
  const inHatching = (m: Line) => {
    const [mx, my] = [(m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2];
    let n = 0;
    for (const k of strokesNear(mx, my, mx, my)) {
      if (k === m || k.s1 - k.s0 > upf || Math.abs(Math.sin(k.ang - m.ang)) > Math.sin(3 * DEG)) continue;
      if (Math.hypot((k.x1 + k.x2) / 2 - mx, (k.y1 + k.y2) / 2 - my) <= 5 * inch && Math.abs(k.rho - m.rho) >= 0.3 * inch && ++n >= 3) return true;
    }
    return false;
  };
  const ticked = (l: Line) => {
    // (Only the strokes around its two ends.)
    for (const m of [...strokesNear(l.x1, l.y1, l.x1, l.y1), ...strokesNear(l.x2, l.y2, l.x2, l.y2)]) {
      if (m === l || m.s1 - m.s0 > upf) continue;
      const slant = Math.abs(Math.sin(m.ang - l.ang));
      if (slant < Math.sin(20 * DEG) || slant > Math.sin(80 * DEG)) continue;
      const o1 = m.x1 * l.nx + m.y1 * l.ny - l.rho;
      const o2 = m.x2 * l.nx + m.y2 * l.ny - l.rho;
      if (Math.sign(o1) === Math.sign(o2) || Math.min(Math.abs(o1), Math.abs(o2)) < 0.5 * inch || Math.abs((o1 + o2) / 2) > 0.6 * inch) continue;
      const sm = ((m.x1 + m.x2) / 2) * l.ux + ((m.y1 + m.y2) / 2) * l.uy;
      if (Math.min(Math.abs(sm - l.s0), Math.abs(sm - l.s1)) > 2 * inch || inHatchRow(m) || inHatching(m) || boundAtBothEnds(m)) continue;
      return true;
    }
    return false;
  };
  // A dimension string is one line broken up around its numbers: a piece of it between two labels has
  // no tick of its own — but dimension pieces on both sides of it along the same line. (A wall's face
  // can line up with a dimension's extension line, but only ever on one side.)
  const lineKey = (l: Line) => `${Math.round(l.ang / DEG + 180) % 180}:${Math.round(l.rho / (0.3 * inch))}`;
  const onLine = new Map<string, Line[]>();
  for (const l of lines) {
    if (l.s1 - l.s0 < 6 * inch) continue;
    const k = lineKey(l);
    const list = onLine.get(k);
    if (list) list.push(l);
    else onLine.set(k, [l]);
  }
  // …or at an arrowhead: two short strokes from the line's very end, angled back along it either side (8°–35°).
  // (Chirafis's plan, 2026-11-24: arrows, no ticks — its dimension lines ran down through the rooms as walls.)
  const arrowed = (l: Line) =>
    [
      [l.x1, l.y1, 1],
      [l.x2, l.y2, -1],
    ].some(([ex, ey, dir]) => {
      // (dir: from this end into the line, along u.)
      const sides = new Set<number>();
      const [ux, uy] = [((l.x2 - l.x1) / Math.hypot(l.x2 - l.x1, l.y2 - l.y1)) * dir, ((l.y2 - l.y1) / Math.hypot(l.x2 - l.x1, l.y2 - l.y1)) * dir];
      for (const m of strokesNear(ex - inch, ey - inch, ex + inch, ey + inch)) {
        if (m === l || m.s1 - m.s0 > 8 * inch || m.s1 - m.s0 < 1.5 * inch) continue;
        const d1 = Math.hypot(m.x1 - ex, m.y1 - ey), d2 = Math.hypot(m.x2 - ex, m.y2 - ey);
        if (Math.min(d1, d2) > 0.5 * inch) continue;
        const [fx, fy] = d1 < d2 ? [m.x2, m.y2] : [m.x1, m.y1];
        const L = Math.hypot(fx - ex, fy - ey), along = ((fx - ex) * ux + (fy - ey) * uy) / L, across = ((fx - ex) * -uy + (fy - ey) * ux) / L;
        if (along < Math.cos(35 * DEG) || Math.abs(across) < Math.sin(8 * DEG)) continue;
        sides.add(Math.sign(across));
      }
      return sides.size === 2;
    });
  // A wall's face isn't a dimension, though a tick or arrow lands at its end: hatching packed against it — short strokes alike,
  // side by side, running off it across to the wall's other face (2026-11-24, Goines: a
  // dimension's tick at the garage wall's end made its face a dimension — the garage ran on through the house).
  // (Lines by direction and offset, either way round: a line's normal flips near 180°.)
  const faceKey = (l: Line): [number, number] => { const a = Math.round(l.ang / DEG); return a >= 180 ? [0, -1] : [a, 1]; };
  const faces = new Map<string, Line[]>();
  for (const l of lines) {
    if (l.s1 - l.s0 < 6 * inch) continue;
    const [a, f] = faceKey(l), k = `${a}:${Math.round((f * l.rho) / (0.3 * inch))}`;
    (faces.get(k) ?? faces.set(k, []).get(k)!).push(l);
  }
  const hatchedFace = (l: Line) => {
    // (A long face only — a jamb's stub beside a garage door, ticked by the door's dimension, stays out of it.)
    if (l.s1 - l.s0 < 4 * upf) return false;
    let hits = 0;
    for (let k = 1; k <= 5; k++) {
      const sv = l.s0 + ((l.s1 - l.s0) * k) / 6, x = l.ux * sv + l.nx * l.rho, y = l.uy * sv + l.ny * l.rho;
      const box = strokesNear(x - 8 * inch, y - 8 * inch, x + 8 * inch, y + 8 * inch);
      // (Alike strokes side by side: three or more the same way and length within the 16" around — hatching's
      // spacing varies, 2"–6", so not inHatchRow's.)
      const row = (m: Line) => box.filter((k) => k !== m && Math.abs(Math.sin(k.ang - m.ang)) < Math.sin(3 * DEG) && Math.abs(k.s1 - k.s0 - (m.s1 - m.s0)) < inch && Math.abs(k.rho - m.rho) >= 0.3 * inch).length >= 3;
      const found = box.some((m) => {
        if (m === l || m.s1 - m.s0 > 10 * inch || Math.abs(Math.sin(m.ang - l.ang)) < Math.sin(20 * DEG)) return false;
        const o1 = m.x1 * l.nx + m.y1 * l.ny - l.rho, o2 = m.x2 * l.nx + m.y2 * l.ny - l.rho;
        if (Math.min(Math.abs(o1), Math.abs(o2)) > 0.3 * inch || Math.max(Math.abs(o1), Math.abs(o2)) < inch) return false;
        const sm = ((m.x1 + m.x2) / 2) * l.ux + ((m.y1 + m.y2) / 2) * l.uy;
        if (sm < l.s0 || sm > l.s1 || Math.hypot((m.x1 + m.x2) / 2 - x, (m.y1 + m.y2) / 2 - y) > 4 * inch || !row(m)) return false;
        // (Its far end on the wall's other face: a line parallel to this one, 1"–14" off.)
        const [fx, fy] = Math.abs(o1) > Math.abs(o2) ? [m.x1, m.y1] : [m.x2, m.y2], fr = fx * l.nx + fy * l.ny, fs = fx * l.ux + fy * l.uy;
        const [ak, flip] = faceKey(l), r = flip * fr;
        for (let d = -1; d <= 1; d++) for (const f of faces.get(`${ak}:${Math.round(r / (0.3 * inch)) + d}`) ?? []) if (f !== l && Math.abs(faceKey(f)[1] * f.rho - r) <= 0.3 * inch && Math.abs(f.ux * l.ux + f.uy * l.uy) > 0.99) {
          const t = fx * f.ux + fy * f.uy;
          if (t >= f.s0 - inch && t <= f.s1 + inch) return true;
        }
        return false;
      });
      if (found && ++hits >= 4) return true;
    }
    return false;
  };
  const dimension = new Set<Line>();
  for (const l of lines) if (l.s1 - l.s0 >= 6 * inch && (ticked(l) || arrowed(l)) && !hatchedFace(l)) dimension.add(l);
  for (let pass = 0; pass < 3; pass++)
    for (const list of onLine.values()) {
      if (!list.some((l) => dimension.has(l))) continue;
      for (const l of list) {
        if (dimension.has(l)) continue;
        const before = list.some((d) => dimension.has(d) && d.s1 <= l.s0 + inch && l.s0 - d.s1 <= 4 * upf);
        const after = list.some((d) => dimension.has(d) && d.s0 >= l.s1 - inch && d.s0 - l.s1 <= 4 * upf);
        if (before && after) dimension.add(l);
      }
    }
  return { dimension };
}

/**
 * A sheet's dimension lines and their ticks, each as segments [x1, y1, x2, y2, …] in page units — the
 * same check Find area uses to tell a dimension from a wall. (Auto-count blanks them out before it searches.)
 * With the sheet's text, a line also needs its measurement written along it (12'-6") — or to be a piece of
 * the same string as one that does: something drawn with a mark at its end (a sink, a counter) isn't one.
 */
export function findDimensions(
  segments: Float32Array | number[],
  unitsPerFoot: number,
  text?: { str: string; box: [number, number, number, number] }[],
): { lines: number[]; ticks: number[] } {
  const inch = unitsPerFoot / 12;
  const lines: Line[] = [];
  for (let i = 0; i + 3 < segments.length; i += 4) {
    const l = toLine(segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
    if (l && l.s1 - l.s0 >= inch) lines.push(l);
  }
  const near = grid(lines, unitsPerFoot);
  let { dimension } = dimensionsIn(lines, near, unitsPerFoot);
  if (text) {
    // Measurements: 12'-6", 5'-1", 7'-10 (the ½ often a piece of its own).
    const sizes = text.filter((t) => /\d\s*['"′″]/.test(t.str) || /^\d+\s*\/\s*\d+"?$/.test(t.str)).map((t) => [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2]);
    const labeled = (d: Line) =>
      sizes.some(([x, y]) => {
        const along = x * d.ux + y * d.uy;
        return Math.abs(x * d.nx + y * d.ny - d.rho) <= unitsPerFoot * 0.75 && along >= d.s0 - unitsPerFoot && along <= d.s1 + unitsPerFoot;
      });
    const kept = new Set([...dimension].filter(labeled));
    // The rest of each labeled string: pieces on the same line, end to end with a kept one.
    const key = (l: Line) => `${Math.round(l.ang / DEG + 180) % 180}:${Math.round(l.rho / (0.3 * inch))}`;
    for (let grew = true; grew; ) {
      grew = false;
      for (const l of dimension) {
        if (kept.has(l)) continue;
        if ([...kept].some((k) => key(k) === key(l) && l.s0 <= k.s1 + 4 * unitsPerFoot && l.s1 >= k.s0 - 4 * unitsPerFoot)) {
          kept.add(l);
          grew = true;
        }
      }
    }
    dimension = kept;
  }
  // Their ticks, and every mark along a string (a tick partway along, where two dimensions meet): a short
  // stroke crossing a dimension line, slanted to it.
  const ticks = new Set<Line>();
  for (const d of dimension)
    for (const m of near(Math.min(d.x1, d.x2) - inch, Math.min(d.y1, d.y2) - inch, Math.max(d.x1, d.x2) + inch, Math.max(d.y1, d.y2) + inch)) {
      if (m === d || dimension.has(m) || m.s1 - m.s0 > unitsPerFoot / 2 || Math.abs(Math.sin(m.ang - d.ang)) < Math.sin(20 * DEG)) continue;
      const o1 = m.x1 * d.nx + m.y1 * d.ny - d.rho;
      const o2 = m.x2 * d.nx + m.y2 * d.ny - d.rho;
      const along = ((m.x1 + m.x2) / 2) * d.ux + ((m.y1 + m.y2) / 2) * d.uy;
      if (Math.sign(o1) !== Math.sign(o2) && along >= d.s0 - inch && along <= d.s1 + inch) ticks.add(m);
    }
  const flat = (set: Set<Line>) => [...set].flatMap((l) => [l.x1, l.y1, l.x2, l.y2]);
  return { lines: flat(dimension), ticks: flat(ticks) };
}

/** A sheet's drawing's width and height (page units), from its line work. */
const sizeCache = new WeakMap<object, [number, number]>();
function sheetSize(segments: Float32Array | number[]): [number, number] {
  const known = sizeCache.get(segments);
  if (known) return known;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < segments.length; i += 2) {
    x0 = Math.min(x0, segments[i]);
    x1 = Math.max(x1, segments[i]);
    y0 = Math.min(y0, segments[i + 1]);
    y1 = Math.max(y1, segments[i + 1]);
  }
  const size: [number, number] = [x1 - x0, y1 - y0];
  sizeCache.set(segments, size);
  return size;
}

/**
 * What's outside the house on a room finder's grid (`blocked`: the walls; W×H cells): reached from the
 * grid's edge without coming within `r` cells of a wall — so through no gap narrower than 2r — and then
 * out to r cells around that. A doorway or a window is shut to it; the yard and a porch aren't.
 */
function houseOutside(blocked: Uint8Array, W: number, H: number, r: number): Uint8Array {
  // Distances (3 a step, 4 a diagonal), to the walls, then to the outside found.
  const distance = (seed: (k: number) => boolean) => {
    const d = new Int32Array(W * H).fill(1 << 29);
    for (let k = 0; k < W * H; k++) if (seed(k)) d[k] = 0;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + 3);
        if (j > 0) {
          v = Math.min(v, d[k - W] + 3);
          if (i > 0) v = Math.min(v, d[k - W - 1] + 4);
          if (i < W - 1) v = Math.min(v, d[k - W + 1] + 4);
        }
        d[k] = v;
      }
    for (let j = H - 1; j >= 0; j--)
      for (let i = W - 1; i >= 0; i--) {
        const k = j * W + i;
        let v = d[k];
        if (i < W - 1) v = Math.min(v, d[k + 1] + 3);
        if (j < H - 1) {
          v = Math.min(v, d[k + W] + 3);
          if (i < W - 1) v = Math.min(v, d[k + W + 1] + 4);
          if (i > 0) v = Math.min(v, d[k + W - 1] + 4);
        }
        d[k] = v;
      }
    return d;
  };
  const toWall = distance((k) => blocked[k] === 1);
  const far = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let top = 0;
  for (let i = 0; i < W; i++)
    for (const j of [0, H - 1]) {
      const k = j * W + i;
      if (!far[k] && toWall[k] > 3 * r) {
        far[k] = 1;
        stack[top++] = k;
      }
    }
  for (let j = 0; j < H; j++)
    for (const i of [0, W - 1]) {
      const k = j * W + i;
      if (!far[k] && toWall[k] > 3 * r) {
        far[k] = 1;
        stack[top++] = k;
      }
    }
  while (top) {
    const k = stack[--top];
    const i = k % W;
    for (const n of [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, k - W, k + W])
      if (n >= 0 && n < W * H && !far[n] && toWall[n] > 3 * r) {
        far[n] = 1;
        stack[top++] = n;
      }
  }
  const toFar = distance((k) => far[k] === 1);
  const out = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (!blocked[k] && toFar[k] <= 3 * r) out[k] = 1;
  return out;
}

function bandGrid(bands: Band[], size: number) {
  const cells = new Map<string, Band[]>();
  for (const b of bands) {
    const xs = [b.s0, b.s1].map((sv) => b.ux * sv + b.nx * b.rho);
    const ys = [b.s0, b.s1].map((sv) => b.uy * sv + b.ny * b.rho);
    for (let i = Math.floor((Math.min(...xs) - b.half) / size); i <= Math.floor((Math.max(...xs) + b.half) / size); i++)
      for (let j = Math.floor((Math.min(...ys) - b.half) / size); j <= Math.floor((Math.max(...ys) + b.half) / size); j++) {
        const k = `${i},${j}`;
        const list = cells.get(k);
        if (list) list.push(b);
        else cells.set(k, [b]);
      }
  }
  return (x: number, y: number, r: number) => {
    const out = new Set<Band>();
    for (let i = Math.floor((x - r) / size); i <= Math.floor((x + r) / size); i++)
      for (let j = Math.floor((y - r) / size); j <= Math.floor((y + r) / size); j++) for (const b of cells.get(`${i},${j}`) ?? []) out.add(b);
    return [...out];
  };
}

function distToBand(x: number, y: number, v: Band) {
  return distToSeg(x, y, { x1: v.ux * v.s0 + v.nx * v.rho, y1: v.uy * v.s0 + v.ny * v.rho, x2: v.ux * v.s1 + v.nx * v.rho, y2: v.uy * v.s1 + v.ny * v.rho }) - v.half;
}

/** Takes out notches — in or out, up to `depth` deep and `width` wide — where the sides before and after line up (within tol). */
function dropNicks(pts: Pt[], depth: number, width: number, tol: number, hair = 0, hairDepth = 0): Pt[] {
  let out = pts;
  for (let changed = true; changed && out.length > 4; ) {
    changed = false;
    const n = out.length;
    for (let i = 0; i < n && !changed; i++) {
      // The notch: corners a b c d (sides ab and cd short and opposite, bc its width), between sides
      // za and de that run on one line.
      const [z, a, b, c, d, e] = [-1, 0, 1, 2, 3, 4].map((k) => out[(i + k + n) % n]);
      const v = (p: Pt, q: Pt) => [q[0] - p[0], q[1] - p[1]];
      const len = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
      const [ab, cd, za, de] = [v(a, b), v(c, d), v(z, a), v(d, e)];
      // (A shallow jog — a jamb — or a thin slit: a line poking in from the wall, like a dimension's
      // extension line or a symbol's leader. One thinner than any wall — `hair` — however deep, up to
      // `hairDepth`: a symbol drawn against the wall, stretched across the room.)
      const deep = Math.max(len(a, b), len(c, d));
      if (!((deep <= depth && len(b, c) <= width) || (len(b, c) <= depth * 0.6 && deep <= width) || (len(b, c) <= hair && deep <= hairDepth))) continue;
      // ab and cd opposite; za and de the same way, on one line through a and d.
      if (ab[0] * cd[0] + ab[1] * cd[1] >= 0 || za[0] * de[0] + za[1] * de[1] <= 0) continue;
      const zl = len(z, a);
      const off = Math.abs(((d[0] - a[0]) * za[1] - (d[1] - a[1]) * za[0]) / (zl || 1));
      if (off > tol) continue;
      out = out.filter((_, k) => ![(i + 0) % n, (i + 1) % n, (i + 2) % n, (i + 3) % n].includes(k));
      changed = true;
    }
  }
  return out;
}

function shoelace(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** A closed loop with its stair-steps and wobbles taken out (Douglas–Peucker, within tol). */
function simplify(loop: Pt[], tol: number): Pt[] {
  if (loop.length < 4) return loop;
  // Split at the point farthest from the first, then simplify each half as an open line.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const dp = (p: Pt[]): Pt[] => {
    if (p.length < 3) return p;
    const seg = { x1: p[0][0], y1: p[0][1], x2: p[p.length - 1][0], y2: p[p.length - 1][1] };
    let idx = 0;
    let max = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const d = distToSeg(p[i][0], p[i][1], seg);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max <= tol) return [p[0], p[p.length - 1]];
    return [...dp(p.slice(0, idx + 1)).slice(0, -1), ...dp(p.slice(idx))];
  };
  const a = dp(loop.slice(0, far + 1));
  const b = dp([...loop.slice(far), loop[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * An area's outline cut in two along the line through a and b (drawn across it — a split between an
 * open kitchen and living room, say): the two outlines, or null when the line doesn't cross it. Where
 * the line crosses the outline more than twice (an L-shaped area), it's cut at the crossings either
 * side of the line you drew.
 */
export function splitOutline(points: Pt[], a: Pt, b: Pt): [Pt[], Pt[]] | null {
  const n = points.length;
  if (n < 3) return null;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!(len2 > 0)) return null;
  // Where the line crosses each side: how far along the line (t, a = 0, b = 1), and the side.
  const hits: { t: number; side: number; p: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
    const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
    if (u < 0 || u >= 1) continue;
    hits.push({ t, side: i, p: [a[0] + dx * t, a[1] + dy * t] });
  }
  hits.sort((x, y) => x.t - y.t);
  // The two crossings around the middle of what you drew, with the outline's inside between them.
  const mid = 0.5;
  let k = -1;
  for (let i = 0; i + 1 < hits.length; i++) if (hits[i].t <= mid && hits[i + 1].t >= mid) k = i;
  if (k < 0) {
    // Drawn all inside (short of the edges) or all past one end: the nearest pair either way.
    for (let i = 0; i + 1 < hits.length; i++) if (k < 0 || Math.abs((hits[i].t + hits[i + 1].t) / 2 - mid) < Math.abs((hits[k].t + hits[k + 1].t) / 2 - mid)) k = i;
  }
  if (k < 0) return null;
  const [h1, h2] = [hits[k], hits[k + 1]];
  const m: Pt = [(h1.p[0] + h2.p[0]) / 2, (h1.p[1] + h2.p[1]) / 2];
  if (!inside(points, m) || h1.side === h2.side) return null;
  // Walk the outline from one crossing to the other, then back across the cut.
  const walk = (from: { side: number; p: Pt }, to: { side: number; p: Pt }) => {
    const out: Pt[] = [from.p];
    for (let i = (from.side + 1) % n; ; i = (i + 1) % n) {
      out.push(points[i]);
      if (i === to.side) break;
    }
    out.push(to.p);
    return out;
  };
  const one = walk(h1, h2);
  const two = walk(h2, h1);
  if (Math.abs(shoelace(one)) < 1e-6 || Math.abs(shoelace(two)) < 1e-6) return null;
  return [one, two];
}

/**
 * An area's outline cut in two along a line of several clicks (a split that jogs around a wall or a
 * closet): the line's first and last pieces run on out to the outline; the clicks between are the
 * cut's corners and have to be inside the area. Two clicks: a straight cut (splitOutline).
 */
export function splitOutlineAlong(points: Pt[], path: Pt[], near = 0): [Pt[], Pt[]] | null {
  const clicks = path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) > 1e-6);
  if (clicks.length < 2) return null;
  const n = points.length;
  if (n < 3) return null;
  const total = Math.abs(shoelace(points));
  if (!(total > 0)) return null;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const eps = size * 1e-9;
  const tol = Math.max(near, eps);
  // A click on the outline (on an edge or a corner): the cut ends right there.
  const onOutline = (q: Pt): { side: number; u: number; p: Pt } | null => {
    let best: { side: number; u: number; p: Pt; d: number } | null = null;
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const len2 = ex * ex + ey * ey;
      if (!len2) continue;
      const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / len2));
      const p: Pt = [a[0] + ex * u, a[1] + ey * u];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= tol && (!best || d < best.d - eps)) best = { side: i, u, p, d };
    }
    if (!best) return null;
    // A corner is the start of the side after it (so the walk round the outline keeps it once).
    if (best.u >= 1 - 1e-9) return { side: (best.side + 1) % n, u: 0, p: points[(best.side + 1) % n] };
    if (best.u <= 1e-9) return { side: best.side, u: 0, p: points[best.side] };
    return { side: best.side, u: best.u, p: best.p };
  };
  // Two clicks: the cut runs out both ways from between them (clicks short of the edges, or past them).
  let aim: Pt | null = null;
  if (clicks.length === 2) {
    const m: Pt = [(clicks[0][0] + clicks[1][0]) / 2, (clicks[0][1] + clicks[1][1]) / 2];
    if (!inside(points, m) && !(onOutline(clicks[0]) && onOutline(clicks[1]))) return splitOutline(points, clicks[0], clicks[1]);
    clicks.splice(1, 0, m);
    aim = m;
  }
  const mids = clicks.slice(1, -1);
  if (!mids.every((p) => inside(points, p) || onOutline(p))) return null;
  // From `from` out through `to` (and on past it): the first place it crosses the outline.
  const out = (from: Pt, to: Pt): { side: number; u: number; p: Pt } | null => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    let best: { side: number; u: number; p: Pt; t: number } | null = null;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const q = points[(i + 1) % n];
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p[0] - from[0]) * ey - (p[1] - from[1]) * ex) / den;
      const u = ((p[0] - from[0]) * dy - (p[1] - from[1]) * dx) / den;
      if (u < 0 || u >= 1 || t <= 1e-9) continue;
      if (!best || t < best.t) best = { side: i, u, p: [from[0] + dx * t, from[1] + dy * t], t };
    }
    return best;
  };
  const h1 = onOutline(clicks[0]) ?? out(clicks[1], clicks[0]);
  const h2 = onOutline(clicks[clicks.length - 1]) ?? out(clicks[clicks.length - 2], clicks[clicks.length - 1]);
  if (!h1 || !h2) return null;
  if (h1.side === h2.side && Math.abs(h1.u - h2.u) < 1e-9) return null;
  // Round the outline from one crossing to the other (all the way round when both are on one side
  // and the second comes first along it).
  const walk = (from: { side: number; u: number; p: Pt }, to: { side: number; u: number; p: Pt }) => {
    const pts: Pt[] = [from.p];
    if (from.side === to.side && to.u > from.u) return [...pts, to.p];
    for (let i = (from.side + 1) % n; ; i = (i + 1) % n) {
      pts.push(points[i]);
      if (i === to.side) break;
    }
    pts.push(to.p);
    return pts;
  };
  // A corner clicked (or a cut along an edge) leaves no point twice, one on top of the other.
  const tidy = (pts: Pt[]) => {
    const t = pts.filter((p, i) => Math.hypot(p[0] - pts[(i + 1) % pts.length][0], p[1] - pts[(i + 1) % pts.length][1]) > eps);
    return t.filter((p, i) => {
      const a = t[(i - 1 + t.length) % t.length], b = t[(i + 1) % t.length];
      // (nor a point the outline doubles back through)
      return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > eps * size || (p[0] - a[0]) * (b[0] - p[0]) + (p[1] - a[1]) * (b[1] - p[1]) > 0;
    });
  };
  // (The two-click middle only aims the cut.)
  const cut = mids.filter((p) => p !== aim);
  const one = tidy([...walk(h1, h2), ...[...cut].reverse()]);
  const two = tidy([...walk(h2, h1), ...cut]);
  if (one.length < 3 || two.length < 3) return null;
  const a1 = Math.abs(shoelace(one)), a2 = Math.abs(shoelace(two));
  if (a1 < total * 1e-6 || a2 < total * 1e-6) return null;
  // The two parts have to make up the area exactly (a cut that wanders outside it doesn't).
  if (Math.abs(a1 + a2 - total) > total * 1e-6) return null;
  return [one, two];
}

function inside(pts: Pt[], [x, y]: Pt) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) c = !c;
  }
  return c;
}
