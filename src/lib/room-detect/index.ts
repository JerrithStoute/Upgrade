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
import { DEG, distToSeg, grid, indexLines, parallelIn, toLine, type Line, type Pt } from "../wall-detect";

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
};

export type RoomFindResult = { ok: true; outline: Pt[]; areaSf: number } | { ok: false; reason: "no-scale" | "in-wall" | "open" | "too-small" };

/** A wall (or a closed opening): its center line along u at offset rho on n, from s0 to s1, and half its thickness. */
type Band = { ang: number; ux: number; uy: number; nx: number; ny: number; rho: number; half: number; s0: number; s1: number };

const bandOf = (l: Line, rho: number, half: number, s0: number, s1: number): Band => ({ ang: l.ang, ux: l.ux, uy: l.uy, nx: l.nx, ny: l.ny, rho, half, s0, s1 });

export function findRoom(segments: Float32Array | number[], click: Pt, opts: RoomFindOptions): RoomFindResult {
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
  const lines: Line[] = [];
  for (let i = 0; i + 3 < segments.length; i += 4) {
    const [x1, y1, x2, y2] = [segments[i], segments[i + 1], segments[i + 2], segments[i + 3]];
    if (Math.max(x1, x2) < box.x0 || Math.min(x1, x2) > box.x1 || Math.max(y1, y2) < box.y0 || Math.min(y1, y2) > box.y1) continue;
    const l = toLine(x1, y1, x2, y2);
    if (l && l.s1 - l.s0 >= inch) lines.push(l);
  }
  const buckets = indexLines(lines);
  const strokesNear = grid(lines, upf);

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
  const dimension = new Set<Line>();
  for (const l of lines) if (l.s1 - l.s0 >= 6 * inch && ticked(l)) dimension.add(l);
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
      for (const m of parallelIn(buckets, l.ang, l.rho - tMax, l.rho + tMax)) {
        if (m === l || m.s1 - m.s0 < 2 * upf || isDimension(m)) continue;
        const covers = m.s0 <= l.s0 + inch && m.s1 >= l.s1 - inch;
        const before = m.s1 <= l.s0 + inch && l.s0 - m.s1 <= 8 * upf;
        const after = m.s0 >= l.s1 - inch && m.s0 - l.s1 <= 8 * upf;
        if (covers || before || after) return true;
      }
      return false;
    };
    if (len <= 4 * upf && !inWallLine())
      for (const m of parallelIn(buckets, l.ang, l.rho - 16 * inch, l.rho + 16 * inch)) {
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

  // 1. Walls: parallel lines a wall's thickness apart, open between (nothing drawn along the stud space).
  const bands: Band[] = [];
  for (const a of lines) {
    if (a.s1 - a.s0 < 6 * inch || isDimension(a) || boxSide(a)) continue;
    for (const b of parallelIn(buckets, a.ang, a.rho + tMin, a.rho + tMax)) {
      if (isDimension(b) || boxSide(b)) continue;
      const s0 = Math.max(a.s0, b.s0);
      const s1 = Math.min(a.s1, b.s1);
      if (s1 - s0 < 6 * inch) continue;
      // Where something's drawn between the faces (a pocket door's slot, a window), it isn't open stud
      // space: the wall is the stretches that are — the rest an opening, closed like any other.
      const spans: [number, number][] = [];
      for (const c of parallelIn(buckets, a.ang, a.rho + 0.3 * inch, b.rho - 0.3 * inch))
        if (c.s1 - c.s0 >= 6 * inch && c.s1 > s0 && c.s0 < s1) spans.push([Math.max(c.s0, s0), Math.min(c.s1, s1)]);
      spans.sort((p, q) => p[0] - q[0]);
      let from = s0;
      const open: [number, number][] = [];
      for (const [p, q] of spans) {
        if (p > from) open.push([from, p]);
        from = Math.max(from, q);
      }
      if (s1 > from) open.push([from, s1]);
      for (const [o0, o1] of open) if (o1 - o0 >= 6 * inch) bands.push(bandOf(a, (a.rho + b.rho) / 2, (b.rho - a.rho) / 2, o0, o1));
    }
  }

  // 1b. A plan that fills its walls (hatching between the faces — the heavy ink on the page): the walls
  // are the filled bands, and nothing else is — dimensions, labels' boxes, furniture, ridge and beam
  // lines are all thin, so they don't count at all. Pieces of a filled wall that line up across an
  // opening (up to 24' — a garage door) are closed straight across it: a cased opening, a kitchen open
  // to the living room, a garage door.
  const filled = (w: Band) => {
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
  const filledBands = filledAll.filter((w) => w.s1 - w.s0 >= 2 * upf || tiedToFilled(w));
  const lengthOf = (xs: Band[]) => xs.filter((w) => w.s1 - w.s0 >= upf).reduce((n, w) => n + (w.s1 - w.s0), 0);
  const filledLength = lengthOf(filledBands);
  const heavy = filledLength >= 20 * upf && filledLength >= 0.25 * lengthOf(bands);
  if (heavy) bands.splice(0, bands.length, ...filledBands);

  // How much of [from, to] along a band's line is drawn by lines within its faces.
  const drawnAlong = (w: Band, from: number, to: number) => {
    const spans: [number, number][] = [];
    for (const l of parallelIn(buckets, w.ang, w.rho - w.half - inch, w.rho + w.half + inch)) {
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

  // 2a. Doors and openings in a straight wall: the gap between two pieces of it, closed. An empty gap
  // (a door) only between pieces of a real wall — each long, or tied into another wall at an end;
  // label boxes and furniture standing in a room aren't strung together.
  const bridges: Band[] = [];
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
  const crossedBetween = (w: Band, from: number, to: number) => {
    const mid = (from + to) / 2;
    const [mx, my] = [w.ux * mid + w.nx * w.rho, w.uy * mid + w.ny * w.rho];
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
      return sv > v.s0 + w.half + 3 * upf && sv < v.s1 - w.half - 3 * upf;
    });
  };
  const anchored = (w: Band) => w.s1 - w.s0 >= 3 * upf || tiedAt(w, w.s0) || tiedAt(w, w.s1);
  const byLine = [...bands].sort((p, q) => Math.round(p.ang / DEG) - Math.round(q.ang / DEG) || p.rho - q.rho || p.s0 - q.s0);
  for (let i = 0; i < byLine.length; i++) {
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
    const bridge = (to: Band) => bridges.push({ ...w, rho: (w.rho + to.rho) / 2, half: Math.min(w.half, to.half), s0: w.s1 - inch, s1: to.s0 + inch });
    if (heavy) {
      // (Not through another wall: pieces in line on either side of a wall that crosses between them
      // are two rooms' walls, not one wall with an opening.)
      if (next && next.s0 - w.s1 <= 24 * upf && !crossedBetween(w, w.s1, next.s0)) bridge(next);
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
  const meets = (w: Band, end: number) => {
    const ex = w.ux * end + w.nx * w.rho;
    const ey = w.uy * end + w.ny * w.rho;
    return nearBy(ex, ey, w.half + 2 * inch).some((v) => v !== w && Math.abs(Math.sin(v.ang - w.ang)) > Math.sin(30 * DEG) && distToBand(ex, ey, v) <= w.half + inch);
  };
  const runsOn = (w: Band, end: number) => {
    const ex = w.ux * end + w.nx * w.rho;
    const ey = w.uy * end + w.ny * w.rho;
    return nearBy(ex, ey, 2 * inch).some(
      (v) => v !== w && Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(3 * DEG) && Math.abs(v.rho - w.rho) <= Math.max(v.half, w.half) && v.s0 <= end + inch && v.s1 >= end - inch && (v.s0 < w.s0 - inch || v.s1 > w.s1 + inch),
    );
  };
  // More of the same wall in line past this end (within a door's width), the way `dir` points.
  const inLineBeyond = (w: Band, end: number, dir: number) =>
    bands.some(
      (v) =>
        v !== w &&
        Math.abs(Math.sin(v.ang - w.ang)) < Math.sin(3 * DEG) &&
        Math.abs(v.rho - w.rho) <= Math.max(v.half, w.half) &&
        (dir > 0 ? v.s0 > end && v.s0 - end <= maxDoor : v.s1 < end && end - v.s1 <= maxDoor),
    );
  for (const w of bands) {
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
      // standing in the room isn't stretched to the walls.
      const other = dir > 0 ? w.s0 : w.s1;
      // (On a plan that fills its walls, every filled piece is a wall.)
      if (meets(w, end) || (!heavy && !(meets(w, other) || runsOn(w, other) || inLineBeyond(w, other, -dir)))) continue;
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
      if (hit < Infinity) bridges.push({ ...w, s0: dir > 0 ? end - inch : end - hit - inch, s1: dir > 0 ? end + hit + inch : end + inch });
    }
  }
  const walls = [...bands, ...bridges];

  // 3. The floor, filled out from the click on a grid (walls blocked off, a cell past their faces so
  // corners and diagonals can't leak).
  const cell = 1.5 * inch;
  const W = Math.ceil((box.x1 - box.x0) / cell);
  const H = Math.ceil((box.y1 - box.y0) / cell);
  const blocked = new Uint8Array(W * H);
  for (const w of walls) {
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
        if (x >= lo && x <= hi) blocked[j * W + i] = 1;
      }
    }
  }
  const ci = Math.floor((cx - box.x0) / cell);
  const cj = Math.floor((cy - box.y0) / cell);
  if (blocked[cj * W + ci]) return { ok: false, reason: "in-wall" };
  // 1 = floor (reached from the click).
  const floor = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let top = 0;
  stack[top++] = cj * W + ci;
  floor[cj * W + ci] = 1;
  while (top) {
    const k = stack[--top];
    const i = k % W;
    const j = (k - i) / W;
    // Reached the edge of the search: it isn't closed in (outside, or open to outside).
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1) return { ok: false, reason: "open" };
    for (const n of [k - 1, k + 1, k - W, k + W])
      if (!floor[n] && !blocked[n]) {
        floor[n] = 1;
        stack[top++] = n;
      }
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
  let pts = simplify(loop.map(corner), 1.5 * cell);
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
    return best ? { nx: best.nx, ny: best.ny, rho: best.rho } : { nx: l.nx, ny: l.ny, rho: l.rho };
  });
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
  pts = dropNicks(pts, 10 * inch, 4 * upf, 1.5 * inch);
  const areaSf = Math.abs(shoelace(pts)) / (upf * upf);
  if (areaSf < 2) return { ok: false, reason: "too-small" };
  return { ok: true, outline: pts, areaSf };
}

/** Bands by where they are (cells of `size`): the ones within r of a point. */
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
function dropNicks(pts: Pt[], depth: number, width: number, tol: number): Pt[] {
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
      // extension line or a symbol's leader.)
      const deep = Math.max(len(a, b), len(c, d));
      if (!((deep <= depth && len(b, c) <= width) || (len(b, c) <= depth * 0.6 && deep <= width))) continue;
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

function inside(pts: Pt[], [x, y]: Pt) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) c = !c;
  }
  return c;
}
