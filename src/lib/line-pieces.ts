/**
 * One piece of a drawn line (a wall run, a beam, a hip): the stretch between two corners, so each
 * piece can be edited on its own — broken off as its own line (to give it other items), deleted, or
 * broken at a point. A curve (arc point j bends the line through points j-1, j, j+1) is one piece.
 */
import type { Pt } from "./takeoff";

export type Line = { points: Pt[]; arcs: number[] };

/** The edge nearest `p` (edge i runs from point i to point i+1; closed shapes wrap), within `maxD`. */
export function nearestEdge(points: Pt[], p: Pt, closed: boolean, maxD: number): { edge: number; at: Pt } | null {
  let best: { edge: number; at: Pt } | null = null;
  let bestD = maxD;
  const edges = closed ? points.length : points.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const q: Pt = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < bestD) {
      bestD = d;
      best = { edge: i, at: q };
    }
  }
  return best;
}

/** The points (first, last index) of the piece edge `edge` belongs to: a curve is the whole curve. */
export function pieceAt(line: Line, edge: number): [number, number] {
  let s = edge;
  let e = edge + 1;
  if (line.arcs.includes(s)) s -= 1;
  if (line.arcs.includes(e)) e += 1;
  return [Math.max(0, s), Math.min(line.points.length - 1, e)];
}

/** Points s..e of a line as a line of their own, its arc points moved along. */
function slice(line: Line, s: number, e: number): Line {
  return { points: line.points.slice(s, e + 1), arcs: line.arcs.filter((j) => j > s && j < e).map((j) => j - s) };
}

/** Adds a point at `at` on edge `edge` (after point `edge`). */
export function addPoint(line: Line, edge: number, at: Pt): Line {
  return {
    points: [...line.points.slice(0, edge + 1), at, ...line.points.slice(edge + 1)],
    arcs: line.arcs.map((j) => (j > edge ? j + 1 : j)),
  };
}

/** Takes point `i` out (a curve through it goes straight). */
export function removePoint(line: Line, i: number): Line {
  return { points: line.points.filter((_, j) => j !== i), arcs: line.arcs.filter((j) => j !== i).map((j) => (j > i ? j - 1 : j)) };
}

/**
 * The line cut around the piece edge `edge` is on: what's before it, the piece, what's after it
 * (before / after are null when the piece is at that end). A line that is only this piece: null.
 */
export function breakOff(line: Line, edge: number): { before: Line | null; piece: Line; after: Line | null } | null {
  const [s, e] = pieceAt(line, edge);
  const last = line.points.length - 1;
  if (s === 0 && e === last) return null;
  return { before: s > 0 ? slice(line, 0, s) : null, piece: slice(line, s, e), after: e < last ? slice(line, e, last) : null };
}

/** The line with the piece edge `edge` is on taken out: what's left (0, 1 or 2 lines). */
export function deletePiece(line: Line, edge: number): Line[] {
  const r = breakOff(line, edge);
  if (!r) return [];
  return [r.before, r.after].filter((x): x is Line => !!x);
}

/** Two lines broken at point `i` (a corner between the ends, not on a curve), or null. */
export function breakAt(line: Line, i: number): [Line, Line] | null {
  const last = line.points.length - 1;
  if (i <= 0 || i >= last || line.arcs.includes(i)) return null;
  return [slice(line, 0, i), slice(line, i, last)];
}
