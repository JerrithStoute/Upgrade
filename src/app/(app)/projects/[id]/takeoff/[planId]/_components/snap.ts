import type { Pt } from "@/lib/takeoff";

/**
 * Snapping to the plan's own line work. Segments are bucketed into a grid so a
 * pointer move only checks the lines near it, even on sheets with 100k+ lines.
 */
export type SnapIndex = { segs: Float32Array; cell: number; grid: Map<number, number[]> };
export type SnapHit = { point: Pt; kind: "vertex" | "end" | "line" };

const key = (cx: number, cy: number) => cx * 65536 + cy;

export function buildSnapIndex(segs: Float32Array, cell = 24): SnapIndex {
  const grid = new Map<number, number[]>();
  const add = (cx: number, cy: number, i: number) => {
    if (cx < 0 || cy < 0) return;
    const k = key(cx, cy);
    const list = grid.get(k);
    if (list) {
      if (list[list.length - 1] !== i) list.push(i);
    } else grid.set(k, [i]);
  };
  for (let i = 0; i < segs.length; i += 4) {
    const x1 = segs[i];
    const y1 = segs[i + 1];
    const x2 = segs[i + 2];
    const y2 = segs[i + 3];
    // Walk along the segment so long lines only land in the cells they cross.
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (cell / 2)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      add(Math.floor((x1 + (x2 - x1) * t) / cell), Math.floor((y1 + (y2 - y1) * t) / cell), i);
    }
  }
  return { segs, cell, grid };
}

/**
 * The best snap within `radius` (page units) of `p`. The nearest target wins, with a
 * small head start for takeoff points and line ends over a point along a line, so a
 * corner beats the wall right next to it but never a far-off point.
 */
export function findSnap(index: SnapIndex | null, vertices: Pt[], p: Pt, radius: number): SnapHit | null {
  let bestVertex: Pt | null = null;
  let dv = radius;
  for (const v of vertices) {
    const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
    if (d <= dv) {
      dv = d;
      bestVertex = v;
    }
  }
  if (!index) return bestVertex ? { point: bestVertex, kind: "vertex" } : null;

  const { segs, cell, grid } = index;
  const r = Math.ceil(radius / cell);
  const cx = Math.floor(p[0] / cell);
  const cy = Math.floor(p[1] / cell);
  const seen = new Set<number>();
  let end: Pt | null = null;
  let de = radius;
  let on: Pt | null = null;
  let dl = radius * 0.75;
  for (let gx = cx - r; gx <= cx + r; gx++) {
    for (let gy = cy - r; gy <= cy + r; gy++) {
      const list = grid.get(key(gx, gy));
      if (!list) continue;
      for (const i of list) {
        if (seen.has(i)) continue;
        seen.add(i);
        const x1 = segs[i];
        const y1 = segs[i + 1];
        const x2 = segs[i + 2];
        const y2 = segs[i + 3];
        for (const [ex, ey] of [
          [x1, y1],
          [x2, y2],
        ]) {
          const d = Math.hypot(ex - p[0], ey - p[1]);
          if (d <= de) {
            de = d;
            end = [ex, ey];
          }
        }
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / len2));
        const qx = x1 + t * dx;
        const qy = y1 + t * dy;
        const d = Math.hypot(qx - p[0], qy - p[1]);
        if (d <= dl) {
          dl = d;
          on = [qx, qy];
        }
      }
    }
  }
  // Head starts: takeoff points 30% of the radius, line ends 20%.
  const options: { hit: SnapHit; score: number }[] = [];
  if (bestVertex) options.push({ hit: { point: bestVertex, kind: "vertex" }, score: dv - radius * 0.3 });
  if (end) options.push({ hit: { point: end, kind: "end" }, score: de - radius * 0.2 });
  if (on) options.push({ hit: { point: on, kind: "line" }, score: dl });
  options.sort((a, b) => a.score - b.score);
  return options[0]?.hit ?? null;
}
