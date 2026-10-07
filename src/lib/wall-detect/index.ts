/**
 * Wall finder: click one wall on a plan and find the walls connected to it.
 *
 * Works on the line work of a CAD-made PDF (the same lines Snap uses), in page
 * units. A wall on a plan is two parallel lines its thickness apart. From the line
 * you click it finds that partner (the wall's thickness), then every other pair of
 * parallel lines the same thickness apart. Then:
 *  - a band of the same thickness filled with hatching is brick veneer, not a wall;
 *  - each wall is exterior or interior: an exterior wall has a skin along one side —
 *    brick, or siding/sheathing lines running close alongside — an interior wall is
 *    the same on both sides. Only walls of the kind you clicked are kept;
 *  - door openings are bridged: across the gap between two pieces of one straight
 *    wall, including the short stubs (returns) drawn where a door meets a wall;
 *    wider openings (garage doors, big windows) when the opening is drawn in the wall.
 * It returns their center lines, each wall on its own (corner to corner) — ready to
 * save as a Walls takeoff, a measurement per wall.
 *
 * It knows nothing about the app (no database, no screens): plain numbers in, plain
 * numbers out, so it can be tested and improved on its own. Scanned plans have no
 * line work — nothing to find.
 */

export type Pt = [number, number];
export type WallKind = "exterior" | "interior";

export type WallFindOptions = {
  /** The sheet's scale: page units per real foot. */
  unitsPerFoot: number;
  /** How close (page units) a click must be to a line. */
  clickRadius: number;
  /** Thinnest and thickest wall to look for (the stud space between its faces), in inches (default 2–14). */
  minThicknessIn?: number;
  maxThicknessIn?: number;
  /** How far a wall's thickness may differ from the clicked one's, in inches (default 1/2 — a 2x4 and a 2x6 never mix). */
  toleranceIn?: number;
  /** Widest door opening to bridge between two pieces of a straight wall, in feet (default 7 — double doors). */
  maxDoorFt?: number;
  /** Widest opening drawn in the wall (garage door, window wall) to bridge, in feet (default 20). */
  maxOpeningFt?: number;
};

export type WallFindResult =
  { ok: true; thicknessIn: number; kind: WallKind; runs: Pt[][]; lengthFt: number; openings: number } | { ok: false; reason: "no-line" | "no-wall" | "no-scale" };

type Line = { x1: number; y1: number; x2: number; y2: number; ang: number; ux: number; uy: number; nx: number; ny: number; rho: number; s0: number; s1: number };
/** A straight stretch of wall center line: along direction u, at offset rho along n, from s0 to s1. */
type Piece = { bucket: number; ang: number; ux: number; uy: number; nx: number; ny: number; rho: number; s0: number; s1: number; open: number; openings?: number[] };

const DEG = Math.PI / 180;
const PARALLEL = 1.5 * DEG;

function toLine(x1: number, y1: number, x2: number, y2: number): Line | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return null;
  let ang = Math.atan2(dy, dx);
  if (ang < 0) ang += Math.PI;
  // Keep near-horizontal lines together (179.8° is 0.2° the other way).
  if (ang >= Math.PI - 0.5 * DEG) ang -= Math.PI;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  const a = x1 * ux + y1 * uy;
  const b = x2 * ux + y2 * uy;
  return { x1, y1, x2, y2, ang, ux, uy, nx, ny, rho: x1 * nx + y1 * ny, s0: Math.min(a, b), s1: Math.max(a, b) };
}

