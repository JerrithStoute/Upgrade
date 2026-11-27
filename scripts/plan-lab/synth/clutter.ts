/**
 * Step 2: everything else a real floor plan has — the things that make reading walls hard. Kitchens, bath fixtures,
 * laundry, closet shelves and rods, fireplaces; lights, fans, switches and their dashed wires; outlets; dimension strings
 * (sometimes with extension lines running clear through the house); door and window tags; hatched or filled walls;
 * speckled porch slabs. None of it is in the answer key — it's what the AI has to learn to look past.
 * Shapes are in the house's inches (like layout.ts); line weights and text sizes in paper points.
 */
import pc from "polygon-clipping";
import type { Rng } from "./rng";
import { OUT, type Layout, type Pt, type Rect, type Room, type Run } from "./layout";
import type { Arc, Geom } from "./geom";

export type Prim =
  | { k: "line"; pts: Pt[]; w: number; dash?: number[]; close?: boolean }
  | { k: "curve"; arcs: Arc[]; w: number; dash?: number[] }
  | { k: "text"; text: string; at: Pt; size: number; axis?: "x" | "y" }
  | { k: "fill"; rings: Pt[][]; gray: number };

export type Clutter = {
  walls: "plain" | "hatchExt" | "hatchAll" | "fillExt" | "fillAll";
  hatchSp: number;
  fixtures: boolean;
  electric: boolean;
  outlets: boolean;
  dims: "none" | "ext" | "extInt";
  /** Share of rooms with their own size dimensioned inside, the line 3"–4" off a wall face (reads like a wall's other face). */
  roomDims: number;
  /** How much "looks like a wall, isn't one" goes on: beams, soffits, half walls, ledges, built-ins, hearths. */
  lookalike: number;
  longExt: boolean;
  /** Dimension ends: slash ticks, dots, filled arrowheads, open arrowheads, open circles (round 5: real plans use all). */
  ticks: "slash" | "dot" | "arrow" | "open" | "circle";
  /** Round 5 (2026-11-24): styles from other drafters and software (web research) — none in the answer key. */
  extra: { layers: boolean; ceil: number; floor: boolean; furn: boolean; tags: boolean; marks: boolean; roomFill: boolean };
  doorTags: boolean;
  winTags: boolean;
  stipple: boolean;
};

export function makeClutter(r: Rng): Clutter {
  return {
    walls: r.pick(["plain", "plain", "hatchExt", "hatchExt", "hatchAll", "fillExt", "fillAll"]),
    hatchSp: r.pick([1.5, 2, 3, 4]),
    fixtures: r.chance(0.85),
    electric: true, // (every plan: switches and can lights are what make a plan reader step off a wall)
    outlets: r.chance(0.6),
    dims: r.pick(["none", "ext", "ext", "extInt"]),
    roomDims: r.pick([0, 0, 0.35, 0.7, 1]),
    lookalike: r.pick([0.4, 0.7, 1, 1]),
    longExt: r.chance(0.3),
    ticks: r.pick(["slash", "slash", "slash", "dot", "arrow", "arrow", "open", "circle"] as const),
    doorTags: r.chance(0.5),
    winTags: r.chance(0.5),
    stipple: r.chance(0.6),
    extra: { layers: r.chance(0.3), ceil: r.pick([0, 0, 0.3, 0.6]), floor: r.chance(0.25), furn: r.chance(0.35), tags: r.chance(0.3), marks: r.chance(0.35), roomFill: r.chance(0.12) },
  };
}

const K = 0.5523;
type Side = "N" | "S" | "E" | "W";
const SIDES: Side[] = ["N", "S", "E", "W"];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const hits = (a: Rect, b: Rect) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
const within = (a: Rect, b: Rect) => a.x0 >= b.x0 - 0.01 && a.x1 <= b.x1 + 0.01 && a.y0 >= b.y0 - 0.01 && a.y1 <= b.y1 + 0.01;
const ext = (a: Pt, b: Pt): Rect => ({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) });

/** An ellipse as four Bézier quarters (how CAD draws circles): center, and its two half-axis vectors. */
function ellipse(c: Pt, ex: Pt, ey: Pt): Arc[] {
  const P = (u: number, v: number): Pt => add(c, add(mul(ex, u), mul(ey, v)));
  return [
    [P(1, 0), P(1, K), P(K, 1), P(0, 1)],
    [P(0, 1), P(-K, 1), P(-1, K), P(-1, 0)],
    [P(-1, 0), P(-1, -K), P(-K, -1), P(0, -1)],
    [P(0, -1), P(K, -1), P(1, -K), P(1, 0)],
  ];
}
const circle = (c: Pt, r: number) => ellipse(c, [r, 0], [0, r]);

/** A wall of a room's inside rectangle, as a frame: s along the wall, d out from it into the room. */
type Frame = { side: Side; len: number; f: (s: number, d: number) => Pt; box: (s0: number, d0: number, s1: number, d1: number) => Rect };
function frame(R: Rect, side: Side): Frame {
  const o: Pt = side === "S" ? [R.x0, R.y1] : side === "E" ? [R.x1, R.y0] : [R.x0, R.y0];
  const u: Pt = side === "N" || side === "S" ? [1, 0] : [0, 1];
  const n: Pt = side === "N" ? [0, 1] : side === "S" ? [0, -1] : side === "W" ? [1, 0] : [-1, 0];
  const f = (s: number, d: number) => add(o, add(mul(u, s), mul(n, d)));
  return { side, len: side === "N" || side === "S" ? R.x1 - R.x0 : R.y1 - R.y0, f, box: (s0, d0, s1, d1) => ext(f(s0, d0), f(s1, d1)) };
}

/** Straight hatching across polygons (each [outer, ...holes]), lines `sp` apart at `deg` degrees. */
export function hatch(polys: Pt[][][], sp: number, deg: number): Pt[][] {
  const a = (deg * Math.PI) / 180, d: Pt = [Math.cos(a), Math.sin(a)], n: Pt = [-Math.sin(a), Math.cos(a)];
  const out: Pt[][] = [];
  for (const poly of polys) {
    const vs = poly.flat().map((p) => p[0] * n[0] + p[1] * n[1]);
    for (let c = Math.ceil(Math.min(...vs) / sp) * sp; c < Math.max(...vs); c += sp) {
      const ss: number[] = [];
      for (const ring of poly)
        for (let i = 0; i + 1 < ring.length; i++) {
          const p = ring[i], q = ring[i + 1], pc0 = p[0] * n[0] + p[1] * n[1] - c, qc = q[0] * n[0] + q[1] * n[1] - c;
          if ((pc0 < 0) === (qc < 0)) continue;
          const t = pc0 / (pc0 - qc), x: Pt = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
          ss.push(x[0] * d[0] + x[1] * d[1]);
        }
      ss.sort((x, y) => x - y);
      for (let i = 0; i + 1 < ss.length; i += 2) if (ss[i + 1] - ss[i] > 0.3) out.push([add(mul(n, c), mul(d, ss[i])), add(mul(n, c), mul(d, ss[i + 1]))]);
    }
  }
  return out;
}

function feetIn(inches: number) {
  const n = Math.round(inches * 2) / 2, ft = Math.floor(n / 12), rest = n - ft * 12;
  return `${ft}'-${Math.floor(rest)}${rest % 1 ? " 1/2" : ""}"`;
}
/** "2⁸"-style door/window size tags, written plainly: 32" → 28, 36" → 30. */
const tag = (inches: number) => `${Math.floor(inches / 12)}${Math.round(inches % 12)}`;

