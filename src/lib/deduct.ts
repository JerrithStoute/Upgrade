/**
 * Deducting: what's drawn with Deduct on is cut out of the takeoff's shapes under it — nothing of the deduction is
 * kept. An area loses the part the deduction covers (a hole when it's all inside: a stair opening); a wall line
 * loses the stretch the deduction runs along.
 */
import polygonClipping from "polygon-clipping";
import type { Pt } from "./takeoff";

type Ring = [number, number][];

const area = (r: Pt[]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) a += r[i][0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * r[i][1];
  return Math.abs(a) / 2;
};

/** A ring as polygon-clipping wants it (closed), and back (open, no point twice in a row). */
const closed = (r: Pt[]): Ring => [...r.map((p) => [p[0], p[1]] as [number, number]), [r[0][0], r[0][1]]];
const open = (r: Ring): Pt[] => {
  const pts = r.slice(0, -1).map((p) => [p[0], p[1]] as Pt);
  return pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  });
};

/**
 * An area (its outline and holes) with `cut` taken out of it: the area(s) left — none when the cut covers it all,
 * several when it cuts it in pieces. Null when the cut doesn't overlap it (nothing to deduct).
 */
export function cutArea(outline: Pt[], holes: Pt[][], cut: Pt[]): { points: Pt[]; holes: Pt[][] }[] | null {
  if (outline.length < 3 || cut.length < 3) return null;
  const subject = [closed(outline), ...holes.filter((h) => h.length >= 3).map(closed)];
  const whole = area(outline) - holes.reduce((s, h) => s + area(h), 0);
  const overlap = polygonClipping.intersection(subject, [closed(cut)]).reduce((s, poly) => s + area(open(poly[0])) - poly.slice(1).reduce((t, h) => t + area(open(h)), 0), 0);
  // (Touching it along an edge, or a hair over: not a deduction from it.)
  if (overlap <= whole * 1e-4) return null;
  return polygonClipping
    .difference(subject, [closed(cut)])
    .map((poly) => ({ points: open(poly[0]), holes: poly.slice(1).map(open).filter((h) => h.length >= 3) }))
    .filter((p) => p.points.length >= 3 && area(p.points) > whole * 1e-4);
}

/**
 * A line (a wall) with the stretches the deduction line runs along (within `tol`, near enough parallel) taken out:
 * the pieces left — none when it covered it all. Null when it doesn't run along any of it.
 */
export function cutLine(points: Pt[], cut: Pt[], tol: number): Pt[][] | null {
  if (points.length < 2 || cut.length < 2) return null;
  const runs: Pt[][] = [];
  let touched = false;
  let cur: Pt[] | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const ux = dx / len, uy = dy / len;
    // The parts of this piece the deduction runs along (0–1 along it).
    const covered: [number, number][] = [];
    for (let k = 0; k + 1 < cut.length; k++) {
      const c = cut[k], d = cut[k + 1];
      const cl = Math.hypot(d[0] - c[0], d[1] - c[1]);
      if (!cl) continue;
      // Near enough parallel (within ~10°) and close to the line all along.
      if (Math.abs(((d[0] - c[0]) * uy - (d[1] - c[1]) * ux) / cl) > 0.17) continue;
      const off = (p: Pt) => Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
      if (off(c) > tol || off(d) > tol) continue;
      const t = (p: Pt) => ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / len;
      const t0 = Math.max(0, Math.min(t(c), t(d))), t1 = Math.min(1, Math.max(t(c), t(d)));
      if (t1 - t0 > tol / len / 4) covered.push([t0, t1]);
    }
    covered.sort((x, y) => x[0] - y[0]);
    // What's left of the piece.
    const left: [number, number][] = [];
    let at = 0;
    for (const [t0, t1] of covered) {
      if (t0 > at) left.push([at, t0]);
      at = Math.max(at, t1);
    }
    if (at < 1) left.push([at, 1]);
    if (covered.length) touched = true;
    const pt = (t: number): Pt => [a[0] + dx * t, a[1] + dy * t];
    for (const [t0, t1] of left) {
      if ((t1 - t0) * len < tol / 4 && !(t0 === 0 && t1 === 1)) continue;
      // Joined to the run so far when it carries on from the last piece's end.
      if (cur && t0 === 0) cur.push(pt(t1));
      else {
        cur = [pt(t0), pt(t1)];
        runs.push(cur);
      }
    }
    if (!left.length || left[left.length - 1][1] < 1) cur = null;
  }
  return touched ? runs.filter((r) => r.length >= 2) : null;
}

/**
 * Found walls with every stretch already measured on the sheet taken out (`existing`: the wall lines there), so a
 * second Find walls click never counts a wall twice. Leftover bits shorter than `minLen` are dropped.
 */
