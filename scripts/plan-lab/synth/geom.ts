/**
 * The made-up house → its lines (what the PDF draws) and its answer key (true walls, rooms, porches), still in
 * the house's inches. Walls are drawn as one outline: every wall a rectangle its drawn thickness wide, all of them
 * joined, door and window openings cut out — so corners and tees come out clean, like CAD.
 */
import pc from "polygon-clipping";
import type { Rng } from "./rng";
import { OUT, type Layout, type Pt, type Rect, type Run } from "./layout";

type Ring = Pt[];
type Poly = Ring[];
type Multi = Poly[];
const box = (q: Rect): Poly => [[[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1], [q.x0, q.y0]]];
const grow = (q: Rect, d: number): Rect => ({ x0: q.x0 - d, y0: q.y0 - d, x1: q.x1 + d, y1: q.y1 + d });
export const ringArea = (r: Ring) => {
  let s = 0;
  for (let i = 0; i + 1 < r.length; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return s / 2;
};

/** A cubic Bézier quarter circle (how CAD PDFs draw door swings): start, two handles, end. */
export type Arc = [Pt, Pt, Pt, Pt];
export type Style = {
  wallW: number; // line weights, points
  thinW: number;
  leafAsBox: boolean;
  glass: number[]; // window glass lines, inches off the wall's center line
  skin: number; // siding line this far outside the outside walls (0: none)
  brick: number; // brick veneer this thick outside the outside walls, past a 1" air gap (0: none)
  garageTrack: boolean;
  /** How windows are drawn past the plain faces + glass: a sill sticking out, a frame inside the faces. */
  sill: boolean;
  winFrame: boolean;
  /** Garage door: two panel lines, one dashed line, or nothing across the opening. */
  garageDoor: "panel" | "dashed" | "none";
  /** Window trim/casing: lines just outside both faces, past the opening's ends (a 2x4 at a window reads fatter). */
  winTrim: boolean;
  /** Cased openings' header: dashed lines across at both faces, one line in the middle, or nothing. */
  header: "dashed" | "one" | "none";
  /** The porch's outer edge as a beam: two lines a beam's depth apart, post to post (0: one line). */
  porchBeam: number;
  /** A roof overhang line around the house, this far outside it (0: none), dashed or not. */
  overhang: number;
  overhangDash: boolean;
};
export type Geom = {
  /** The walls as drawn (openings cut out), and the brick veneer's band. */
  walls: Multi;
  /** Each wall's own rectangle (same order as the layout's runs). */
  runRects: Rect[];
  /** The 45° outside walls' bands and joints (hatched/filled with the other outside walls). */
  extDiag: Multi;
  brickBand: Multi;
  brick: Pt[][];
  wallRings: Ring[];
  windowLines: Pt[][];
  leaves: Pt[][];
  arcs: Arc[];
  garageLines: Pt[][];
  dashed: Pt[][];
  skin: Pt[][];
  porchLines: Pt[][];
  posts: Ring[];
  /** The roof overhang outline (dashed per the style), outside the walls. */
  overhang: Pt[][];
  labels: { text: string; at: Pt; small: boolean; rect: Rect; dims: boolean }[];
  key: {
    walls: { a: Pt; b: Pt; kind: "ext" | "int"; size: string; t: number; sides: [number, number] }[];
    rooms: { id: number; ids: number[]; name: string; type: string; outline: Ring }[];
    /** Stairs (and their landings) up to the railing: left out of every room (the user's rule). Filled by clutter. */
    stairs: Ring[];
    porches: { name: string; outline: Ring }[];
    doors: { a: Pt; b: Pt; type: string; into: number; width: number; hinge?: Pt }[];
    windows: { a: Pt; b: Pt; width: number }[];
  };
};

export function makeStyle(r: Rng): Style {
  const brick = r.chance(0.25) ? r.pick([3.5, 4]) : 0;
  return {
    wallW: r.pick([0.5, 0.7, 0.9, 1.2]),
    thinW: r.pick([0.18, 0.25, 0.35]),
    leafAsBox: r.chance(0.5),
    glass: r.pick([[0], [-0.75, 0.75], [-1, 0, 1], [0]]),
    skin: !brick && r.chance(0.55) ? r.pick([0.75, 1, 1.5]) : 0,
    brick,
    garageTrack: r.chance(0.5),
    sill: r.chance(0.5),
    winFrame: r.chance(0.35),
    garageDoor: r.pick(["panel", "panel", "dashed", "none"] as const),
    winTrim: r.chance(0.4),
    header: r.pick(["dashed", "dashed", "one", "none"] as const),
    porchBeam: r.chance(0.55) ? r.pick([3.5, 5.5, 5.5, 7.25, 11.25]) : 0,
    overhang: r.chance(0.45) ? r.pick([12, 18, 24]) : 0,
    overhangDash: r.chance(0.7),
  };
}

export function geometry(L: Layout, st: Style): Geom {
  const { runs, rooms, openings } = L;
  const at = (p: Pt) => runs.filter((q) => (q.a[0] === p[0] && q.a[1] === p[1]) || (q.b[0] === p[0] && q.b[1] === p[1]));
  const ext = (q: Run, p: Pt) => {
    const others = at(p).filter((o) => o.id !== q.id);
    return others.length ? Math.max(q.t / 2, ...others.map((o) => o.t / 2)) : 0;
  };
  const wallRect = (q: Run): Rect => {
    const e0 = ext(q, q.a), e1 = ext(q, q.b);
    return q.horiz
      ? { x0: q.a[0] - e0, x1: q.b[0] + e1, y0: q.a[1] - q.t / 2, y1: q.a[1] + q.t / 2 }
      : { x0: q.a[0] - q.t / 2, x1: q.a[0] + q.t / 2, y0: q.a[1] - e0, y1: q.b[1] + e1 };
  };
  const rects = runs.map(wallRect);
  // 45° walls: their own band, plus a mitred joint where each meets a shortened neighbor.
  const diagPolys: Poly[] = [], extDiag: Multi = [];
  const unit = (p: Pt, q: Pt): Pt => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  const plus = (p: Pt, v: Pt, k: number): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];
  for (const d of L.diags) {
    const u = unit(d.a, d.b), n: Pt = [-u[1], u[0]], h = d.t / 2;
    diagPolys.push([[plus(d.a, n, h), plus(d.b, n, h), plus(d.b, n, -h), plus(d.a, n, -h), plus(d.a, n, h)]]);
    if (d.kind === "ext") extDiag.push(diagPolys[diagPolys.length - 1]);
    for (const [P, toward] of [[d.a, d.b], [d.b, d.a]] as [Pt, Pt][]) {
      // The neighbor wall ending at P runs away from the corner C (d.tri[0]); its normal is across it.
      const C = d.tri[0];
      const along: Pt = unit(C, P), nr: Pt = [-along[1], along[0]];
      const m1 = unit([0, 0], [nr[0] + n[0], nr[1] + n[1]]), m2 = unit([0, 0], [nr[0] - n[0], nr[1] - n[1]]);
      const k = h / Math.cos((22.5 * Math.PI) / 180);
      const ptsJ = [plus(P, nr, h), plus(P, nr, -h), plus(P, n, h), plus(P, n, -h), plus(P, m1, k), plus(P, m1, -k), plus(P, m2, k), plus(P, m2, -k)];
      // (Only the points on the two walls' faces or their crossing: the convex hull of what lies within both bands' reach.)
      const inBand = (q: Pt) => {
        const dn = (q[0] - P[0]) * n[0] + (q[1] - P[1]) * n[1], dr = (q[0] - P[0]) * nr[0] + (q[1] - P[1]) * nr[1];
        return Math.abs(dn) <= h + 0.01 && Math.abs(dr) <= h + 0.01;
      };
      diagPolys.push([hull(ptsJ.filter(inBand))]);
      if (d.kind === "ext") extDiag.push(diagPolys[diagPolys.length - 1]);
      void toward;
    }
  }
  const solid = pc.union(box(rects[0]), ...rects.slice(1).map(box), ...diagPolys) as Multi;
  // Point at distance s along a wall, `off` toward its b-side (its second room).
  const pt = (q: Run, s: number, off: number): Pt => (q.horiz ? [q.a[0] + s, q.a[1] + off] : [q.a[0] + off, q.a[1] + s]);
  const cut = (q: Run, s0: number, s1: number, d: number): Rect => {
    const [p, r2] = [pt(q, s0, -d), pt(q, s1, d)];
    return { x0: Math.min(p[0], r2[0]), y0: Math.min(p[1], r2[1]), x1: Math.max(p[0], r2[0]), y1: Math.max(p[1], r2[1]) };
  };
  const holes = openings.map((o) => box(cut(runs[o.run], o.s0, o.s1, runs[o.run].t / 2 + 0.5)));
  for (const d of L.diags) {
    const gap = d.door ?? d.win;
    if (!gap) continue;
    const u = unit(d.a, d.b), n: Pt = [-u[1], u[0]], h = d.t / 2 + 0.5;
    const p0 = plus(d.a, u, gap.s0), p1 = plus(d.a, u, gap.s1);
    holes.push([[plus(p0, n, h), plus(p1, n, h), plus(p1, n, -h), plus(p0, n, -h), plus(p0, n, h)]]);
  }
  const walls = (holes.length ? pc.difference(solid, ...holes) : solid) as Multi;
  const wallRings = walls.flat();

  const windowLines: Pt[][] = [], leaves: Pt[][] = [], arcs: Arc[] = [], garageLines: Pt[][] = [], dashed: Pt[][] = [];
  const K = 0.5523;
  const key: Geom["key"] = { walls: [], rooms: [], porches: [], doors: [], windows: [], stairs: [] };
  for (const o of openings) {
    const q = runs[o.run], w = o.s1 - o.s0;
    if (o.type === "window") {
      // The wall's faces run across, with the glass between.
      for (const off of [-q.t / 2, q.t / 2, ...st.glass]) windowLines.push([pt(q, o.s0, off), pt(q, o.s1, off)]);
      // The sill: a line past the outside face, wider than the opening, with its ends turned back.
      if (st.sill && q.sides.includes(OUT)) {
        const out = q.sides[0] === OUT ? -1 : 1, so = out * (q.t / 2 + 1.5);
        windowLines.push([pt(q, o.s0 - 2, out * (q.t / 2)), pt(q, o.s0 - 2, so), pt(q, o.s1 + 2, so), pt(q, o.s1 + 2, out * (q.t / 2))]);
      }
      // A frame: jamb lines across and a line ½"–1" inside each face.
      if (st.winFrame) {
        for (const off of [-q.t / 2 + 0.75, q.t / 2 - 0.75]) windowLines.push([pt(q, o.s0, off), pt(q, o.s1, off)]);
        for (const s2 of [o.s0 + 1.5, o.s1 - 1.5]) windowLines.push([pt(q, s2, -q.t / 2), pt(q, s2, q.t / 2)]);
        // Twin (mulled) windows: a mullion across the middle.
        if (w >= 60) for (const s2 of [(o.s0 + o.s1) / 2 - 1, (o.s0 + o.s1) / 2 + 1]) windowLines.push([pt(q, s2, -q.t / 2), pt(q, s2, q.t / 2)]);
      }
      // Trim: casing inside, trim outside — a line ¾"–1" off each face, a few inches past each side.
      if (st.winTrim) for (const sg of [-1, 1]) windowLines.push([pt(q, o.s0 - 3, sg * (q.t / 2 + 0.875)), pt(q, o.s1 + 3, sg * (q.t / 2 + 0.875))], [pt(q, o.s0 - 3, sg * (q.t / 2)), pt(q, o.s0 - 3, sg * (q.t / 2 + 0.875))], [pt(q, o.s1 + 3, sg * (q.t / 2)), pt(q, o.s1 + 3, sg * (q.t / 2 + 0.875))]);
      key.windows.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), width: w });
    } else if (o.type === "door" && o.cased) {
      // A cased opening: no door, its header shown dashed across (at both faces, or one line), or nothing.
      if (st.header === "dashed") dashed.push([pt(q, o.s0, -q.t / 2), pt(q, o.s1, -q.t / 2)], [pt(q, o.s0, q.t / 2), pt(q, o.s1, q.t / 2)]);
      else if (st.header === "one") dashed.push([pt(q, o.s0, 0), pt(q, o.s1, 0)]);
      key.doors.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), type: "cased", into: o.into ?? OUT, width: w });
    } else if (o.type === "door" && o.bifold) {
      // Bifold: each half folds into a V on the room side.
      const side = o.into === q.sides[1] ? 1 : -1;
      const pl = w / 4, a = (40 * Math.PI) / 180;
      for (const [s, dir] of [[o.s0, 1], [o.s1, -1]] as const) {
        const f = (sAt: number, d: number) => pt(q, sAt, (side * q.t) / 2 + side * d);
        leaves.push([f(s, 0), f(s + dir * pl * Math.cos(a), pl * Math.sin(a)), f(s + dir * 2 * pl * Math.cos(a), 0)]);
      }
      key.doors.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), type: "bifold", into: o.into ?? OUT, width: w });
    } else if (o.type === "door" && o.style === "pocket") {
      // Pocket door: the slab drawn in the wall's cavity, partly pulled out across the opening (sometimes dashed in the wall).
      // (Fully open it would fill the wall beside the opening; here it sticks out `out` into the opening.)
      const sl = o.slide ?? 1, out = w * (st.leafAsBox ? 0.25 : 0.4), th = 0.75;
      const a0 = sl > 0 ? o.s1 - out : o.s0 + out, a1 = sl > 0 ? a0 + w : a0 - w;
      leaves.push([pt(q, a0, -th), pt(q, a1, -th), pt(q, a1, th), pt(q, a0, th), pt(q, a0, -th)]);
      key.doors.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), type: "pocket", into: o.into ?? OUT, width: w });
    } else if (o.type === "door" && o.style === "barn") {
      // Barn door: a slab on the room side's face, wider than the opening, slid partly open; its track dashed above.
      const side = o.into === q.sides[1] ? 1 : -1, sl = o.slide ?? 1, shift = w * (0.2 + 0.6 * ((o.s0 * 7) % 10) / 10);
      const f0 = q.t / 2 + 0.5, f1 = q.t / 2 + 2;
      const a0 = o.s0 - 2 + sl * shift, a1 = o.s1 + 2 + sl * shift;
      leaves.push([pt(q, a0, side * f0), pt(q, a1, side * f0), pt(q, a1, side * f1), pt(q, a0, side * f1), pt(q, a0, side * f0)]);
      dashed.push([pt(q, Math.min(o.s0, o.s0 + sl * (w + 4)) - 2, side * (f1 + 1)), pt(q, Math.max(o.s1, o.s1 + sl * (w + 4)) + 2, side * (f1 + 1))]);
      key.doors.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), type: "barn", into: o.into ?? OUT, width: w });
    } else if (o.type === "door" && o.style === "double") {
      // A pair of doors: two leaves, hinged at each jamb, swinging the same way, meeting in the middle.
      const side = o.into === q.sides[1] ? 1 : -1;
      const n: Pt = q.horiz ? [0, side] : [side, 0];
      const hw = w / 2;
      for (const [hs, dir] of [[o.s0, 1], [o.s1, -1]] as const) {
        const H = pt(q, hs, (side * q.t) / 2);
        const along: Pt = q.horiz ? [dir, 0] : [0, dir];
        const tip: Pt = [H[0] + n[0] * hw, H[1] + n[1] * hw], end: Pt = [H[0] + along[0] * hw, H[1] + along[1] * hw];
        if (st.leafAsBox) leaves.push([H, tip, [tip[0] + along[0] * 1.5, tip[1] + along[1] * 1.5], [H[0] + along[0] * 1.5, H[1] + along[1] * 1.5], H]);
        else leaves.push([H, tip]);
        arcs.push([tip, [tip[0] + K * hw * along[0], tip[1] + K * hw * along[1]], [end[0] + K * hw * n[0], end[1] + K * hw * n[1]], end]);
      }
      key.doors.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), type: "double", into: o.into ?? OUT, width: w });
    } else if (o.type === "door") {
      // Hinge at one jamb on the side it swings into; the leaf drawn open, the swing back to the other jamb.
      const side = o.into === q.sides[1] ? 1 : -1;
      const n: Pt = q.horiz ? [0, side] : [side, 0];
      const [hs, os] = o.hingeAtS0 ? [o.s0, o.s1] : [o.s1, o.s0];
      const H = pt(q, hs, (side * q.t) / 2);
      const along: Pt = q.horiz ? [Math.sign(os - hs), 0] : [0, Math.sign(os - hs)];
      const tip: Pt = [H[0] + n[0] * w, H[1] + n[1] * w];
      const end: Pt = [H[0] + along[0] * w, H[1] + along[1] * w];
      if (st.leafAsBox) {
        const th = 1.5;
        leaves.push([H, tip, [tip[0] + along[0] * th, tip[1] + along[1] * th], [H[0] + along[0] * th, H[1] + along[1] * th], H]);
      } else leaves.push([H, tip]);
      arcs.push([tip, [tip[0] + K * w * along[0], tip[1] + K * w * along[1]], [end[0] + K * w * n[0], end[1] + K * w * n[1]], end]);
      key.doors.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), type: "door", into: o.into ?? OUT, width: w, hinge: H });
    } else {
      // Overhead garage door: the door's panel in the wall, its track dashed into the garage.
      const g = q.sides[0] === OUT ? 1 : -1;
      if (st.garageDoor === "panel") garageLines.push([pt(q, o.s0, (g * q.t) / 2 - g * 1), pt(q, o.s1, (g * q.t) / 2 - g * 1)], [pt(q, o.s0, (g * q.t) / 2 - g * 2.5), pt(q, o.s1, (g * q.t) / 2 - g * 2.5)]);
      else if (st.garageDoor === "dashed") dashed.push([pt(q, o.s0, 0), pt(q, o.s1, 0)]);
      if (st.garageTrack) dashed.push([pt(q, o.s0, (g * q.t) / 2), pt(q, o.s0, g * 96)], [pt(q, o.s0, g * 96), pt(q, o.s1, g * 96)], [pt(q, o.s1, g * 96), pt(q, o.s1, (g * q.t) / 2)]);
      key.doors.push({ a: pt(q, o.s0, 0), b: pt(q, o.s1, 0), type: "garage", into: q.sides[0] === OUT ? q.sides[1] : q.sides[0], width: w });
    }
  }
  for (const q of runs) key.walls.push({ a: q.a, b: q.b, kind: q.kind, size: q.size, t: q.t, sides: q.sides });
  // 45° walls and their doors (the same swing as any door, turned).
  for (const d of L.diags) {
    key.walls.push({ a: d.a, b: d.b, kind: d.kind, size: d.size, t: d.t, sides: d.sides });
    if (d.win) {
      const u = unit(d.a, d.b), n: Pt = [-u[1], u[0]], p0 = plus(d.a, u, d.win.s0), p1 = plus(d.a, u, d.win.s1);
      for (const off of [-d.t / 2, d.t / 2, ...st.glass]) windowLines.push([plus(p0, n, off), plus(p1, n, off)]);
      key.windows.push({ a: p0, b: p1, width: d.win.s1 - d.win.s0 });
    }
    if (!d.door) continue;
    const u = unit(d.a, d.b), w = d.door.s1 - d.door.s0;
    // The normal toward the room it swings into: toward the corner C for the small room, away for the other.
    const C = d.tri[0], mid = plus(d.a, u, (d.door.s0 + d.door.s1) / 2);
    let n: Pt = [-u[1], u[0]];
    const towardC = (C[0] - mid[0]) * n[0] + (C[1] - mid[1]) * n[1] > 0;
    if (towardC !== (d.door.into !== d.sides[0])) n = [-n[0], -n[1]];
    const [hs, os] = d.door.hingeAtS0 ? [d.door.s0, d.door.s1] : [d.door.s1, d.door.s0];
    const H = plus(plus(d.a, u, hs), n, d.t / 2);
    const along: Pt = [u[0] * Math.sign(os - hs), u[1] * Math.sign(os - hs)];
    const tip = plus(H, n, w), end = plus(H, along, w);
    if (st.leafAsBox) leaves.push([H, tip, plus(tip, along, 1.5), plus(H, along, 1.5), H]);
    else leaves.push([H, tip]);
    arcs.push([tip, plus(tip, along, K * w), plus(end, n, K * w), end]);
    key.doors.push({ a: plus(d.a, u, d.door.s0), b: plus(d.a, u, d.door.s1), type: "door", into: d.door.into, width: w, hinge: H });
  }

  // Rooms: each room's floor, to the inside faces of its walls (doors closed off at the wall's face).
  const floors = new Map<number, Poly>();
  for (const rm of rooms) {
    if (!rm.rects.length) continue;
    let u = pc.union(box(rm.rects[0]), ...rm.rects.slice(1).map(box)) as Multi;
    // A 45° corner: the small room gives the corner to the room beside it.
    for (const d of L.diags) {
      const tri: Poly = [[...d.tri, d.tri[0]]];
      if (d.sides[0] === rm.id) u = pc.difference(u, tri) as Multi; // (an outside corner: the yard gets it)
      else if (d.sides[1] === rm.id) u = pc.union(u, tri) as Multi;
    }
    const floor = pc.difference(u, solid) as Multi;
    const big = floor.sort((p, q) => Math.abs(ringArea(q[0])) - Math.abs(ringArea(p[0])))[0];
    if (big) floors.set(rm.id, big);
  }
  // Openings between two rooms (any door, a cased opening, or nothing drawn): each room runs to the MIDDLE of the
  // opening — half the strip through the wall each, nothing lost under the door, nothing counted twice. Solid wall
  // stays at the face. Rooms stay separate either way (the user's rule, 2026-11-22: walls to the face, openings split
  // down the middle; open areas split too). Doors to the outside stop at the face.
  const half = new Map<number, Poly[]>();
  const give = (id: number, p: Poly) => half.set(id, [...(half.get(id) ?? []), p]);
  for (const o of openings) {
    if (o.type !== "door") continue;
    const q = runs[o.run], [a, b] = q.sides;
    if (a === OUT || b === OUT || !floors.has(a) || !floors.has(b)) continue;
    const [p, r2, m0, m1] = [pt(q, o.s0, -q.t / 2 - 0.01), pt(q, o.s1, 0), pt(q, o.s0, 0), pt(q, o.s1, q.t / 2 + 0.01)];
    give(a, box({ x0: Math.min(p[0], r2[0]), y0: Math.min(p[1], r2[1]), x1: Math.max(p[0], r2[0]), y1: Math.max(p[1], r2[1]) }));
    give(b, box({ x0: Math.min(m0[0], m1[0]), y0: Math.min(m0[1], m1[1]), x1: Math.max(m0[0], m1[0]), y1: Math.max(m0[1], m1[1]) }));
  }
  for (const d of L.diags) {
    if (!d.door) continue;
    const [a, b] = d.sides;
    if (a === OUT || b === OUT || !floors.has(a) || !floors.has(b)) continue;
    const u = unit(d.a, d.b), n: Pt = [-u[1], u[0]], h = d.t / 2 + 0.01;
    const p0 = plus(d.a, u, d.door.s0), p1 = plus(d.a, u, d.door.s1);
    const sideOf = (k: number): Poly => (k > 0 ? [[p0, p1, plus(p1, n, h), plus(p0, n, h), p0]] : [[p0, plus(p0, n, -h), plus(p1, n, -h), p1, p0]]);
    // (which face is whose: the room whose floor sits just past that face)
    const probe = plus(plus(p0, u, (d.door.s1 - d.door.s0) / 2), n, h + 3);
    const aPlus = pc.intersection(floors.get(a)!, [[plus(probe, u, -1), plus(probe, u, 1), plus(plus(probe, u, 1), n, 1), plus(plus(probe, u, -1), n, 1), plus(probe, u, -1)]]).length > 0;
    give(a, sideOf(aPlus ? 1 : -1)); give(b, sideOf(aPlus ? -1 : 1));
  }
  for (const rm of rooms) {
    const f = floors.get(rm.id);
    if (!f) continue;
    const add = half.get(rm.id) ?? [];
    let u = (add.length ? pc.union(f, ...add) : [f]) as Multi;
    u = u.sort((p, q) => Math.abs(ringArea(q[0])) - Math.abs(ringArea(p[0])));
    key.rooms.push({ id: rm.id, ids: [rm.id], name: rm.name, type: rm.type, outline: u[0][0] });
  }

  // Porches: a slab from the outside face of the wall, its edge drawn, posts at the corners.
  const porchLines: Pt[][] = [], posts: Ring[] = [];
  const labels: Geom["labels"] = [];
  const extT = Math.max(...runs.filter((q) => q.kind === "ext").map((q) => q.t));
  for (const p of L.porches) {
    const y0 = p.wallY + (p.dir * extT) / 2, y1 = p.wallY + p.dir * p.depth;
    // (Set into the house: its sides start where the house's front runs on, past the little walls.)
    const ys = p.inset ? p.wallY + p.dir * (p.inset + extT / 2) : y0;
    if (Math.abs(y1 - ys) > 1) porchLines.push([[p.x0, ys], [p.x0, y1], [p.x1, y1], [p.x1, ys]]);
    // A beam along its outer edge, post to post: a second line a beam's depth inside the edge.
    if (st.porchBeam) porchLines.push([[p.x0, y1 - p.dir * st.porchBeam], [p.x1, y1 - p.dir * st.porchBeam]]);
    const ps = 6, ins = 3;
    const px = [p.x0 + ins, p.x1 - ins - ps];
    if (p.x1 - p.x0 > 16 * 12) px.push((p.x0 + p.x1) / 2 - ps / 2);
    for (const x of px) {
      const yy = p.dir > 0 ? y1 - ins - ps : y1 + ins;
      posts.push([[x, yy], [x + ps, yy], [x + ps, yy + ps], [x, yy + ps], [x, yy]]);
    }
    const r: Rect = { x0: p.x0, x1: p.x1, y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
    key.porches.push({ name: p.name, outline: [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1], [r.x0, r.y0]] });
    labels.push({ text: p.name, at: [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2], small: false, rect: r, dims: true });
  }

  // Siding/sheathing: a line just outside the outside walls, broken at doors.
  const skin: Pt[][] = [];
  if (st.skin > 0) {
    const all = [...rooms.flatMap((rm) => rm.rects.map(box)), ...rects.map((q) => box(grow(q, st.skin)))];
    const u = pc.union(all[0], ...all.slice(1)) as Multi;
    const outer = u.map((p) => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
    const doorCuts = openings.filter((o) => o.type !== "window").map((o) => grow(cut(runs[o.run], o.s0, o.s1, runs[o.run].t / 2 + st.skin + 1), 0));
    for (let i = 0; i + 1 < outer.length; i++) skin.push(...clipOut([outer[i], outer[i + 1]], doorCuts));
  }

  // Roof overhang: the house's outline pushed out 12"–24", over the porches too (dashed, mostly).
  const overhang: Pt[][] = [];
  if (st.overhang > 0) {
    const all = [...rooms.flatMap((rm) => rm.rects.map(box)), ...rects.map((q) => box(grow(q, st.overhang))), ...diagPolys];
    const u = pc.difference(pc.union(all[0], ...all.slice(1)) as Multi, ...L.diags.filter((d) => d.kind === "ext").map((d) => [[...d.tri, d.tri[0]]] as Poly)) as Multi;
    const outer = u.map((p) => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
    if (outer) overhang.push(outer);
  }

  // Brick veneer: a band past a 1" air gap, broken at doors.
  const brick: Pt[][] = [];
  let brickBand: Multi = [];
  if (st.brick > 0) {
    const ring = (d: number) => {
      const all = [...rooms.flatMap((rm) => rm.rects.map(box)), ...rects.map((q) => box(grow(q, d)))];
      return pc.union(all[0], ...all.slice(1)) as Multi;
    };
    const inner = ring(1), outer = ring(1 + st.brick);
    const doorCuts = openings.filter((o) => o.type !== "window").map((o) => cut(runs[o.run], o.s0, o.s1, runs[o.run].t / 2 + 1 + st.brick + 1));
    // (Its outline: both faces of the brick, and its ends at the doors.)
    brickBand = pc.difference(outer, inner, ...doorCuts.map(box)) as Multi;
    brick.push(...brickBand.flat());
  }

  for (const rm of rooms) for (const z of rm.zones) if (z.text) labels.push({ text: z.text, at: [(z.rect.x0 + z.rect.x1) / 2, (z.rect.y0 + z.rect.y1) / 2], small: !z.dims && (rm.type === "closet" || rm.type === "linen" || rm.type === "pantry" || rm.type === "wic"), rect: z.rect, dims: z.dims });

  return { walls, runRects: rects, extDiag, brickBand, brick, wallRings, windowLines, leaves, arcs, garageLines, dashed, skin, porchLines, posts, overhang, labels, key };
}

/** The parts of an axis-aligned segment outside every rectangle. */
function clipOut(seg: [Pt, Pt], cuts: Rect[]): Pt[][] {
  const [a, b] = seg;
  const horiz = a[1] === b[1];
  const c = horiz ? a[1] : a[0];
  let parts: [number, number][] = [[Math.min(horiz ? a[0] : a[1], horiz ? b[0] : b[1]), Math.max(horiz ? a[0] : a[1], horiz ? b[0] : b[1])]];
  for (const q of cuts) {
    const [lo, hi, c0, c1] = horiz ? [q.x0, q.x1, q.y0, q.y1] : [q.y0, q.y1, q.x0, q.x1];
    if (c < c0 || c > c1) continue;
    parts = parts.flatMap(([s, e]) => (hi <= s || lo >= e ? [[s, e]] : ([[s, lo], [hi, e]] as [number, number][]).filter(([x, y]) => y - x > 0.5)));
  }
  return parts.map(([s, e]) => (horiz ? [[s, c], [e, c]] : [[c, s], [c, e]]));
}

/** Convex hull of points (monotone chain), closed. */
function hull(ps: Pt[]): Ring {
  const p = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const h = [...lo.slice(0, -1), ...up.slice(0, -1)];
  return [...h, h[0]];
}