export function clutter(L: Layout, g: Geom, c: Clutter, r: Rng, ptIn: number, thin: number): Prim[] {
  const out: Prim[] = [];
  const fine = thin * 0.8;
  const line = (pts: Pt[], w = thin, dash?: number[], close = false) => out.push({ k: "line", pts, w, dash, close });
  const curve = (arcs: Arc[], w = thin, dash?: number[]) => out.push({ k: "curve", arcs, w, dash });
  const text = (t: string, at: Pt, size: number, axis?: "x" | "y") => out.push({ k: "text", text: t, at, size, axis });
  const inIn = (pt: number) => pt / ptIn; // paper points → the house's inches
  const { rooms, runs, openings } = L;

  // ---- walls: hatched or filled ----
  if (c.walls !== "plain") {
    const extRects = g.runRects.filter((_, i) => runs[i].kind === "ext");
    const extOnly = c.walls === "hatchExt" || c.walls === "fillExt";
    const polys = extOnly && extRects.length ? (pc.intersection(g.walls, pc.union(extUnion(extRects), ...g.extDiag)) as Pt[][][]) : g.walls;
    if (c.walls.startsWith("fill")) out.unshift({ k: "fill", rings: polys.flat(), gray: r.pick([0.0, 0.35, 0.6, 0.75]) });
    else for (const h of hatch(polys, c.hatchSp, r.pick([45, -45]))) line(h, fine);
  }
  if (g.brickBand.length) for (const h of hatch(g.brickBand, r.pick([3, 4, 6]), 45)) line(h, fine);

  // ---- where nothing may go: in front of doors ----
  const keep: Rect[] = [], tall: Rect[] = [];
  const at = (q: Run, s: number, off: number): Pt => (q.horiz ? [q.a[0] + s, q.a[1] + off] : [q.a[0] + off, q.a[1] + s]);
  for (const o of openings) {
    const q = runs[o.run], w = o.s1 - o.s0;
    if (o.type === "window") {
      tall.push(ext(at(q, o.s0, -30), at(q, o.s1, 30)));
      continue;
    }
    const into = o.type === "garage" ? (q.sides[0] === OUT ? 1 : -1) : o.into === q.sides[1] ? 1 : -1;
    const deep = o.bifold ? w / 4 + 12 : o.type === "garage" ? 60 : w + 6;
    keep.push(ext(at(q, o.s0 - 4, 0), at(q, o.s1 + 4, into * (q.t / 2 + deep))), ext(at(q, o.s0 - 2, 0), at(q, o.s1 + 2, -into * (q.t / 2 + 32))));
  }

  // (A 45° corner wall: nothing in its corner, nothing in its door's way.)
  for (const d of L.diags) {
    const xs = d.tri.map((p) => p[0]), ys = d.tri.map((p) => p[1]);
    keep.push({ x0: Math.min(...xs) - 40, y0: Math.min(...ys) - 40, x1: Math.max(...xs) + 40, y1: Math.max(...ys) + 40 });
  }

  // ---- rooms' inside rectangles, and which of their sides are walls ----
  const onLine = (rm: Room, horiz: boolean, cc: number) => runs.filter((q) => q.horiz === horiz && (horiz ? q.a[1] : q.a[0]) === cc && q.sides.includes(rm.id));
  const sideT = (rm: Room, q: Rect, side: Side) => {
    const horiz = side === "N" || side === "S";
    const cc = side === "N" ? q.y0 : side === "S" ? q.y1 : side === "W" ? q.x0 : q.x1;
    const [lo, hi] = horiz ? [q.x0, q.x1] : [q.y0, q.y1];
    const ts = onLine(rm, horiz, cc).filter((w) => (horiz ? w.b[0] > lo && w.a[0] < hi : w.b[1] > lo && w.a[1] < hi)).map((w) => w.t);
    return ts.length ? Math.max(...ts) / 2 : 0;
  };
  const inside = (rm: Room, q: Rect): Rect => ({ x0: q.x0 + sideT(rm, q, "W"), y0: q.y0 + sideT(rm, q, "N"), x1: q.x1 - sideT(rm, q, "E"), y1: q.y1 - sideT(rm, q, "S") });
  /** Is the wall behind a frame's stretch s0..s1 a real wall the whole way (not an opening to the next part of the room)? */
  const backed = (rm: Room, q: Rect, fr: Frame, s0: number, s1: number) => {
    const horiz = fr.side === "N" || fr.side === "S";
    const cc = fr.side === "N" ? q.y0 : fr.side === "S" ? q.y1 : fr.side === "W" ? q.x0 : q.x1;
    const p0 = fr.f(s0, 0), p1 = fr.f(s1, 0);
    let [lo, hi] = horiz ? [Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0])] : [Math.min(p0[1], p1[1]), Math.max(p0[1], p1[1])];
    const spans = onLine(rm, horiz, cc).map((w) => (horiz ? [w.a[0], w.b[0]] : [w.a[1], w.b[1]])).sort((a, b) => a[0] - b[0]);
    for (const [a, b] of spans) if (a <= lo + 0.01 && b > lo) lo = b;
    return lo >= hi - 0.01;
  };
  const placed: Rect[] = [];
  type Want = { len: number; depth: number; draw: (fr: Frame, s0: number) => void; sides?: Side[]; where?: "corner" | "center" | "any"; isTall?: boolean; free?: boolean };
  /** Puts a fixture against one of the room's walls where it fits: inside the room, clear of doors and other fixtures. */
  const place = (rm: Room, q: Rect, R: Rect, w: Want) => {
    for (const side of w.sides ?? r.shuffle([...SIDES])) {
      const fr = frame(R, side);
      if (fr.len < w.len) continue;
      const tries = w.where === "center" ? [(fr.len - w.len) / 2] : w.where === "corner" ? [0, fr.len - w.len] : [0, fr.len - w.len, (fr.len - w.len) / 2];
      for (let k = 0; k < 4; k++) tries.push(Math.round((r.f() * (fr.len - w.len)) / 2) * 2);
      for (const s0 of tries) {
        const b = fr.box(s0, 0, s0 + w.len, w.depth);
        if (!within(b, R) || (!w.free && keep.some((x) => hits(x, b))) || placed.some((x) => hits(x, b)) || (w.isTall && tall.some((x) => hits(x, b)))) continue;
        if (!backed(rm, q, fr, s0, s0 + w.len)) continue;
        placed.push(b);
        // Drawn tight to the wall, or a hair off it (½"–2"): a line that close makes a 2x4 look like a 2x6 —
        // the wall AI's commonest wrong size (tubs, vanities, washers, ranges against a wall).
        const gap = r.pick([0, 0, 0.5, 1, 1, 1.5, 2, -1, -2]); // (negative: drawn over the wall's face, a range or washer drawn into it)
        w.draw(gap ? { ...fr, f: (s2, d) => fr.f(s2, d + gap), box: (a, b2, c2, d2) => fr.box(a, b2 + gap, c2, d2 + gap) } : fr, s0);
        return true;
      }
    }
    return false;
  };
  const rectF = (fr: Frame, s0: number, d0: number, s1: number, d1: number, wt = thin, dash?: number[]) => line([fr.f(s0, d0), fr.f(s1, d0), fr.f(s1, d1), fr.f(s0, d1)], wt, dash, true);
  const ellF = (fr: Frame, cs: number, cd: number, rs: number, rd: number, wt = thin) => {
    const cc = fr.f(cs, cd);
    curve(ellipse(cc, sub(fr.f(cs + rs, cd), cc), sub(fr.f(cs, cd + rd), cc)), wt);
  };
  const lbl = (t: string, p: Pt, size = 5) => text(t, p, size);
  /** A dimension line's end mark at `tip`; `u` points along the line into the measured stretch (arrows point out at the tip). */
  const endMark = (tip: Pt, u: Pt, tick: number) => {
    const n: Pt = [-u[1], u[0]];
    if (c.ticks === "slash") line([sub(tip, mul(add(u, n), tick / 2)), add(tip, mul(add(u, n), tick / 2))], thin);
    else if (c.ticks === "dot") curve(circle(tip, inIn(1.2)), fine);
    else if (c.ticks === "circle") curve(circle(tip, inIn(2)), fine);
    else {
      const al = inIn(r.pick([6, 7, 8])), aw = al * Math.tan((r.pick([12, 15, 18]) * Math.PI) / 180);
      const b = add(tip, mul(u, al)), p1 = add(b, mul(n, aw)), p2 = sub(b, mul(n, aw));
      if (c.ticks === "arrow") out.push({ k: "fill", rings: [[tip, p1, p2, tip]], gray: 0 });
      line(c.ticks === "arrow" ? [tip, p1, p2] : [p1, tip, p2], fine, undefined, c.ticks === "arrow");
    }
  };

  // Fixtures, by what each one looks like on a plan.
  const toilet = (fr: Frame, s0: number) => {
    rectF(fr, s0, 0, s0 + 20, 8);
    ellF(fr, s0 + 10, 18, 7.5, 10);
    if (r.chance(0.5)) ellF(fr, s0 + 10, 18, 5.5, 7.5, fine);
  };
  const vanity = (len: number, sinks: number) => (fr: Frame, s0: number) => {
    rectF(fr, s0, 0, s0 + len, 21);
    for (let i = 0; i < sinks; i++) ellF(fr, s0 + (len * (2 * i + 1)) / (2 * sinks), 11, 8, 6);
  };
  const tub = (len: number, dep: number) => (fr: Frame, s0: number) => {
    rectF(fr, s0, 0, s0 + len, dep);
    if (r.chance(0.5)) ellF(fr, s0 + len / 2, dep / 2, len / 2 - 5, dep / 2 - 4, fine);
    else rectF(fr, s0 + 3, 3, s0 + len - 3, dep - 3, fine);
    curve(circle(fr.f(s0 + 6, dep / 2), 1.5), fine);
    if (r.chance(0.4)) lbl("TUB", fr.f(s0 + len / 2, dep / 2), 4.5);
  };
  const shower = (len: number, dep: number) => (fr: Frame, s0: number) => {
    rectF(fr, s0, 0, s0 + len, dep);
    line([fr.f(s0, 0), fr.f(s0 + len, dep)], fine);
    line([fr.f(s0 + len, 0), fr.f(s0, dep)], fine);
    curve(circle(fr.f(s0 + len / 2, dep / 2), 2), fine);
  };
  const shelves = (dep: number, rod: boolean) => (fr: Frame, s0: number) => {
    line([fr.f(s0, dep), fr.f(fr.len, dep)]);
    if (rod) line([fr.f(s0, dep - 2), fr.f(fr.len, dep - 2)], fine, [4, 3]);
  };

  const great = rooms.find((q) => q.type === "great");
  const kz = great?.zones.find((z) => z.role === "kitchen");

  // ---- stairs (round 2026-11-21: the user's rule — stairs are not floor, cut off up to the railing, landings too;
  // the foot of the stairs is floor). Straight or L with a landing, against the living room's walls (or a big flex
  // room's): treads, a break line, an UP/DN arrow, and a railing, a pony wall, or just the edge on the open side.
  // The cut-out goes in the answer key (g.key.stairs); make.mts takes it out of the room.
  const lzS = great?.zones.find((z) => z.role === "living");
  const stairRooms: [Room, Rect][] = [];
  if (great && lzS) stairRooms.push([great, lzS.rect]);
  for (const rm of rooms) if (rm.type === "flex" && rm.rects.length === 1) stairRooms.push([rm, rm.rects[0]]);
  if (great) for (const q of great.rects.slice(1)) if (Math.min(q.x1 - q.x0, q.y1 - q.y0) >= 8 * 12) stairRooms.push([great, q]);
  const wantStairs = r.chance(0.95); // (it only fits about half the time: doors and openings in the way)
  for (const [rm, q] of wantStairs ? stairRooms : []) {
    if (g.key.stairs.length) break;
    const R = inside(rm, q);
    const W = r.pick([36, 36, 38, 40, 42, 44]), T = r.pick([10, 10, 10.5, 11]);
    const rail = r.pick(["one", "two", "two", "pony", "edge"] as const), railT = rail === "two" ? 2 : rail === "pony" ? r.pick([3.5, 4.5]) : 0;
    const L = r.chance(0.4);
    const n1 = L ? r.int(4, 8) : r.int(12, 15), n2 = L ? r.int(13, 15) - n1 - 1 : 0;
    const run1 = n1 * T, run2 = n2 * T;
    const sideS = (b: Rect, side: Side) => (side === "E" || side === "W" ? [b.y0 - R.y0, b.y1 - R.y0] : [b.x0 - R.x0, b.x1 - R.x0]);
    const clearOf = (b: Rect) => within(b, R) && !keep.some((x) => hits(x, b)) && !placed.some((x) => hits(x, b));
    let done = false;
    for (const side of r.shuffle([...SIDES])) {
      if (done) break;
      const fr = frame(R, side);
      if (!L) {
        if (fr.len < run1 + 24) continue;
        for (let k = 0; k < 24 && !done; k++) {
          const s0 = k === 0 ? 0 : k === 1 ? fr.len - run1 : Math.round((r.f() * (fr.len - run1)) / 2) * 2;
          const b = fr.box(s0, 0, s0 + run1, W + railT);
          if (!clearOf(b) || !backed(rm, q, fr, s0, s0 + run1)) continue;
          // (An open end that isn't against a wall needs room to walk off it: 30" clear.)
          placed.push(b, fr.box(s0 - 30, 0, s0, W), fr.box(s0 + run1, 0, s0 + run1 + 30, W));
          const up = r.chance(0.5), foot = up ? s0 : s0 + run1, dir = up ? 1 : -1;
          for (let i = 0; i <= n1; i++) line([fr.f(s0 + i * T, 0), fr.f(s0 + i * T, W)], fine);
          drawRail(fr, s0, s0 + run1, W, rail, railT);
          drawArrow(fr, foot, dir, run1, W);
          if (r.chance(0.6)) drawBreak(fr, s0 + run1 * (0.45 + 0.2 * r.f()), W);
          g.key.stairs.push(ring(fr.box(s0, 0, s0 + run1, W + railT)));
          done = true;
        }
      } else {
        // Leg 1 runs along this wall into the corner at s = fr.len; the landing fills the corner; leg 2 runs out
        // along the wall at that end.
        if (fr.len < run1 + W + 24) continue;
        const s0 = fr.len - W - run1;
        const leg1 = fr.box(s0, 0, fr.len, W + railT), leg2 = fr.box(fr.len - W - railT, 0, fr.len, W + run2);
        if (!clearOf(leg1) || !clearOf(leg2) || !backed(rm, q, fr, s0, fr.len)) continue;
        const s2: Side = side === "N" || side === "S" ? "E" : "S"; // (the wall at this frame's far end)
        const [a2, b2] = sideS(fr.box(fr.len - W, W, fr.len, W + run2), s2);
        if (!backed(rm, q, frame(R, s2), a2, b2)) continue;
        placed.push(leg1, leg2, fr.box(s0 - 30, 0, s0, W), fr.box(fr.len - W, W + run2, fr.len, W + run2 + 30));
        for (let i = 0; i <= n1; i++) line([fr.f(s0 + i * T, 0), fr.f(s0 + i * T, W)], fine);
        for (let i = 0; i <= n2; i++) line([fr.f(fr.len - W, W + i * T), fr.f(fr.len, W + i * T)], fine);
        if (r.chance(0.5)) line([fr.f(fr.len - W, 0), fr.f(fr.len - W, W), fr.f(fr.len, W)], fine, [4, 3]); // the landing's edges
        drawRail(fr, s0, fr.len - W, W, rail, railT);
        // (Leg 2's open side: along s = fr.len - W, from the landing out.)
        const d2 = (k: number) => [fr.f(fr.len - W - k, W), fr.f(fr.len - W - k, W + run2)];
        if (rail !== "edge") line(d2(0), thin);
        if (railT) line(d2(railT), thin);
        if (rail === "pony" && r.chance(0.4)) for (const h2 of hatch([boxOf(fr.box(fr.len - W - railT, W, fr.len - W, W + run2))], 2, 45)) line(h2, fine);
        const up = r.chance(0.5);
        if (up) drawArrow(fr, s0, 1, run1 + W / 2, W);
        else {
          const tip = fr.f(fr.len - W / 2, W + run2 - 6), start = fr.f(fr.len - W / 2, W + 4);
          line([tip, start], fine);
          text("DN", fr.f(fr.len - W / 2, W + run2 + 8), 5);
        }
        if (r.chance(0.6)) {
          const at2 = W + run2 * (0.5 + 0.2 * r.f());
          line([fr.f(fr.len - W - 2, at2 - 6), fr.f(fr.len - W / 2 - 2, at2), fr.f(fr.len - W / 2 + 2, at2 - 3), fr.f(fr.len + 1, at2 + 3)], fine);
        }
        const cutP = pc.union(boxOf(leg1), boxOf(leg2)) as Pt[][][];
        g.key.stairs.push(cutP[0][0]);
        done = true;
      }
    }
    if (done && r.chance(0.35)) {
      const b = g.key.stairs[g.key.stairs.length - 1], xs = b.map((p) => p[0]), ys = b.map((p) => p[1]);
      if (r.chance(0.5)) text(r.pick(["STAIRS", "STAIR", "14 R @ 7 1/2\"", "13 RISERS"]), [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ys) + inIn(9)], 5);
    }
  }
  function ring(b: Rect): Pt[] { return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1], [b.x0, b.y0]]; }
  function drawRail(fr: Frame, a: number, b: number, W: number, rail: "one" | "two" | "pony" | "edge", railT: number) {
    line([fr.f(a, W), fr.f(b, W)], rail === "edge" ? fine : thin);
    if (railT) line([fr.f(a, W + railT), fr.f(b, W + railT)], thin);
    if (railT && rail !== "pony") { line([fr.f(a, W), fr.f(a, W + railT)], thin); line([fr.f(b, W), fr.f(b, W + railT)], thin); }
    if (rail === "pony") { line([fr.f(a, W), fr.f(a, W + railT)], thin); if (r.chance(0.4)) for (const h2 of hatch([boxOf(fr.box(a, W, b, W + railT))], 2, 45)) line(h2, fine); }
    if (rail === "two" && r.chance(0.35)) for (let s2 = a + 4; s2 < b - 2; s2 += 5) curve(circle(fr.f(s2, W + railT / 2), 0.6), fine);
  }
  function drawArrow(fr: Frame, foot: number, dir: number, len: number, W: number) {
    const a = fr.f(foot + dir * 6, W / 2), b = fr.f(foot + dir * (len - 8), W / 2), back = fr.f(foot + dir * (len - 14), W / 2 - 3), back2 = fr.f(foot + dir * (len - 14), W / 2 + 3);
    line([a, b], fine);
    line([back, b, back2], fine);
    curve(circle(a, 1.2), fine);
    text(r.chance(0.7) ? "UP" : "DN", fr.f(foot + dir * 14, W / 2 + (r.chance(0.5) ? 7 : -7)), 5);
  }
  function drawBreak(fr: Frame, at: number, W: number) {
    line([fr.f(at - 10, -1), fr.f(at - 2, W * 0.45), fr.f(at + 2, W * 0.4), fr.f(at + 10, W + 1)], thin);
  }

  // ---- kitchens ----
  if (c.fixtures && great && kz) {
    const R = inside(great, kz.rect);
    const sides: Side[] = ["N", ...(r.chance(0.6) ? [r.pick(["E", "W"] as Side[])] : [])];
    for (const side of sides) {
      const fr = frame(R, side);
      const start = side === "N" ? 0 : 26;
      // The longest stretch along this wall that's a wall and clear of doors.
      let best: [number, number] | null = null;
      let a = start;
      for (let s = start; s <= fr.len; s += 2) {
        const okHere = s < fr.len && backed(great, kz.rect, fr, s, s + 2) && !keep.some((x) => hits(x, fr.box(s, 0, s + 2, 24)));
        if (!okHere) {
          if (!best || s - a > best[1] - best[0]) best = [a, s];
          a = s + 2;
        }
      }
      if (!best || best[1] - best[0] < 72) continue;
      let [s0, s1] = best;
      placed.push(fr.box(s0, 0, s1, 24));
      // The fridge at one end, out of any window.
      const fEnd = r.chance(0.5) ? s0 : s1 - 36;
      if (!tall.some((x) => hits(x, fr.box(fEnd, 0, fEnd + 36, 30))) && s1 - s0 > 120) {
        rectF(fr, fEnd, 0, fEnd + 36, 30);
        if (r.chance(0.5)) line([fr.f(fEnd, 30), fr.f(fEnd + 36, 0)], fine);
        lbl(r.pick(["REF", "REF.", "FRIG"]), fr.f(fEnd + 18, 15), 4.5);
        if (fEnd === s0) s0 += 36;
        else s1 -= 36;
      }
      line([fr.f(s0, 0), fr.f(s0, 24), fr.f(s1, 24), fr.f(s1, 0)]);
      // Sometimes the counter's back edge or backsplash, a hair off the wall's face.
      if (r.chance(0.5)) line([fr.f(s0, r.pick([0.75, 1, 1.5])), fr.f(s1, r.pick([0.75, 1, 1.5]))], fine);
      // Uppers: dashed, not over windows.
      if (r.chance(0.7)) {
        let u0 = s0;
        for (let s = s0; s <= s1; s += 2) {
          const blocked = s >= s1 || tall.some((x) => hits(x, fr.box(s, 0, s + 2, 4)));
          if (blocked) {
            if (s - u0 >= 18) line([fr.f(u0, 0), fr.f(u0, 12), fr.f(s, 12), fr.f(s, 0)], fine, [5, 3]);
            u0 = s + 2;
          }
        }
      }
      // The sink (under a window if there is one), the dishwasher beside it, the range away from both.
      const win = openings.find((o) => o.type === "window" && tall.some((x) => hits(x, fr.box(s0, 0, s1, 4))) && hits(ext(at(runs[o.run], o.s0, -4), at(runs[o.run], o.s1, 4)), fr.box(s0, -8, s1, 4)));
      let sc = (s0 + s1) / 2;
      if (win) {
        const q = runs[win.run], m = at(q, (win.s0 + win.s1) / 2, 0);
        const p0 = fr.f(0, 0);
        sc = fr.side === "N" || fr.side === "S" ? m[0] - p0[0] : m[1] - p0[1];
      }
      sc = Math.max(s0 + 20, Math.min(s1 - 20, sc));
      rectF(fr, sc - 16, 3, sc - 1, 19, fine);
      rectF(fr, sc + 1, 3, sc + 16, 19, fine);
      if (sc + 18 + 24 <= s1) {
        rectF(fr, sc + 18, 0, sc + 42, 22, fine, [3, 2]);
        if (r.chance(0.6)) lbl("DW", fr.f(sc + 30, 11), 4);
      }
      const rs = sc - 30 - 36 >= s0 ? sc - 36 - 30 : sc + 48 + 30 <= s1 ? sc + 48 : null;
      if (rs != null) {
        // (The range, sometimes drawn into the wall — its back over the wall's face.)
        const into = r.pick([0, 0, -1, -2]);
        rectF(fr, rs, into, rs + 30, 24, fine);
        for (const [x, y] of [[8, 7], [22, 7], [8, 17], [22, 17]]) curve(circle(fr.f(rs + x, y), r.pick([3.5, 4])), fine);
      }
    }
    // An island, when there's room to walk around it.
    const fr = frame(R, "N");
    const depth = R.y1 - R.y0, width = R.x1 - R.x0;
    if (depth >= 24 + 42 + 36 + 42 && width >= 72 + 2 * 42 && r.chance(0.6)) {
      const il = Math.min(r.pick([72, 84, 96]), width - 2 * 42), id = r.pick([36, 42]);
      const s0 = (width - il) / 2, d0 = 24 + 42;
      const b = fr.box(s0, d0, s0 + il, d0 + id);
      if (!keep.some((x) => hits(x, b))) {
        rectF(fr, s0, d0, s0 + il, d0 + id);
        if (r.chance(0.5)) line([fr.f(s0, d0 + id - 12), fr.f(s0 + il, d0 + id - 12)], fine, [4, 3]);
        if (r.chance(0.4)) ellF(fr, s0 + il / 2, d0 + 14, 9, 7, fine);
        if (r.chance(0.3)) lbl("ISLAND", fr.f(s0 + il / 2, d0 + id / 2), 5);
      }
    }
  }

  // ---- the other rooms ----
  for (const rm of c.fixtures ? rooms : []) {
    const q = rm.rects[0];
    if (!q || rm.type === "great") continue;
    const R = inside(rm, q);
    const W = R.x1 - R.x0, H = R.y1 - R.y0;
    const shortSides: Side[] = W <= H ? ["N", "S"] : ["E", "W"];
    const longSides: Side[] = W <= H ? ["E", "W"] : ["N", "S"];
    const shortLen = Math.min(W, H);
    if (rm.type === "bath" || rm.type === "mbath") {
      const big = rm.type === "mbath" && Math.min(W, H) >= 90;
      if (big) {
        const [tl, td, sl, sd, vl] = [r.pick([60, 66, 72]), r.pick([36, 42]), r.pick([42, 48]), r.pick([36, 42, 48]), r.pick([60, 72])];
        place(rm, q, R, { len: tl, depth: td, draw: tub(tl, td), where: "corner" });
        place(rm, q, R, { len: sl, depth: sd, draw: shower(sl, sd), where: "corner" });
        place(rm, q, R, { len: vl, depth: 21, draw: vanity(vl, 2) });
        place(rm, q, R, { len: 20, depth: 28, draw: toilet });
      } else {
        const tl = Math.min(shortLen, 66);
        const td = r.pick([30, 32]);
        if (tl >= 54) place(rm, q, R, { len: tl, depth: td, draw: tub(tl, td), sides: r.shuffle([...shortSides]), where: "corner" });
        else place(rm, q, R, { len: 36, depth: 36, draw: shower(36, 36), where: "corner" });
        place(rm, q, R, { len: 20, depth: 28, draw: toilet, sides: r.shuffle([...longSides]) });
        const vl = r.pick([30, 36, 42, 48]);
        if (!place(rm, q, R, { len: vl, depth: 21, draw: vanity(vl, 1) })) place(rm, q, R, { len: 24, depth: 21, draw: vanity(24, 1) });
      }
    } else if (rm.type === "half") {
      place(rm, q, R, { len: 20, depth: 28, draw: toilet });
      place(rm, q, R, { len: 24, depth: 20, draw: vanity(24, 1) });
    } else if (rm.type === "laundry") {
      place(rm, q, R, {
        len: 56,
        depth: 28,
        draw: (fr, s0) => {
          rectF(fr, s0, 0, s0 + 27, 27);
          rectF(fr, s0 + 29, 0, s0 + 56, 27);
          const [w, d] = r.pick([["W", "D"], ["WASH", "DRY"], ["W", "D"]]);
          lbl(w, fr.f(s0 + 13.5, 13.5), 4.5);
          lbl(d, fr.f(s0 + 42.5, 13.5), 4.5);
          if (r.chance(0.5)) line([fr.f(0, 14), fr.f(fr.len, 14)], fine, [4, 3]);
        },
      });
    } else if (rm.type === "closet" || rm.type === "wic") {
      // Shelf and rod: along the wall across from the door — a line (and a dashed one) a foot off the wall.
      const doorSides = new Set(openings.filter((o) => runs[o.run].sides.includes(rm.id) && o.type !== "window").map((o) => sideOf(runs[o.run], q)));
      const free = SIDES.filter((s) => !doorSides.has(s));
      const wicWalls = longSides.filter((s) => !doorSides.has(s));
      const pickSides = rm.type === "wic" && wicWalls.length ? wicWalls : free.sort((a, b) => frame(R, b).len - frame(R, a).len).slice(0, 1);
      const dep = r.pick([12, 14, 12]);
      for (const sd of pickSides) {
        const fr = frame(R, sd);
        if (fr.len >= 24) shelves(dep, r.chance(0.7))(fr, 0);
      }
      if (pickSides.length && r.chance(0.3)) {
        const fr = frame(R, pickSides[0]);
        lbl(r.pick(["S&R", "SH. & ROD", "SHELF & ROD"]), fr.f(fr.len / 2, dep + 5), 4);
      }
    } else if (rm.type === "pantry" || rm.type === "linen") {
      const doorSides = new Set(openings.filter((o) => runs[o.run].sides.includes(rm.id) && o.type !== "window").map((o) => sideOf(runs[o.run], q)));
      const dep = r.pick([12, 14, 16]);
      for (const sd of SIDES.filter((s) => !doorSides.has(s))) {
        const fr = frame(R, sd);
        if (fr.len >= 20) line([fr.f(0, dep), fr.f(fr.len, dep)], thin);
      }
      if (r.chance(0.4)) lbl(r.pick(["SHELVES", "SHELVES", "(5) SHELVES"]), [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2 + 6], 4);
    } else if (rm.type === "garage") {
      if (r.chance(0.6))
        place(rm, q, R, {
          len: 26,
          depth: 26,
          draw: (fr, s0) => {
            curve(circle(fr.f(s0 + 13, 13), 11));
            if (r.chance(0.6)) lbl(r.pick(["W.H.", "WH", "WATER HEATER"]), fr.f(s0 + 13, 13), 4);
          },
          where: "corner",
        });
      if (r.chance(0.35)) {
        const sx = R.x0 + 48 + r.f() * Math.max(0, W - 150), sy = R.y0 + 48 + r.f() * Math.max(0, H - 150);
        const b = { x0: sx, y0: sy, x1: sx + 30, y1: sy + 54 };
        line([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], fine, [5, 3], true);
        line([[b.x0, b.y0], [b.x1, b.y1]], fine, [5, 3]);
        lbl(r.pick(["DISP. STAIRS", "ATTIC ACCESS", "PULL DOWN STAIRS"]), [sx + 15, sy + 66], 4.5);
      }
    }
  }
  // A fireplace on the living room's wall, sometimes.
  const lz = great?.zones.find((z) => z.role === "living");
  if (c.fixtures && great && lz && r.chance(0.5)) {
    const R = inside(great, lz.rect);
    place(great, lz.rect, R, {
      len: 60,
      depth: 22,
      isTall: true,
      draw: (fr, s0) => {
        rectF(fr, s0, 0, s0 + 60, 22);
        line([fr.f(s0 + 14, 0), fr.f(s0 + 19, 14), fr.f(s0 + 41, 14), fr.f(s0 + 46, 0)], fine);
        // A brick or stone surround: a band a wall's thickness wide around it, hatched; a hearth in front.
        if (r.chance(0.6 * c.lookalike)) {
          const t = r.pick([3.5, 4, 5.5]);
          rectF(fr, s0 - t, 0, s0 + 60 + t, 22 + t);
          const a = fr.f(s0 - t, 0), b = fr.f(s0 + 60 + t, 22 + t), o2 = fr.f(s0, 0), i2 = fr.f(s0 + 60, 22);
          const outer: Pt[] = [a, [b[0], a[1]], b, [a[0], b[1]], a], inner: Pt[] = [o2, [i2[0], o2[1]], i2, [o2[0], i2[1]], o2];
          for (const h2 of hatch(pc.difference([[outer]], [[inner]]) as Pt[][][], r.pick([2, 3]), 45)) line(h2, fine);
          if (r.chance(0.6)) rectF(fr, s0 - 6, 22 + t, s0 + 66, 22 + t + 18, fine);
          if (r.chance(0.5)) lbl(r.pick(["BRICK SURROUND", "STONE HEARTH", "RAISED HEARTH"]), fr.f(s0 + 30, 22 + t + 26), 4.5);
        }
        if (r.chance(0.5)) lbl(r.pick(["F.P.", "FIREPLACE", "GAS F.P."]), fr.f(s0 + 30, 30), 4.5);
      },
    });
  }

  // ---- lights, fans, switches, wires, outlets ----
  if (c.electric) {
    const lights = new Map<number, Pt[]>();
    for (const rm of rooms)
      for (const z of rm.zones) {
        if (z.role === "hall" && r.chance(0.5)) continue;
        const m: Pt = [(z.rect.x0 + z.rect.x1) / 2 + 14, (z.rect.y0 + z.rect.y1) / 2 - 22];
        const big = ["great", "bed", "master", "garage"].includes(rm.type);
        if (big && rm.type !== "garage" && z.role !== "kitchen" && r.chance(0.6)) {
          curve(circle(m, 5), fine);
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2 + Math.PI / 4, u: Pt = [Math.cos(a), Math.sin(a)], v: Pt = [-u[1], u[0]];
            line([add(m, mul(u, 6)), add(add(m, mul(u, 22)), mul(v, 3)), add(add(m, mul(u, 22)), mul(v, -3)), add(m, mul(u, 6))], fine);
          }
        } else {
          const rr = ["closet", "linen", "pantry", "wic"].includes(rm.type) ? 3 : 4.5;
          curve(circle(m, rr), fine);
          line([[m[0] - rr * 1.6, m[1]], [m[0] + rr * 1.6, m[1]]], fine);
          line([[m[0], m[1] - rr * 1.6], [m[0], m[1] + rr * 1.6]], fine);
        }
        lights.set(rm.id, [...(lights.get(rm.id) ?? []), m]);
      }
    // Can lights: rows of small circles across kitchens, living rooms, baths, halls — some only a foot or two off a wall.
    const canR = r.pick([2.5, 3, 3.5]), canDot = r.chance(0.4), canX = !canDot && r.chance(0.3);
    const can = (p: Pt) => {
      curve(circle(p, canR), fine);
      if (canDot) curve(circle(p, canR * 0.45), fine);
      if (canX) {
        line([[p[0] - canR * 0.7, p[1] - canR * 0.7], [p[0] + canR * 0.7, p[1] + canR * 0.7]], fine);
        line([[p[0] - canR * 0.7, p[1] + canR * 0.7], [p[0] + canR * 0.7, p[1] - canR * 0.7]], fine);
      }
    };
    const canShare = r.pick([0.5, 0.75, 1]);
    for (const rm of rooms) {
      if (rm.type === "garage" || !r.chance(canShare)) continue;
      const small = ["closet", "linen", "pantry", "wic", "bath", "half", "laundry"].includes(rm.type);
      for (const q of rm.rects) {
        const R = inside(rm, q);
        const w = R.x1 - R.x0, h = R.y1 - R.y0;
        if (w < 30 || h < 30) continue;
        const edge = r.pick([18, 24, 30, 36]);
        const sp = r.pick([48, 54, 60, 72]);
        const nx = small ? Math.max(1, Math.round((w - 2 * edge) / sp) + 1) : Math.max(1, Math.round((w - 2 * edge) / sp) + 1);
        const ny = Math.max(1, Math.round((h - 2 * edge) / sp) + 1);
        if (nx * ny > 16) continue;
        const cells: Pt[] = [];
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < ny; j++) {
            const x = nx === 1 ? (R.x0 + R.x1) / 2 : R.x0 + edge + (i * (w - 2 * edge)) / (nx - 1);
            const y = ny === 1 ? (R.y0 + R.y1) / 2 : R.y0 + edge + (j * (h - 2 * edge)) / (ny - 1);
            cells.push([x, y]);
          }
        // (Not on the room's center light.)
        const ml = lights.get(rm.id) ?? [];
        for (const p of cells) if (!ml.some((m) => Math.hypot(m[0] - p[0], m[1] - p[1]) < 14)) can(p);
        lights.set(rm.id, [...ml, ...cells]);
      }
    }
    // A switch by each door — on the wall beside it (latch side first, else the hinge side), touching the wall's
    // face or on a short stem from it — and (on most plans) its wire to the room's nearest light.
    const wires = r.chance(0.7), stem = r.chance(0.35), swSize = r.pick([5, 5.5, 6.5]);
    const half = inIn(swSize * 0.72) / 2 + 0.5; // half the symbol's height, in the house's inches
    // Whether the spot s along run q, on the room's side, is solid wall face of that room (not a doorway, past a corner, or in a crossing wall).
    const onWall = (q: Run, s: number, into: number, side: number) => {
      const len = q.horiz ? q.b[0] - q.a[0] : q.b[1] - q.a[1];
      if (s < 4 || s > len - 4) return false;
      if (openings.some((o2) => runs[o2.run] === q && s > o2.s0 - 4 && s < o2.s1 + 4)) return false;
      const rm = rooms.find((x) => x.id === into);
      if (!rm) return false;
      const p = at(q, s, side * (q.t / 2 + 1));
      return rm.rects.some((rq) => {
        const R = inside(rm, rq);
        return q.horiz ? p[0] > R.x0 + 4 && p[0] < R.x1 - 4 && p[1] > R.y0 - 2 && p[1] < R.y1 + 2 : p[1] > R.y0 + 4 && p[1] < R.y1 - 4 && p[0] > R.x0 - 2 && p[0] < R.x1 + 2;
      });
    };
    for (const o of openings) {
      if (o.type !== "door" || o.into === undefined || o.into === OUT) continue;
      const into = o.into, q = runs[o.run], ls = lights.get(into);
      if (!ls) continue;
      const side = into === q.sides[1] ? 1 : -1;
      const latchDir = o.hingeAtS0 ? 1 : -1;
      const gang = r.chance(0.2) ? 2 : 1;
      let spots: number[] | null = null;
      for (const [edge, dir] of [[o.hingeAtS0 ? o.s1 : o.s0, latchDir], [o.hingeAtS0 ? o.s0 : o.s1, -latchDir]] as [number, number][]) {
        const ss = Array.from({ length: gang }, (_, k) => edge + dir * (6 + k * 6));
        if (ss.every((x) => onWall(q, x, into, side))) { spots = ss; break; }
      }
      if (!spots) continue;
      spots.forEach((along, k) => {
        const st = stem ? r.pick([3, 4, 5]) : 0;
        if (st) line([at(q, along, side * (q.t / 2)), at(q, along, side * (q.t / 2 + st))], fine);
        const sw = at(q, along, side * (q.t / 2 + st + half));
        text(k ? r.pick(["$", "$3"]) : r.pick(["$", "$", "S"]), sw, swSize, q.horiz ? "x" : "y");
        if (!wires || k) return;
        const light = ls.reduce((a2, b2) => (Math.hypot(b2[0] - sw[0], b2[1] - sw[1]) < Math.hypot(a2[0] - sw[0], a2[1] - sw[1]) ? b2 : a2));
        const mid = mul(add(sw, light), 0.5), d = sub(light, sw), bend = r.pick([0.25, -0.25, 0.4, -0.4]);
        const nrm: Pt = [-d[1] * bend, d[0] * bend];
        curve([[add(sw, mul(d, 0.08)), add(mid, nrm), add(mid, nrm), add(light, mul(d, -0.08))]], fine, [6, 2, 1.5, 2]);
      });
    }
  }
  if (c.outlets) {
    for (const rm of rooms) {
      if (["closet", "linen", "pantry", "wic", "garage"].includes(rm.type)) continue;
      for (const q of rm.rects) {
        const R = inside(rm, q);
        for (const side of SIDES) {
          const fr = frame(R, side);
          for (let s = r.pick([24, 48, 72]); s < fr.len - 12; s += r.pick([96, 120, 144])) {
            if (!backed(rm, q, fr, s - 6, s + 6) || keep.some((x) => hits(x, fr.box(s - 6, 0, s + 6, 6))) || placed.some((x) => hits(x, fr.box(s - 6, 0, s + 6, 6)))) continue;
            curve(circle(fr.f(s, 4), 2.5), fine);
            line([fr.f(s - 1.5, 0), fr.f(s - 1.5, 1.5)], fine);
            line([fr.f(s + 1.5, 0), fr.f(s + 1.5, 1.5)], fine);
          }
        }
      }
    }
  }

  // ---- room dimensions: a string across a room, wall face to wall face, drawn 3"–4" off a wall ----
  // (A line that close to a wall, the width of a stud, is what fools a plan reader into seeing a second wall.)
  if (c.roomDims > 0) {
    const tsz = r.pick([4.5, 5, 5.5]), tick = inIn(4);
    for (const rm of rooms) {
      if (rm.type === "garage" && r.chance(0.5)) continue;
      for (const q of rm.rects) {
        if (!r.chance(c.roomDims)) continue;
        const R = inside(rm, q);
        let made_h = false;
        // One string, sometimes one each way — each along a face that's a real wall end to end.
        const want = r.chance(0.35) ? 2 : 1;
        let made = 0;
        for (const side of r.shuffle([...SIDES])) {
          if (made >= want) break;
          const fr = frame(R, side);
          if (fr.len < 36 || !backed(rm, q, fr, 0, fr.len)) continue;
          if (made && (side === "N" || side === "S") === made_h) continue;
          // (Now and then out in the room, like Kala's hall: 2'-4' off the wall.)
          const off = r.chance(0.25) ? r.pick([24, 30, 36, 42]) : r.pick([3, 3.5, 3.5, 4, 4, 6]);
          line([fr.f(0, off), fr.f(fr.len, off)], fine);
          // (Kala, 2026-11-22: a short bar laid right along the wall's face at each end — not a wall, and not
          // across the doorway it can overlap.)
          const bar = r.chance(0.4) ? r.pick([6, 8, 9, 10]) : 0;
          for (const s2 of [0, fr.len]) {
            if (c.ticks === "slash") line([fr.f(s2 - tick / 2, off - tick / 2), fr.f(s2 + tick / 2, off + tick / 2)], thin);
            else if (c.ticks === "dot") line([fr.f(s2, off - tick / 2), fr.f(s2, off + tick / 2)], thin);
            else endMark(fr.f(s2, off), sub(fr.f(s2 ? s2 - 1 : 1, off), fr.f(s2, off)), tick);
            if (bar) line([fr.f(s2, off - bar / 2), fr.f(s2, off + bar / 2)], fine);
          }
          text(feetIn(fr.len), fr.f(fr.len / 2, off + inIn(tsz * 0.8)), tsz, side === "N" || side === "S" ? "x" : "y");
          made_h = side === "N" || side === "S";
          made++;
        }
      }
    }
  }

  // ---- dimension strings ----
  if (c.dims !== "none") {
    const tick = inIn(5), tsz = r.pick([5, 5.5, 6, 7]), toff = inIn(tsz * 0.75);
    const all = g.walls.flat().flat();
    const bb = { x0: Math.min(...all.map((p) => p[0])), x1: Math.max(...all.map((p) => p[0])), y0: Math.min(...all.map((p) => p[1])), y1: Math.max(...all.map((p) => p[1])) };
    const off1 = r.pick([36, 42, 48]) + inIn(10), off2 = off1 + r.pick([24, 30]) + inIn(6);
    const dimLine = (horiz: boolean, cc: number, stops: number[], extFrom: (s: number) => number, extTo: number) => {
      const xs = [...new Set(stops.map((s) => Math.round(s)))].sort((a, b) => a - b).filter((s, i, a) => i === 0 || s - a[i - 1] >= 10);
      if (xs.length < 2) return;
      const P = (s: number, d: number): Pt => (horiz ? [s, d] : [d, s]);
      line([P(xs[0] - inIn(4), cc), P(xs[xs.length - 1] + inIn(4), cc)], fine);
      for (const [j, s] of xs.entries()) {
        if (c.ticks === "slash") line([P(s - tick / 2, cc + tick / 2), P(s + tick / 2, cc - tick / 2)], thin);
        else if (c.ticks === "dot") curve(circle(P(s, cc), inIn(1.2)), fine);
        else if (c.ticks === "circle") endMark(P(s, cc), sub(P(s + 1, cc), P(s, cc)), tick);
        else {
          // (Arrowheads: back to back at a middle stop, one at each end.)
          if (j > 0) endMark(P(s, cc), sub(P(s - 1, cc), P(s, cc)), tick);
          if (j < xs.length - 1) endMark(P(s, cc), sub(P(s + 1, cc), P(s, cc)), tick);
        }
        const e0 = extFrom(s);
        line([P(s, e0), P(s, extTo)], fine);
      }
      // The text just above the line (left of it, on an up-and-down one).
      for (let i = 0; i + 1 < xs.length; i++) text(feetIn(xs[i + 1] - xs[i]), P((xs[i] + xs[i + 1]) / 2, cc - toff), tsz, horiz ? "x" : "y");
    };
    for (const side of SIDES) {
      const horiz = side === "N" || side === "S";
      // The outside walls facing this way: their ends and corners are the stops.
      const facing = runs.filter((q) => q.kind === "ext" && q.horiz === horiz && (side === "N" || side === "W" ? q.sides[0] === OUT : q.sides[1] === OUT));
      if (!facing.length) continue;
      const face = (q: Run) => (horiz ? q.a[1] : q.a[0]) + ((side === "N" || side === "W" ? -1 : 1) * q.t) / 2;
      const edge = side === "N" ? bb.y0 : side === "S" ? bb.y1 : side === "W" ? bb.x0 : bb.x1;
      const dir = side === "N" || side === "W" ? -1 : 1;
      const stops = facing.flatMap((q) => (horiz ? [q.a[0], q.b[0]] : [q.a[1], q.b[1]]));
      const lo = Math.min(...stops), hi = Math.max(...stops);
      const faceAt = (s: number) => {
        const q = facing.find((w) => (horiz ? w.a[0] <= s + 0.5 && w.b[0] >= s - 0.5 : w.a[1] <= s + 0.5 && w.b[1] >= s - 0.5));
        return q ? face(q) + dir * 6 : edge + dir * 6;
      };
      const opp = side === "N" ? bb.y1 + off2 : side === "S" ? bb.y0 - off2 : side === "W" ? bb.x1 + off2 : bb.x0 - off2;
      dimLine(horiz, edge + dir * off1, stops, (s) => (c.longExt && r.chance(0.5) ? opp : faceAt(s)), edge + dir * (off1 + inIn(6)));
      dimLine(horiz, edge + dir * off2, [lo, hi], (s) => edge + dir * (off1 + inIn(6)), edge + dir * (off2 + inIn(6)));
    }
    if (c.dims === "extInt") {
      // A string or two across the inside, wall to wall.
      for (let k = 0; k < r.int(1, 3); k++) {
        const horiz = r.chance(0.5);
        const cc = horiz ? bb.y0 + (0.2 + 0.6 * r.f()) * (bb.y1 - bb.y0) : bb.x0 + (0.2 + 0.6 * r.f()) * (bb.x1 - bb.x0);
        const crossing = runs.filter((q) => q.horiz !== horiz && (horiz ? q.a[1] < cc && q.b[1] > cc : q.a[0] < cc && q.b[0] > cc)).map((q) => (horiz ? q.a[0] : q.a[1]));
        if (crossing.length >= 3) dimLine(horiz, cc, crossing, () => cc - inIn(4), cc + inIn(4));
      }
    }
  }

  // ---- look-alikes: line pairs a wall's thickness apart that are NOT walls (what the wall AI paints by mistake) ----
  // Never in the answer key — the user's markups leave beams, soffits, half walls, ledges and built-ins out.
  {
    const L2 = c.lookalike;
    const pairGap = () => r.pick([3.5, 3.5, 5.5, 5.5, 4.5, 7.25, 11.25]);
    const dashOf = () => r.pick([undefined, [8, 4], [12, 3, 2, 3], [6, 3]] as (number[] | undefined)[]);
    // Beams across a room, wall face to wall face: a pair of lines a stud's depth apart, solid or dashed, labeled.
    for (const rm of rooms) {
      if (!["great", "master", "bed", "garage"].includes(rm.type) || !r.chance(0.55 * L2)) continue;
      const q = rm.rects[0], R = inside(rm, q);
      const w = R.x1 - R.x0, h = R.y1 - R.y0;
      const across = w < h; // across the short way, like a real beam
      for (let k = 0; k < (rm.type === "great" && r.chance(0.5) ? 2 : 1); k++) {
        const gap = pairGap(), dash = dashOf(), f = 0.25 + 0.5 * r.f();
        const P = (a: number, b: number): Pt => (across ? [a, b] : [b, a]);
        const [lo, hi] = across ? [R.x0, R.x1] : [R.y0, R.y1];
        const at0 = across ? R.y0 + f * h : R.x0 + f * w;
        line([P(lo, at0), P(hi, at0)], thin, dash);
        line([P(lo, at0 + gap), P(hi, at0 + gap)], thin, dash);
        if (r.chance(0.8)) text(r.pick(["DBL 2X12 BEAM", "(3) 2X12 BEAM", "LVL BEAM ABOVE", "DROPPED BEAM", "DBL 2\" X 12\"", "4X12 HDR."]), P((lo + hi) / 2, at0 + gap + inIn(7)), 5, across ? "x" : "y");
      }
    }
    // Soffits and ceiling lines: long dashed lines (sometimes pairs) across the great room or kitchen.
    if (great && r.chance(0.6 * L2)) {
      const R = inside(great, great.rects[0]);
      const horiz = r.chance(0.5), f = 0.2 + 0.6 * r.f(), d = r.pick([[12, 4], [6, 3], [18, 4, 3, 4]]);
      const P = (a: number, b: number): Pt => (horiz ? [a, b] : [b, a]);
      const [lo, hi] = horiz ? [R.x0, R.x1] : [R.y0, R.y1];
      const at0 = horiz ? R.y0 + f * (R.y1 - R.y0) : R.x0 + f * (R.x1 - R.x0);
      line([P(lo, at0), P(hi, at0)], fine, d);
      if (r.chance(0.5)) line([P(lo, at0 + r.pick([12, 18, 24])), P(hi, at0 + r.pick([12, 18, 24]))], fine, d);
      text(r.pick(["LINE OF CLG. ABOVE", "SOFFIT ABOVE", "8' SOFFIT", "VAULT LINE", "TRAY CLG."]), P((lo + hi) / 2, at0 - inIn(7)), 5, horiz ? "x" : "y");
    }
    // Half walls, eating ledges, raised bars: a short double-line box a wall's thickness wide, between kitchen and living.
    if (great && kz && r.chance(0.6 * L2)) {
      const R = inside(great, kz.rect), G = inside(great, great.rects[0]);
      const t = pairGap(), len = r.pick([48, 60, 72, 96]);
      // Along the kitchen zone's side facing the room, starting from a wall face (a peninsula) or standing free.
      const horiz = R.y1 < G.y1 - 30 ? true : R.x1 < G.x1 - 30 ? false : null;
      if (horiz !== null) {
        const cc = horiz ? Math.min(R.y1, G.y1 - 30) : Math.min(R.x1, G.x1 - 30);
        const start = r.chance(0.5) ? (horiz ? G.x0 : G.y0) : (horiz ? G.x0 : G.y0) + r.pick([36, 48]);
        const b: Rect = horiz ? { x0: start, y0: cc, x1: start + len, y1: cc + t } : { x0: cc, y0: start, x1: cc + t, y1: start + len };
        if (!keep.some((x) => hits(x, b)) && (horiz ? b.x1 < G.x1 - 30 : b.y1 < G.y1 - 30)) {
          line([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], thin, undefined, true);
          if (r.chance(0.4)) for (const h2 of hatch([boxOf(b)], 2, 45)) line(h2, fine);
          if (r.chance(0.5)) line(horiz ? [[b.x0, b.y1 + 10], [b.x1, b.y1 + 10]] : [[b.x1 + 10, b.y0], [b.x1 + 10, b.y1]], fine); // the bar top overhang
          text(r.pick(['42" HALF WALL', "EATING LEDGE", "RAISED BAR", "PONY WALL", '36" KNEE WALL', "RAISED LEDGE"]), horiz ? [(b.x0 + b.x1) / 2, b.y1 + inIn(14)] : [b.x1 + inIn(14), (b.y0 + b.y1) / 2], 5, horiz ? "x" : "y");
        }
      }
    }
    // Built-ins along a wall: benches, desks, window seats, lockers — 12"–24" deep, a double line along the front edge.
    for (const rm of rooms) {
      if (!["bed", "master", "laundry", "flex", "great"].includes(rm.type) || !r.chance(0.35 * L2)) continue;
      const q = rm.rects[0], R = inside(rm, q);
      place(rm, q, R, {
        len: r.pick([48, 60, 72]),
        depth: r.pick([12, 16, 18, 24]),
        draw: (fr, s0) => {
          const len = fr.len >= s0 + 72 ? r.pick([48, 60, 72]) : 48, dep = r.pick([12, 16, 18, 24]);
          rectF(fr, s0, 0, s0 + len, dep);
          const lip = r.pick([1.5, 3.5]);
          line([fr.f(s0, dep - lip), fr.f(s0 + len, dep - lip)], fine);
          if (r.chance(0.6)) lbl(r.pick(["BUILT-INS", "BENCH", "DESK", "WINDOW SEAT", "LOCKERS", "CABINETS"]), fr.f(s0 + len / 2, dep / 2), 4.5);
        },
      });
    }
    // Tile showers: a curb (double line) across the open side, glass marked by a thin line beside it.
    for (const rm of rooms) {
      if (!["bath", "mbath"].includes(rm.type) || !r.chance(0.5 * L2)) continue;
      const q = rm.rects[0], R = inside(rm, q);
      place(rm, q, R, {
        len: 48,
        depth: 40,
        where: "corner",
        draw: (fr, s0) => {
          rectF(fr, s0, 0, s0 + 48, 40, fine);
          line([fr.f(s0, 36), fr.f(s0 + 48, 36)]);
          line([fr.f(s0, 40), fr.f(s0 + 48, 40)]);
          if (r.chance(0.5)) line([fr.f(s0, 0), fr.f(s0 + 48, 36)], fine);
          if (r.chance(0.6)) lbl(r.pick(["TILE SHOWER", "SHWR.", "GLASS ENCL.", "CURB"]), fr.f(s0 + 24, 20), 4.5);
        },
      });
    }
  }

  // ---- door and window tags ----
  for (const o of openings) {
    const q = runs[o.run], w = o.s1 - o.s0;
    if (o.type === "door" && o.cased) {
      // Its label in the opening or just off it: "CASED OPNG", "6070 ARCH", "8'-0" OPNG.".
      if (r.chance(0.7)) {
        const t = r.pick([`${tag(w)}70 ARCH`, "CASED OPNG.", `${Math.round(w / 12)}'-0" OPNG.`, `${tag(w)}80 C.O.`, "ARCH"]);
        text(t, at(q, (o.s0 + o.s1) / 2, r.chance(0.5) ? 0 : (r.chance(0.5) ? 1 : -1) * (q.t / 2 + inIn(7))), 5, q.horiz ? "x" : "y");
      }
    } else if (o.type === "door" && c.doorTags && o.into !== undefined && o.into !== OUT) {
      const side = o.into === q.sides[1] ? 1 : -1;
      text(tag(w) + (o.bifold ? " BI" : ""), at(q, (o.s0 + o.s1) / 2 + (o.hingeAtS0 ? 8 : -8), side * (q.t / 2 + Math.min(w * 0.45, 16))), 5);
    } else if (o.type === "window" && c.winTags) {
      const outSide = q.sides[0] === OUT ? -1 : 1;
      const h = r.pick([40, 50, 60, 60, 70]);
      text(`${tag(w)}${h}`, at(q, (o.s0 + o.s1) / 2, outSide * (q.t / 2 + inIn(9))), 5, q.horiz ? "x" : "y");
    } else if (o.type === "garage" && c.winTags) {
      const outSide = q.sides[0] === OUT ? 1 : -1;
      const gt = r.pick([`${Math.round(w / 12)}' X ${r.pick([7, 8])}' O.H. DR.`, `${Math.round(w / 12)}°${r.pick([7, 8])}° GARAGE DOOR`, `${Math.round(w / 12)}' GARAGE DOOR`]);
      text(gt, at(q, (o.s0 + o.s1) / 2, r.chance(0.5) ? 0 : outSide * -30), 5, q.horiz ? "x" : "y");
    }
  }


  // ---- round 5 (2026-11-24): what other drafters' and software's plans look like (web research; none of it is floor) ----
  const E = c.extra;
  const roomRects = rooms.flatMap((rm) => rm.rects.slice(0, 1).map((q) => ({ rm, q, R: inside(rm, q) }))).filter((x) => x.R.x1 - x.R.x0 > 24 && x.R.y1 - x.R.y0 > 24);
  // Gray (or tinted) room fills, outline-free, under everything.
  if (E.roomFill) {
    const gray = r.pick([0.82, 0.86, 0.9, 0.93]);
    for (const { rm, R } of roomRects) if (rm.type !== "garage") out.unshift({ k: "fill", rings: [[[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1], [R.x0, R.y0]]], gray: rm.type === "bath" || rm.type === "mbath" ? gray - 0.05 : gray });
  }
  // Wall layers: drywall lines ½" in from each face, sheathing on outside walls (Chief Architect / Revit fine detail).
  if (E.layers)
    runs.forEach((q, i) => {
      const R0 = g.runRects[i];
      const len = q.horiz ? q.b[0] - q.a[0] : q.b[1] - q.a[1];
      const ops = openings.filter((o) => o.run === i).map((o) => [o.s0, o.s1]).sort((a, b) => a[0] - b[0]);
      const spans: number[][] = [];
      let s0 = 0;
      for (const [a, b] of ops) { if (a > s0) spans.push([s0, a]); s0 = Math.max(s0, b); }
      if (s0 < len) spans.push([s0, len]);
      const lo = q.horiz ? R0.y0 : R0.x0;
      const ds = q.kind === "ext" ? [0.5, q.t - 0.5, q.t - 1.25] : [0.5, q.t - 0.5];
      for (const d of ds) for (const [a, b] of spans) {
        if (b - a < 2) continue;
        line(q.horiz ? [[q.a[0] + a, lo + d], [q.a[0] + b, lo + d]] : [[lo + d, q.a[1] + a], [lo + d, q.a[1] + b]], fine * 0.8);
      }
    });
  // Ceilings: tray outlines (one or two, dashed, inset 12"–24"), vaults (a dashed ridge line), and a note.
  if (E.ceil)
    for (const { rm, R } of roomRects) {
      if (!["bed", "master", "great", "flex"].includes(rm.type) || !r.chance(E.ceil)) continue;
      const dash = r.pick([[6, 4], [10, 4], [4, 3]]);
      if (r.chance(0.6)) {
        const d = r.pick([12, 18, 24]);
        for (const k of r.chance(0.35) ? [d, d + 8] : [d]) if (R.x1 - R.x0 > 2 * k + 24 && R.y1 - R.y0 > 2 * k + 24) line([[R.x0 + k, R.y0 + k], [R.x1 - k, R.y0 + k], [R.x1 - k, R.y1 - k], [R.x0 + k, R.y1 - k]], fine, dash, true);
        if (r.chance(0.5)) text(r.pick(["TRAY CLG", "TRAY CEILING", "10'-0\" TRAY", "9'-0\" CLG"]), [(R.x0 + R.x1) / 2, R.y0 + d + 10], 4.5);
      } else {
        const wide = R.x1 - R.x0 >= R.y1 - R.y0, cy = (R.y0 + R.y1) / 2, cx = (R.x0 + R.x1) / 2;
        line(wide ? [[R.x0, cy], [R.x1, cy]] : [[cx, R.y0], [cx, R.y1]], fine, [12, 3, 3, 3]);
        if (r.chance(0.5)) text(r.pick(["VAULTED CLG", "VAULT", "CATHEDRAL CLG"]), wide ? [cx, cy - 10] : [cx + 14, cy], 4.5);
      }
    }
  // Floor finishes: tile grids in wet rooms, wood planks in living rooms — edge to edge, touching the walls.
  if (E.floor) {
    const plank = r.pick([3, 4, 5, 6]), tile = r.pick([12, 12, 18, 24]), staggered = r.chance(0.6);
    for (const { rm, R } of roomRects) {
      const wet = ["bath", "mbath", "half", "laundry"].includes(rm.type);
      if (wet && r.chance(0.8)) {
        for (let x = R.x0 + tile; x < R.x1 - 1; x += tile) line([[x, R.y0], [x, R.y1]], fine * 0.7);
        for (let y = R.y0 + tile; y < R.y1 - 1; y += tile) line([[R.x0, y], [R.x1, y]], fine * 0.7);
      } else if (["great", "bed", "master", "flex"].includes(rm.type) && r.chance(0.5)) {
        const along = R.x1 - R.x0 >= R.y1 - R.y0;
        const [a0, a1, b0, b1] = along ? [R.x0, R.x1, R.y0, R.y1] : [R.y0, R.y1, R.x0, R.x1];
        const P = (a: number, b: number): Pt => (along ? [a, b] : [b, a]);
        for (let b = b0 + plank, k = 0; b < b1 - 0.5; b += plank, k++) {
          line([P(a0, b), P(a1, b)], fine * 0.6);
          if (staggered) for (let a = a0 + ((k * 17) % 48) + 24; a < a1 - 6; a += 48 + ((k * 7) % 24)) line([P(a, b - plank), P(a, b)], fine * 0.6);
        }
      }
    }
  }
  // Furniture: beds with pillows, nightstands, a sofa, a dining table with chairs.
  if (E.furn) {
    for (const { rm, q, R } of roomRects) {
      if (rm.type === "bed" || rm.type === "master") {
        const bw = rm.type === "master" ? r.pick([60, 76]) : r.pick([39, 54, 60]);
        const bed = (fr: Frame, s0: number) => {
          rectF(fr, s0, 0, s0 + bw, 80);
          const pw = bw > 45 ? bw / 2 - 4 : bw - 6;
          for (let k = 0; k < (bw > 45 ? 2 : 1); k++) rectF(fr, s0 + 3 + k * (pw + 2), 3, s0 + 3 + k * (pw + 2) + pw, 15, fine);
          line([fr.f(s0, r.pick([20, 24, 26])), fr.f(s0 + bw, r.pick([20, 24, 26]))], fine);
          if (r.chance(0.5)) line([fr.f(s0, 26), fr.f(s0 + bw * 0.3, 40)], fine);
        };
        place(rm, q, R, { len: bw, depth: 80, draw: bed, where: "center" });
        if (r.chance(0.6)) for (let k = 0; k < 2; k++) place(rm, q, R, { len: 20, depth: 18, draw: (fr, s0) => rectF(fr, s0, 0, s0 + 20, 18) });
        if (r.chance(0.4)) place(rm, q, R, { len: r.pick([48, 60]), depth: 20, draw: (fr, s0) => rectF(fr, s0, 0, s0 + 60, 20) });
      }
    }
    const great2 = rooms.find((q) => q.type === "great");
    const lz2 = great2?.zones.find((z) => z.role === "living"), dz = great2?.zones.find((z) => z.role === "dining");
    if (lz2) {
      const Z = lz2.rect, cx = (Z.x0 + Z.x1) / 2, cy = (Z.y0 + Z.y1) / 2, sl = Math.min(84, Z.x1 - Z.x0 - 30);
      if (sl > 50 && Z.y1 - Z.y0 > 100) {
        line([[cx - sl / 2, cy + 30], [cx + sl / 2, cy + 30], [cx + sl / 2, cy + 66], [cx - sl / 2, cy + 66]], thin, undefined, true);
        line([[cx - sl / 2, cy + 56], [cx + sl / 2, cy + 56]], fine);
        for (let k = 1; k < 3; k++) line([[cx - sl / 2 + (k * sl) / 3, cy + 30], [cx - sl / 2 + (k * sl) / 3, cy + 56]], fine);
        line([[cx - 24, cy - 12], [cx + 24, cy - 12], [cx + 24, cy + 12], [cx - 24, cy + 12]], fine, undefined, true);
        if (r.chance(0.5)) line([[cx - sl / 2 - 6, cy - 30], [cx + sl / 2 + 6, cy - 30], [cx + sl / 2 + 6, cy + 72], [cx - sl / 2 - 6, cy + 72]], fine, [3, 2], true);
      }
    }
    if (dz) {
      const Z = dz.rect, cx = (Z.x0 + Z.x1) / 2, cy = (Z.y0 + Z.y1) / 2;
      const tw = Math.min(72, Z.x1 - Z.x0 - 60), th = Math.min(40, Z.y1 - Z.y0 - 60);
      if (tw > 30 && th > 30) {
        if (r.chance(0.3)) curve(ellipse([cx, cy], [tw / 2, 0], [0, th / 2]));
        else line([[cx - tw / 2, cy - th / 2], [cx + tw / 2, cy - th / 2], [cx + tw / 2, cy + th / 2], [cx - tw / 2, cy + th / 2]], thin, undefined, true);
        for (let k = 0; k < Math.max(1, Math.floor(tw / 26)); k++) {
          const x = cx - tw / 2 + 13 + k * 26;
          for (const sgn of [-1, 1]) { const y = cy + sgn * (th / 2 + 4); line([[x - 8, y], [x + 8, y], [x + 8, y + sgn * 16], [x - 8, y + sgn * 16]], fine, undefined, true); }
        }
      }
    }
  }
  // Room tags with the area, in a box (Revit "Room Tag with Area").
  if (E.tags)
    for (const { rm, R } of roomRects) {
      if (R.x1 - R.x0 < 72 || R.y1 - R.y0 < 72 || !r.chance(0.8)) continue;
      const sf = Math.round(rm.rects.reduce((s2, q2) => s2 + (q2.x1 - q2.x0) * (q2.y1 - q2.y0), 0) / 144);
      const t = r.pick([`${sf} SF`, `${sf} SQ FT`, `${sf} S.F.`]), cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2 + inIn(12);
      text(t, [cx, cy], 4.5);
      if (r.chance(0.5)) { const hw = inIn(t.length * 1.6 + 6), hh = inIn(5); line([[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]], fine, undefined, true); }
    }
  // Marks across the plan: a section cut line with its bubbles, a revision cloud, a north arrow.
  if (E.marks) {
    const all2 = g.walls.flat().flat();
    const B = { x0: Math.min(...all2.map((p) => p[0])), x1: Math.max(...all2.map((p) => p[0])), y0: Math.min(...all2.map((p) => p[1])), y1: Math.max(...all2.map((p) => p[1])) };
    if (r.chance(0.7)) {
      const horiz = r.chance(0.5), f2 = 0.25 + 0.5 * r.f();
      const cc = horiz ? B.y0 + f2 * (B.y1 - B.y0) : B.x0 + f2 * (B.x1 - B.x0);
      const [a, b] = horiz ? [B.x0 - 30, B.x1 + 30] : [B.y0 - 30, B.y1 + 30];
      const P = (s2: number, d: number): Pt => (horiz ? [s2, d] : [d, s2]);
      line([P(a, cc), P(b, cc)], thin * 2, r.chance(0.5) ? [18, 4, 3, 4] : undefined);
      const rb = inIn(r.pick([12, 14, 18]));
      for (const e of [a - rb, b + rb]) {
        curve(circle(P(e, cc), rb), thin);
        out.push({ k: "fill", rings: [[P(e - rb * 0.7, cc), P(e + rb * 0.7, cc), P(e, cc + rb * 1.6), P(e - rb * 0.7, cc)]], gray: 0 });
        text(r.pick(["A", "1", "B"]), P(e, cc - rb * 0.45), 6);
      }
    }
    if (r.chance(0.4)) {
      const w = r.int(60, 140), h = r.int(50, 110), x0 = B.x0 + r.f() * (B.x1 - B.x0 - w), y0 = B.y0 + r.f() * (B.y1 - B.y0 - h), bump = r.pick([6, 8, 10]);
      const ring: Pt[] = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
      const arcs: Arc[] = [];
      for (let i = 0; i < 4; i++) {
        const p = ring[i], qn = ring[(i + 1) % 4], L2 = Math.hypot(qn[0] - p[0], qn[1] - p[1]), u: Pt = [(qn[0] - p[0]) / L2, (qn[1] - p[1]) / L2], nn: Pt = [u[1], -u[0]];
        const nb = Math.max(1, Math.round(L2 / (2 * bump))), st = L2 / nb;
        for (let k = 0; k < nb; k++) {
          const s2 = add(p, mul(u, k * st)), e2 = add(p, mul(u, (k + 1) * st)), hgt = (st / 2) * 1.33;
          arcs.push([s2, add(s2, mul(nn, hgt)), add(e2, mul(nn, hgt)), e2]);
        }
      }
      curve(arcs, thin);
      if (r.chance(0.7)) { const tp: Pt = [x0 + w + 6, y0 - 6]; line([tp, add(tp, [12, 0]), add(tp, [6, -10])], fine, undefined, true); }
    }
    if (r.chance(0.6)) {
      const at2: Pt = [B.x1 + 50, B.y1 + 40], rn = inIn(18);
      curve(circle(at2, rn), fine);
      out.push({ k: "fill", rings: [[[at2[0], at2[1] - rn], [at2[0] + rn * 0.4, at2[1] + rn * 0.6], [at2[0], at2[1] + rn * 0.3], [at2[0], at2[1] - rn]]], gray: 0 });
      line([[at2[0], at2[1] - rn], [at2[0] - rn * 0.4, at2[1] + rn * 0.6], [at2[0], at2[1] + rn * 0.3]], fine);
      text("N", [at2[0], at2[1] - rn * 1.5], 7);
    }
  }

  // ---- porch slabs: speckled concrete ----
  if (c.stipple)
    for (const p of g.key.porches) {
      const xs = p.outline.map((q) => q[0]), ys = p.outline.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const n = Math.round(((x1 - x0) * (y1 - y0)) / 60);
      for (let i = 0; i < n; i++) {
        const x = x0 + 2 + r.f() * (x1 - x0 - 4), y = y0 + 2 + r.f() * (y1 - y0 - 4), a = r.f() * Math.PI;
        if (r.chance(0.15)) line([[x, y], [x + 2, y + 0.5], [x + 0.8, y + 2]], fine, undefined, true);
        else line([[x, y], [x + Math.cos(a) * 0.8, y + Math.sin(a) * 0.8]], fine);
      }
    }
  return out;
}

const boxOf = (q: Rect): Pt[][] => [[[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1], [q.x0, q.y0]]];
const extUnion = (rs: Rect[]) => pc.union(boxOf(rs[0]), ...rs.slice(1).map(boxOf));

/** Which side of a room's rectangle a wall is on. */
function sideOf(q: Run, R: Rect): Side {
  if (q.horiz) return Math.abs(q.a[1] - R.y0) < Math.abs(q.a[1] - R.y1) ? "N" : "S";
  return Math.abs(q.a[0] - R.x0) < Math.abs(q.a[0] - R.x1) ? "W" : "E";
}
