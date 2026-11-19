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