export function withoutExisting(runs: Pt[][], existing: Pt[][], tol: number, minLen: number): Pt[][] {
  let left = runs.filter((r) => r.length >= 2);
  for (const ex of existing) {
    if (ex.length < 2) continue;
    const next: Pt[][] = [];
    for (const run of left) next.push(...(cutLine(run, ex, tol) ?? [run]));
    left = next;
  }
  const len = (r: Pt[]) => r.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - r[i][0], q[1] - r[i][1]), 0);
  return left.filter((r) => len(r) >= minLen);
}

/**
 * Merge (2026-11-23): two areas made one — the edge they share goes; where they meet only at a doorway, the walls
 * beside it stay out. When they don't touch:
 *  - a hair's gap (up to `gap`, from drawing them) along edges side by side is filled in;
 *  - else, with the plan's lines (`plan`), they're joined through the openings in the wall between them (up to
 *    `plan.wallGap` apart — a doorway, cased or barn-door opening, the wall's faces not drawn there), jamb to jamb,
 *    each opening between them; never through a wall (both faces drawn).
 * Holes (deductions) in either stay. Null when they can't be joined that way (still two pieces).
 */
export function mergeAreas(
  a: { points: Pt[]; holes?: Pt[][] },
  b: { points: Pt[]; holes?: Pt[][] },
  gap: number,
  plan?: { segments: Float32Array | number[]; wallGap: number; inch: number },
): { points: Pt[]; holes: Pt[][] } | null {
  if (a.points.length < 3 || b.points.length < 3) return null;
  const poly = (s: { points: Pt[]; holes?: Pt[][] }) => [closed(s.points), ...(s.holes ?? []).filter((h) => h.length >= 3).map(closed)];
  const one = (out: ReturnType<typeof polygonClipping.union>) =>
    out.length === 1 ? { points: open(out[0][0]), holes: out[0].slice(1).map(open).filter((h) => h.length >= 3) } : null;
  // Touching (a doorway between them): just the two, the walls beside the doorway staying out (the user, 2026-11-23:
  // a hall and bedroom merged at the door, not through the wall).
  const plain = one(polygonClipping.union(poly(a), poly(b)));
  if (plain) return plain;
  // Edges of the two running side by side within `reach` (near enough parallel, overlapping, facing across).
  type Pair = { p: Pt; ux: number; uy: number; t0: number; t1: number; offAt: (t: number) => number };
  const pairs = (reach: number) => {
    const out: Pair[] = [];
    const A = a.points, B = b.points;
    for (let i = 0; i < A.length; i++) {
      const p = A[i], q = A[(i + 1) % A.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!len) continue;
      const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len;
      for (let j = 0; j < B.length; j++) {
        const r = B[j], s = B[(j + 1) % B.length];
        const l2 = Math.hypot(s[0] - r[0], s[1] - r[1]);
        if (!l2) continue;
        // (Within ~10° of parallel.)
        if (Math.abs(((s[0] - r[0]) * uy - (s[1] - r[1]) * ux) / l2) > 0.17) continue;
        const off = (z: Pt) => (z[0] - p[0]) * -uy + (z[1] - p[1]) * ux;
        if (Math.abs(off(r)) > reach || Math.abs(off(s)) > reach) continue;
        const t = (z: Pt) => (z[0] - p[0]) * ux + (z[1] - p[1]) * uy;
        const t0 = Math.max(0, Math.min(t(r), t(s))), t1 = Math.min(len, Math.max(t(r), t(s)));
        if (t1 - t0 <= gap / 4) continue;
        const tr = t(r), ts = t(s), or = off(r), os = off(s);
        out.push({ p, ux, uy, t0, t1, offAt: (tt) => (ts === tr ? or : or + ((os - or) * (tt - tr)) / (ts - tr)) });
      }
    }
    return out;
  };
  const at = (e: Pair, t: number, o: number): [number, number] => [e.p[0] + e.ux * t - e.uy * o, e.p[1] + e.uy * t + e.ux * o];
  const strip = (e: Pair, t0: number, t1: number): Ring[] => [[at(e, t0, 0), at(e, t1, 0), at(e, t1, e.offAt(t1)), at(e, t0, e.offAt(t0)), at(e, t0, 0)]];
  const hair = pairs(gap).map((e) => strip(e, e.t0, e.t1));
  if (hair.length) {
    const r = one(polygonClipping.union(poly(a), poly(b), ...hair));
    if (r) return r;
  }
  if (!plan) return null;
  // Through the wall between them, only where it's open: the wall's two faces (the two areas' edges) not both drawn.
  const { segments: sg, wallGap, inch } = plan;
  const doors: Ring[][] = [];
  for (const e of pairs(wallGap)) {
    // The plan's lines near this stretch, running along it.
    const xs = [at(e, e.t0, 0), at(e, e.t1, 0), at(e, e.t0, e.offAt(e.t0)), at(e, e.t1, e.offAt(e.t1))];
    const bx0 = Math.min(...xs.map((z) => z[0])) - 2 * inch, bx1 = Math.max(...xs.map((z) => z[0])) + 2 * inch;
    const by0 = Math.min(...xs.map((z) => z[1])) - 2 * inch, by1 = Math.max(...xs.map((z) => z[1])) + 2 * inch;
    const along: { o0: number; o1: number; s0: number; s1: number }[] = [];
    for (let k = 0; k + 3 < sg.length; k += 4) {
      const x0 = sg[k], y0 = sg[k + 1], x1 = sg[k + 2], y1 = sg[k + 3];
      if (Math.max(x0, x1) < bx0 || Math.min(x0, x1) > bx1 || Math.max(y0, y1) < by0 || Math.min(y0, y1) > by1) continue;
      const l = Math.hypot(x1 - x0, y1 - y0);
      if (!l || Math.abs(((x1 - x0) * e.uy - (y1 - y0) * e.ux) / l) > 0.17) continue;
      const tt = (x: number, y: number) => (x - e.p[0]) * e.ux + (y - e.p[1]) * e.uy;
      const oo = (x: number, y: number) => (x - e.p[0]) * -e.uy + (y - e.p[1]) * e.ux;
      const sa = tt(x0, y0), sb = tt(x1, y1);
      along.push({ o0: oo(x0, y0), o1: oo(x1, y1), s0: Math.min(sa, sb), s1: Math.max(sa, sb) });
    }
    // Dashed lines aren't wall — a header over a wide opening, a beam above (the user's 6' opening in a 2x6 wall,
    // 2026-11-23): 3+ short pieces (under 12") in a row on one line with small gaps (½"–6") between them.
    {
      const short = along.filter((l) => l.s1 - l.s0 < 12 * inch && Math.abs(l.o1 - l.o0) < 0.5 * inch).sort((p, q) => p.s0 - q.s0);
      const dash = new Set<(typeof along)[number]>();
      const used = new Set<(typeof along)[number]>();
      for (const l of short) {
        if (used.has(l)) continue;
        const chain = [l];
        used.add(l);
        for (;;) {
          const last = chain[chain.length - 1];
          const nx = short.find((m) => !used.has(m) && Math.abs(m.o0 - last.o0) < 0.5 * inch && m.s0 - last.s1 >= 0.5 * inch && m.s0 - last.s1 <= 6 * inch);
          if (!nx) break;
          chain.push(nx);
          used.add(nx);
        }
        if (chain.length >= 3) chain.forEach((m) => dash.add(m));
      }
      if (dash.size) for (let k = along.length - 1; k >= 0; k--) if (dash.has(along[k])) along.splice(k, 1);
    }
    // Whether a face (offset `o` at t) has a line drawn on it (within 1.5").
    const drawn = (t: number, o: number) => along.some((l) => t >= l.s0 - 0.5 * inch && t <= l.s1 + 0.5 * inch && Math.abs((l.s1 === l.s0 ? l.o0 : l.o0 + ((l.o1 - l.o0) * (t - l.s0)) / (l.s1 - l.s0)) - o) <= 1.5 * inch);
    const step = inch;
    let run0: number | null = null;
    // (Exactly jamb to jamb: an opening's ends moved to where the face lines stop beside it.)
    const onFace = (l: { o0: number; s0: number }) => Math.abs(l.o0) <= 1.5 * inch || Math.abs(l.o0 - e.offAt(l.s0)) <= 1.5 * inch;
    const jamb = (t: number, side: -1 | 1) => {
      const ends = along.filter(onFace).map((l) => (side < 0 ? l.s1 : l.s0)).filter((v) => (side < 0 ? v >= t - 2 * inch && v <= t + inch : v >= t - inch && v <= t + 2 * inch));
      return ends.length ? (side < 0 ? Math.max(...ends) : Math.min(...ends)) : t;
    };
    const end = (t: number) => {
      if (run0 !== null) {
        const lo = Math.max(e.t0, jamb(run0, -1)), hi = Math.min(e.t1, jamb(t, 1));
        // (An opening's at least 18" wide: a gap in a dashed line isn't one.)
        if (hi - lo >= 18 * inch) doors.push(strip(e, lo, hi));
      }
      run0 = null;
    };
    for (let t = e.t0; t <= e.t1 + 1e-9; t += step) {
      const wall = drawn(t, 0) && drawn(t, e.offAt(t));
      if (!wall && run0 === null) run0 = t;
      if (wall) end(t);
    }
    end(e.t1);
  }
  if (!doors.length) return null;
  return one(polygonClipping.union(poly(a), poly(b), ...hair, ...doors));
}