function distToSeg(px: number, py: number, l: { x1: number; y1: number; x2: number; y2: number }) {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const t = Math.max(0, Math.min(1, ((px - l.x1) * dx + (py - l.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (l.x1 + t * dx), py - (l.y1 + t * dy));
}

const bucketOf = (ang: number) => (Math.round(ang / DEG) + 180) % 180;
const near = (a: number, b: number) => Math.min(Math.abs(a - b), 180 - Math.abs(a - b)) <= 1;

/** Lines grouped by direction (1° buckets), each group sorted by offset — for fast partner lookups. */
function index(lines: Line[]) {
  const buckets = new Map<number, Line[]>();
  for (const l of lines) {
    const k = bucketOf(l.ang);
    const list = buckets.get(k);
    if (list) list.push(l);
    else buckets.set(k, [l]);
  }
  for (const list of buckets.values()) list.sort((a, b) => a.rho - b.rho);
  return buckets;
}

/** Lines parallel to direction `ang` whose offset is between lo and hi. */
function* parallelIn(buckets: Map<number, Line[]>, ang: number, lo: number, hi: number) {
  const k = bucketOf(ang);
  for (const kk of [k - 1, k, k + 1]) {
    const list = buckets.get((kk + 180) % 180);
    if (!list) continue;
    // Binary search the first line at offset ≥ lo.
    let i = 0;
    let j = list.length;
    while (i < j) {
      const m = (i + j) >> 1;
      if (list[m].rho < lo) i = m + 1;
      else j = m;
    }
    for (; i < list.length && list[i].rho <= hi; i++) if (Math.abs(list[i].ang - ang) <= PARALLEL) yield list[i];
  }
}

const overlapOf = (a: { s0: number; s1: number }, b: { s0: number; s1: number }) => Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0);

/** The wall center line a pair of parallel lines makes (where they overlap). */
function pieceOf(a: Line, b: Line): Piece {
  const s0 = Math.max(a.s0, b.s0);
  const s1 = Math.min(a.s1, b.s1);
  return { bucket: bucketOf(a.ang), ang: a.ang, ux: a.ux, uy: a.uy, nx: a.nx, ny: a.ny, rho: (a.rho + b.rho) / 2, s0, s1, open: s1 - s0 };
}

const at = (p: Piece, s: number): Pt => [p.ux * s + p.nx * p.rho, p.uy * s + p.ny * p.rho];
const segOf = (p: Piece) => {
  const [x1, y1] = at(p, p.s0);
  const [x2, y2] = at(p, p.s1);
  return { x1, y1, x2, y2 };
};
const lengthOf = (p: Piece) => p.s1 - p.s0;
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[v.length >> 1];
};

/** Short strokes by where they are (1 ft cells) — hatching, door stubs, window lines. */
function grid(lines: Line[], cell: number) {
  const cells = new Map<string, Line[]>();
  for (const l of lines) {
    const k = `${Math.floor((l.x1 + l.x2) / 2 / cell)},${Math.floor((l.y1 + l.y2) / 2 / cell)}`;
    const list = cells.get(k);
    if (list) list.push(l);
    else cells.set(k, [l]);
  }
  return (x0: number, y0: number, x1: number, y1: number) => {
    const out: Line[] = [];
    for (let i = Math.floor(Math.min(x0, x1) / cell) - 1; i <= Math.floor(Math.max(x0, x1) / cell) + 1; i++)
      for (let j = Math.floor(Math.min(y0, y1) / cell) - 1; j <= Math.floor(Math.max(y0, y1) / cell) + 1; j++) out.push(...(cells.get(`${i},${j}`) ?? []));
    return out;
  };
}

/**
 * Finds the wall at `click` and the walls connected to it (same thickness, same kind).
 * `segments` is the page's line work as [x1, y1, x2, y2, …] in page units.
 */
export function findWalls(segments: Float32Array | number[], click: Pt, opts: WallFindOptions): WallFindResult {
  const upf = opts.unitsPerFoot;
  if (!(upf > 0)) return { ok: false, reason: "no-scale" };
  const inch = upf / 12;
  const tMin = (opts.minThicknessIn ?? 2) * inch;
  const tMax = (opts.maxThicknessIn ?? 14) * inch;
  const tol = (opts.toleranceIn ?? 0.5) * inch;
  const maxDoor = (opts.maxDoorFt ?? 7) * upf;
  const maxOpening = (opts.maxOpeningFt ?? 20) * upf;

  // Specks (text curves, dots) can't be anything we need; short strokes can be door stubs.
  const lines: Line[] = [];
  for (let i = 0; i + 3 < segments.length; i += 4) {
    const l = toLine(segments[i], segments[i + 1], segments[i + 2], segments[i + 3]);
    if (l && l.s1 - l.s0 >= inch) lines.push(l);
  }
  const buckets = index(lines);
  const strokesNear = grid(lines, upf);

  // Hatching: short slanted strokes from face to face across a band — brick (or stone) veneer.
  const hatched = (p: Piece, half: number) => {
    const len = lengthOf(p);
    const a = at(p, p.s0);
    const b = at(p, p.s1);
    let n = 0;
    for (const l of strokesNear(a[0], a[1], b[0], b[1])) {
      // Hatching runs on a slant; square-across strokes are wall ends, jambs, joints.
      const slant = Math.abs(Math.sin(l.ang - p.ang));
      if (slant < Math.sin(20 * DEG) || slant > Math.sin(75 * DEG) || l.s1 - l.s0 > 6 * half) continue;
      const o1 = l.x1 * p.nx + l.y1 * p.ny - p.rho;
      const o2 = l.x2 * p.nx + l.y2 * p.ny - p.rho;
      const onFace = (o: number) => Math.abs(Math.abs(o) - half) <= 0.75 * inch;
      const s = ((l.x1 + l.x2) / 2) * p.ux + ((l.y1 + l.y2) / 2) * p.uy;
      if (onFace(o1) && onFace(o2) && Math.sign(o1) !== Math.sign(o2) && s >= p.s0 && s <= p.s1) n++;
    }
    // Brick hatching is a stroke every few inches; a dimension tick or two across a wall is not.
    return n >= 4 && n >= len / upf;
  };

  // 1. The line clicked, and the wall's thickness there. Look straight across the wall where you
  // clicked: its lines come in bunches (each face's layers — drywall, sheathing, siding), and
  // the wall is the open gap between two bunches, the stud space. Whichever of its lines you
  // click — the siding, the drywall, the brick — it's the same gap. A hatched gap is brick.
  let clicked: Line | null = null;
  let best = opts.clickRadius;
  for (const l of lines) {
    if (l.s1 - l.s0 < 6 * inch) continue;
    const d = distToSeg(click[0], click[1], l);
    if (d <= best) {
      best = d;
      clicked = l;
    }
  }
  if (!clicked) return { ok: false, reason: "no-line" };
  const cs = click[0] * clicked.ux + click[1] * clicked.uy;
  const across: number[] = [];
  for (const l of parallelIn(buckets, clicked.ang, clicked.rho - 2 * tMax, clicked.rho + 2 * tMax))
    if (l.s1 - l.s0 >= 6 * inch && l.s0 <= cs + inch && l.s1 >= cs - inch) across.push(l.rho - clicked.rho);
  across.sort((a, b) => a - b);
  const bunches: [number, number][] = [];
  for (const o of across) {
    const c = bunches[bunches.length - 1];
    if (c && o - c[1] <= 1.1 * inch) c[1] = o;
    else bunches.push([o, o]);
  }
  // Walk out from the bunch you clicked, each way, to the first gap a wall's thickness wide.
  // Brick on the way means you clicked the veneer: the wall is the one behind it.
  const mineAt = bunches.findIndex((c) => c[0] <= 0 && c[1] >= 0);
  const probe = (lo: number, hi: number): Piece => ({
    bucket: bucketOf(clicked.ang),
    ang: clicked.ang,
    ux: clicked.ux,
    uy: clicked.uy,
    nx: clicked.nx,
    ny: clicked.ny,
    rho: clicked.rho + (lo + hi) / 2,
    s0: Math.max(clicked.s0, cs - 2 * upf),
    s1: Math.min(clicked.s1, cs + 2 * upf),
    open: 0,
  });
  const sides = [-1, 1].map((dir) => {
    let brick = false;
    for (let k = mineAt; k + dir >= 0 && k + dir < bunches.length; k += dir) {
      const [lo, hi] = dir > 0 ? [bunches[k][1], bunches[k + 1][0]] : [bunches[k - 1][1], bunches[k][0]];
      const from = dir > 0 ? lo : -hi;
      if (from > tMax) break;
      const t = hi - lo;
      if (t < tMin || t > tMax) continue;
      if (hatched(probe(lo, hi), t / 2)) {
        brick = true;
        continue;
      }
      return { t, from, brick };
    }
    return null;
  });
  // Gaps both ways: the wall is the narrower (the other is a closet, a chase, a room's edge).
  const pick = sides.find((sd) => sd?.brick) ?? sides.filter((sd) => sd).sort((a, b) => a!.t - b!.t)[0];
  const thickness = pick ? pick.t : Infinity;
  if (!(thickness < Infinity)) return { ok: false, reason: "no-wall" };
  const half = thickness / 2;
  const join = thickness + 3 * inch;

  // 2. Every pair of parallel lines that thickness apart with nothing between them (a stud
  // space is open — siding to drywall across a thinner wall isn't one): the walls like this
  // one (and veneer).
  const pieces: Piece[] = [];
  for (const a of lines) {
    for (const b of parallelIn(buckets, a.ang, a.rho + thickness - tol, a.rho + thickness + tol)) {
      if (b === a || overlapOf(a, b) < inch) continue;
      const p = pieceOf(a, b);
      // How much of it is open between the two lines. (Where something's drawn between —
      // a door or window in the opening — it can still be wall, if it's open elsewhere.)
      const between: [number, number][] = [];
      for (const c of parallelIn(buckets, a.ang, a.rho + 0.4 * inch, b.rho - 0.4 * inch)) if (c.s1 - c.s0 >= 6 * inch && overlapOf(c, p) > 0) between.push([c.s0, c.s1]);
      between.sort((x, y) => x[0] - y[0]);
      let end = p.s0;
      for (const [c0, c1] of between) {
        const lo = Math.max(c0, end);
        const hi = Math.min(c1, p.s1);
        if (hi > lo) p.open -= hi - lo;
        end = Math.max(end, hi);
      }
      pieces.push(p);
    }
  }

  // 3. Pieces of the same straight wall join up where they overlap or touch. Plans often draw
  // a wall with several lines (siding, sheathing, studs, drywall), so one wall gives a few
  // center lines a fraction of an inch apart — and two real walls can't be closer than a
  // wall's thickness: center lines nearer than that are the same wall.
  const sameWall = Math.max(tol, thickness * 0.6);
  const absorb = (w: Piece, p: Piece) => {
    // Joined across an opening (not just touching): a door or window there (where, along it).
    const gap = gapOf(w, p);
    w.openings = [...(w.openings ?? []), ...(p.openings ?? []), ...(gap > inch ? [(Math.min(w.s1, p.s1) + Math.max(w.s0, p.s0)) / 2] : [])];
    w.open = Math.min(w.open + p.open, Math.max(w.s1, p.s1) - Math.min(w.s0, p.s0));
    const lw = lengthOf(w);
    const lp = lengthOf(p);
    w.rho = (w.rho * lw + p.rho * lp) / (lw + lp || 1);
    w.s0 = Math.min(w.s0, p.s0);
    w.s1 = Math.max(w.s1, p.s1);
  };
  const inLine = (w: Piece, p: Piece) => near(w.bucket, p.bucket) && Math.abs(w.rho - p.rho) <= sameWall;
  const gapOf = (w: Piece, p: Piece) => Math.max(p.s0 - w.s1, w.s0 - p.s1);
  const merge = (list: Piece[], ok: (w: Piece, p: Piece) => boolean) => {
    list.sort((p, q) => p.bucket - q.bucket || p.rho - q.rho || p.s0 - q.s0);
    const out: Piece[] = [];
    for (const p of list) {
      const same = out.find((w) => inLine(w, p) && ok(w, p));
      if (same) absorb(same, p);
      else out.push({ ...p });
    }
    // Joining can make two that now touch: once more until nothing changes.
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < out.length && !changed; i++)
        for (let j = i + 1; j < out.length && !changed; j++)
          if (inLine(out[i], out[j]) && ok(out[i], out[j])) {
            absorb(out[i], out[j]);
            out.splice(j, 1);
            changed = true;
          }
    }
    return out;
  };
  // How much of [from, to] along direction `ang` is drawn by lines at offsets lo..hi (at least minLen long).
  const drawn = (ang: number, lo: number, hi: number, from: number, to: number, minLen = 0) => {
    const spans: [number, number][] = [];
    for (const l of parallelIn(buckets, ang, lo, hi)) {
      if (l.s1 - l.s0 < minLen) continue;
      const a = Math.max(l.s0, from);
      const b = Math.min(l.s1, to);
      if (b > a) spans.push([a, b]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let end = from;
    for (const [a, b] of spans) {
      if (b <= end) continue;
      covered += b - Math.max(a, end);
      end = b;
    }
    return covered / (to - from || 1);
  };
  // A wall's faces are solid lines. A dashed one (upper cabinets, a beam or soffit overhead)
  // isn't a wall face: short dashes, a couple every foot, and little drawn solid.
  const dashed = (p: Piece) =>
    [-1, 1].some((side) => {
      const rho = p.rho + side * half;
      let dashes = 0;
      for (const l of parallelIn(buckets, p.ang, rho - tol, rho + tol)) if (l.s1 - l.s0 < 6 * inch && overlapOf(l, p) > 0) dashes++;
      return dashes >= 4 && dashes >= (2 * lengthOf(p)) / upf && drawn(p.ang, rho - tol, rho + tol, p.s0, p.s1, 6 * inch) < 0.5;
    });
  const merged = merge(pieces, (w, p) => gapOf(w, p) <= inch);
  const veneer: Piece[] = [];
  let walls: Piece[] = [];
  for (const p of merged) {
    // Lines run between its faces all along: it's not a wall this thick (two faces of a
    // thinner wall's layers).
    if (p.open < Math.min(upf, lengthOf(p) / 2)) continue;
    if (lengthOf(p) >= upf && hatched(p, half)) veneer.push(p);
    else if (!dashed(p)) walls.push(p);
  }

  // 4. Door openings. A door is drawn as a gap in a wall, often with a short stub (return) on
  // either side. Stubs count only when they come off another wall; then pieces of one straight
  // wall join across a door-wide gap — or a wider one when the opening is drawn in the wall
  // (a garage door's or window's lines running between the two ends).
  // A wall's end at a door is drawn closed: a line straight across from face to face (the
  // jamb). Dashed lines (upper cabinets, things overhead) and counter edges aren't.
  const capped = (p: Piece, s: number) => {
    const [x, y] = at(p, s);
    return strokesNear(x, y, x, y).some((l) => {
      if (Math.abs(Math.sin(l.ang - p.ang)) < Math.sin(75 * DEG)) return false;
      const along = ((l.x1 + l.x2) / 2) * p.ux + ((l.y1 + l.y2) / 2) * p.uy;
      if (Math.abs(along - s) > 1.5 * inch) return false;
      const o1 = l.x1 * p.nx + l.y1 * p.ny - p.rho;
      const o2 = l.x2 * p.nx + l.y2 * p.ny - p.rho;
      return Math.min(o1, o2) <= -half + 0.75 * inch && Math.max(o1, o2) >= half - 0.75 * inch;
    });
  };
  const long = walls.filter((w) => lengthOf(w) >= upf);
  const offWall = (p: Piece, s: number) => {
    const [x, y] = at(p, s);
    return long.some((w) => w !== p && Math.abs(Math.sin(w.ang - p.ang)) > Math.sin(45 * DEG) && distToSeg(x, y, segOf(w)) <= half + 2 * inch);
  };
  // A stub comes off a wall at one end and is closed at the other.
  walls = walls.filter((p) => lengthOf(p) >= upf || (offWall(p, p.s0) && capped(p, p.s1)) || (offWall(p, p.s1) && capped(p, p.s0)));
  const drawnAcross = (w: Piece, p: Piece) => {
    const rho = (w.rho + p.rho) / 2;
    return drawn(w.ang, rho - half - inch, rho + half + inch, Math.min(w.s1, p.s1), Math.max(w.s0, p.s0)) >= 0.8;
  };
  walls = merge(walls, (w, p) => {
    const gap = gapOf(w, p);
    if (gap <= inch) return true;
    if (gap <= maxOpening && drawnAcross(w, p)) return true;
    // A door: the wall closed at the opening (on at least one side), and both sides free ends —
    // a wall that runs into another wall there is a hallway's side, not a door's.
    const [a, b] = w.s1 <= p.s0 ? [w, p] : [p, w];
    return gap <= maxDoor && (capped(a, a.s1) || capped(b, b.s0)) && !offWall(a, a.s1) && !offWall(b, b.s0);
  });

  // Bits still under a foot are cabinet edges, fixtures and the like — not walls you'd frame.
  walls = walls.filter((w) => lengthOf(w) >= upf);
  // Something drawn tight against a wall (a tub, a counter) pairs up with the wall's own face
  // line or one of its layers. Two walls can't share a face: the shorter one tight alongside a
  // longer wall goes.
  walls = walls.filter(
    (w) =>
      !walls.some(
        (v) => v !== w && lengthOf(v) > lengthOf(w) && near(v.bucket, w.bucket) && Math.abs(v.rho - w.rho) <= 1.6 * thickness + tol && overlapOf(v, w) >= lengthOf(w) / 2,
      ),
  );

  // 5. Exterior or interior: look across the wall every foot. Lines bunched at each face
  // (gaps under ~1") are that face's layers; an interior wall's two faces match, an exterior
  // wall carries more on its outside (siding, sheathing). Brick veneer alongside settles it.
  // One straight line can be exterior for a stretch and interior past a corner, so a wall
  // is split where it changes.
  type Look = { kind: WallKind; layers: number };
  const lookAcross = (w: Piece, s: number): Look | null => {
    const offs: number[] = [];
    for (const l of parallelIn(buckets, w.ang, w.rho - half - 8 * inch, w.rho + half + 8 * inch)) if (l.s0 <= s && l.s1 >= s) offs.push(l.rho - w.rho);
    offs.sort((a, b) => a - b);
    const clusters: [number, number][] = [];
    for (const o of offs) {
      const c = clusters[clusters.length - 1];
      if (c && o - c[1] <= 1.1 * inch) c[1] = o;
      else clusters.push([o, o]);
    }
    const left = clusters.filter((c) => c[1] < 0).pop();
    const right = clusters.find((c) => c[0] > 0);
    // No wall here (a door, a window, a corner): no say.
    if (!left || !right || right[0] - left[1] < thickness - tol) return null;
    const count = ([lo, hi]: [number, number]) => offs.filter((o) => o >= lo && o <= hi).length;
    const layers = Math.min(count(left), count(right));
    if (veneer.some((v) => near(v.bucket, w.bucket) && Math.abs(v.rho - w.rho) <= half + 8 * inch + thickness && v.s0 <= s && v.s1 >= s)) return { kind: "exterior", layers };
    return { kind: Math.abs(left[1] - left[0] - (right[1] - right[0])) >= 0.75 * inch ? "exterior" : "interior", layers };
  };
  const sections: Piece[] = [];
  const kinds: WallKind[] = [];
  const layers: number[] = [];
  for (const w of walls) {
    const n = Math.max(1, Math.min(400, Math.round(lengthOf(w) / upf)));
    const step = lengthOf(w) / n;
    const looks = Array.from({ length: n }, (_, k) => lookAcross(w, w.s0 + step * (k + 0.5)));
    const seen = looks.flatMap((l) => (l ? [l.layers] : []));
    // All opening (two door stubs and the doors between): nothing to look across, but a wall.
    const drawnWith = seen.length ? median(seen) : w.openings?.length ? Infinity : 0;
    let says = looks.map((l) => l?.kind ?? null);
    // Smooth: each foot goes with most of the 5 around it.
    says = says.map((_, k) => {
      let ext = 0;
      let int = 0;
      for (let m = Math.max(0, k - 2); m <= Math.min(n - 1, k + 2); m++) {
        if (says[m] === "exterior") ext++;
        else if (says[m] === "interior") int++;
      }
      return ext > int ? "exterior" : int > ext ? "interior" : says[k];
    });
    // Feet with no say go with the nearest that has one.
    const said = says.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
    const kindAt = (k: number): WallKind => {
      if (!said.length) return "interior";
      let bestI = said[0];
      for (const i of said) if (Math.abs(i - k) < Math.abs(bestI - k)) bestI = i;
      return says[bestI]!;
    };
    // Stretches of one kind; a stretch under 2 ft goes with the one before it.
    const runs: { from: number; to: number; kind: WallKind }[] = [];
    for (let k = 0; k < n; k++) {
      const kd = kindAt(k);
      const last = runs[runs.length - 1];
      if (last && last.kind === kd) last.to = k + 1;
      else runs.push({ from: k, to: k + 1, kind: kd });
    }
    for (let r = runs.length - 1; r > 0; r--)
      if (runs[r].to - runs[r].from < 2 && runs.length > 1) {
        runs[r - 1].to = runs[r].to;
        runs.splice(r, 1);
      }
    // A stretch between two of the other kind is a window or an opening in that wall.
    for (let r = 1; r < runs.length - 1; r++) if (runs[r - 1].kind === runs[r + 1].kind && runs[r].to - runs[r].from <= 10) runs[r].kind = runs[r - 1].kind;
    for (let r = runs.length - 1; r > 0; r--)
      if (runs[r].kind === runs[r - 1].kind) {
        runs[r - 1].to = runs[r].to;
        runs.splice(r, 1);
      }
    // Split where the kind changes — at the wall that crosses there, if there's one close by.
    let from = w.s0;
    runs.forEach((r, k) => {
      let to = k === runs.length - 1 ? w.s1 : w.s0 + step * r.to;
      if (k < runs.length - 1) {
        let snap = Infinity;
        for (const v of walls) {
          if (v === w) continue;
          const cross = w.ux * v.uy - w.uy * v.ux;
          if (Math.abs(cross) < Math.sin(45 * DEG)) continue;
          const pa = at(w, w.s0);
          const t = (v.rho - (pa[0] * v.nx + pa[1] * v.ny)) / (w.ux * v.nx + w.uy * v.ny);
          const x = at(w, w.s0 + t);
          if (distToSeg(x[0], x[1], segOf(v)) > join) continue;
          const sx = w.s0 + t;
          if (Math.abs(sx - to) <= 2 * upf && Math.abs(sx - to) < Math.abs(snap - to)) snap = sx;
        }
        if (snap < Infinity) to = snap;
      }
      if (to - from > 0) {
        sections.push({ ...w, s0: from, s1: to });
        kinds.push(r.kind);
        layers.push(drawnWith);
      }
      from = to;
    });
  }
  walls = sections;

  // 6. Follow the walls that meet at corners and T's, starting from the clicked one; keep the
  // ones the same kind as it.
  const segs = walls.map(segOf);
  const touches = (i: number, j: number) => {
    const a = segs[i];
    const b = segs[j];
    return distToSeg(a.x1, a.y1, b) <= join || distToSeg(a.x2, a.y2, b) <= join || distToSeg(b.x1, b.y1, a) <= join || distToSeg(b.x2, b.y2, a) <= join;
  };
  let start = -1;
  let startD = Infinity;
  segs.forEach((s, i) => {
    const d = distToSeg(click[0], click[1], s);
    if (d < startD) {
      startD = d;
      start = i;
    }
  });
  if (start < 0) return { ok: false, reason: "no-wall" };
  // The outside walls go around the house one to the next; inside walls can hang off them.
  // Walls are drawn alike: a counter or cabinet edge has fewer lines at a face than the wall
  // you clicked (its drywall, sheathing…).
  const kind = kinds[start];
  const enough = Math.min(2, layers[start]);
  for (let i = 0; i < walls.length; i++) if (i !== start && layers[i] < enough) kinds[i] = kind === "exterior" ? "interior" : "exterior";
  const found = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.pop()!;
    for (let j = 0; j < walls.length; j++) {
      if (found.has(j) || (kind === "exterior" && kinds[j] !== kind) || !touches(i, j)) continue;
      found.add(j);
      queue.push(j);
    }
  }
  const mine = Array.from(found)
    .filter((i) => kinds[i] === kind)
    .map((i) => walls[i]);
  const others = Array.from(found)
    .filter((i) => kinds[i] !== kind)
    .map((i) => walls[i]);

  // 7. Center lines stop short of corners (half a wall); reach them to where the walls meet —
  // another wall of this kind at its center line, a wall of the other kind at its face.
  for (const a of mine)
    for (const b of [...mine, ...others]) {
      if (a === b) continue;
      const cross = a.ux * b.uy - a.uy * b.ux;
      if (Math.abs(cross) < Math.sin(10 * DEG)) continue; // (near) parallel: no corner
      // Which side of b is a on? Its face on that side.
      const mid = at(a, (a.s0 + a.s1) / 2);
      const side = Math.sign(mid[0] * b.nx + mid[1] * b.ny - b.rho) || 1;
      const rho = mine.includes(b) ? b.rho : b.rho + side * half;
      // Where a's center line crosses that line of b.
      const pa = at(a, a.s0);
      const t = (rho - (pa[0] * b.nx + pa[1] * b.ny)) / (a.ux * b.nx + a.uy * b.ny);
      const x: Pt = [pa[0] + a.ux * t, pa[1] + a.uy * t];
      // Only a real meeting: the crossing is near the end of a and on (or near) b.
      if (distToSeg(x[0], x[1], segOf(b)) > join) continue;
      const sx = x[0] * a.ux + x[1] * a.uy;
      if (Math.abs(sx - a.s0) <= join * 1.5) a.s0 = sx;
      else if (Math.abs(sx - a.s1) <= join * 1.5) a.s1 = sx;
    }

  // 8. Each wall on its own, corner to corner — so each can be changed by itself later.
  const runs = mine.map((w) => [at(w, w.s0), at(w, w.s1)]).filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0);
  const lengthFt = runs.reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0) / upf;
  const openings = mine.reduce((n, w) => n + (w.openings ?? []).filter((s) => s >= w.s0 && s <= w.s1).length, 0);
  return { ok: true, thicknessIn: Math.round((thickness / inch) * 8) / 8, kind, runs, lengthFt, openings };
}
