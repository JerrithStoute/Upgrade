import { z } from "zod";
import { applyAlign, type Align, type Pt } from "./revisions";

/**
 * The floor above, laid over this sheet (a 2nd floor over the 1st): its walls, placed where the
 * floor sits, so the floor joists between them can be drawn here — and break at this floor's walls
 * underneath. A picture only: nothing in it is counted. Pure, so it can be tested.
 *
 * Stored on the sheet it's laid over: a copy of the upper floor's walls (in the coordinates of the
 * sheet they came from — this one when both floors are drawn on one page) and how they line up
 * here (`align`: here = [a −b; b a]·there + [tx, ty]).
 */

const pt = z.tuple([z.number().finite(), z.number().finite()]);
export const upperFloorSchema = z.object({
  /** The sheet its walls came from (this one, when both floors are on one page). */
  sourceSheetId: z.string(),
  walls: z.array(z.array(pt).min(2).max(500)).min(1).max(400),
  align: z.object({ a: z.number().finite(), b: z.number().finite(), tx: z.number().finite(), ty: z.number().finite() }),
});
export type UpperFloor = z.infer<typeof upperFloorSchema>;

export function parseUpperFloor(json: string | null | undefined): UpperFloor | null {
  if (!json) return null;
  try {
    const r = upperFloorSchema.safeParse(JSON.parse(json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** The walls where they sit on this sheet. */
export const placedWalls = (walls: Pt[][], al: Align): Pt[][] => walls.map((w) => w.map((p) => applyAlign(al, p)));

const d2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Distance from p to the segment a–b. */
export function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.sqrt(d2(p, [a[0] + t * dx, a[1] + t * dy]));
}

/**
 * Both floors drawn on one page: the walls of the floor clicked on — the walls touching the clicked
 * one, and theirs, and so on (`near` = how close ends must be to count as touching) — plus any wall
 * inside that floor's outline (interior walls that don't quite touch). Null: no wall near the click.
 */
export function pickFloor(walls: Pt[][], click: Pt, reach: number, near: number): Pt[][] | null {
  const dist = (w: Pt[]) => Math.min(...w.slice(1).map((p, i) => toSegment(click, w[i], p)));
  let start = -1;
  let best = reach;
  walls.forEach((w, i) => {
    const d = dist(w);
    if (d <= best) [best, start] = [d, i];
  });
  if (start < 0) return null;
  const touches = (a: Pt[], b: Pt[]) => a.some((p) => b.slice(1).some((q, i) => toSegment(p, b[i], q) <= near)) || b.some((p) => a.slice(1).some((q, i) => toSegment(p, a[i], q) <= near));
  const inFloor = new Set([start]);
  for (let grew = true; grew; ) {
    grew = false;
    walls.forEach((w, i) => {
      if (!inFloor.has(i) && [...inFloor].some((j) => touches(w, walls[j]))) {
        inFloor.add(i);
        grew = true;
      }
    });
  }
  // Interior walls inside the floor's outline, touching or not.
  const pts = [...inFloor].flatMap((i) => walls[i]);
  const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  walls.forEach((w, i) => {
    if (w.every((p) => p[0] >= x0 - near && p[0] <= x1 + near && p[1] >= y0 - near && p[1] <= y1 + near)) inFloor.add(i);
  });
  return [...inFloor].sort((a, b) => a - b).map((i) => walls[i]);
}

/** The middle of the walls (what follows the pointer while placing). */
export function middleOf(walls: Pt[][]): Pt {
  const pts = walls.flat();
  return [(Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2];
}

/** A placement: scaled by `scale`, turned `turns` quarter-turns, its middle at `at`. */
export function placement(walls: Pt[][], scale: number, turns: number, at: Pt): Align {
  const angle = ((((turns % 4) + 4) % 4) * Math.PI) / 2;
  const a = scale * Math.round(Math.cos(angle));
  const b = scale * Math.round(Math.sin(angle));
  const [mx, my] = middleOf(walls);
  return { a, b, tx: at[0] - (a * mx - b * my), ty: at[1] - (b * mx + a * my) };
}

/**
 * Snap while placing: when a corner of the floor above comes within `reach` of a corner of this
 * floor's walls (or lands near one of its walls), the whole floor moves the rest of the way —
 * "along the first floor's outside walls". Returns the snapped placement and what it snapped to.
 */
export function snapPlacement(al: Align, walls: Pt[][], below: Pt[][], reach: number): { align: Align; snapped: Pt | null } {
  const corners = walls.flat().map((p) => applyAlign(al, p));
  const targets = below.flat();
  let best: { d: number; from: Pt; to: Pt } | null = null;
  for (const c of corners) {
    for (const t of targets) {
      const d = Math.sqrt(d2(c, t));
      if (d <= reach && (!best || d < best.d)) best = { d, from: c, to: t };
    }
  }
  if (!best) {
    // No corner close: a corner onto the nearest wall line below.
    for (const c of corners)
      for (const w of below)
        for (let i = 1; i < w.length; i++) {
          const d = toSegment(c, w[i - 1], w[i]);
          if (d <= reach / 2 && (!best || d < best.d)) {
            const [a, b] = [w[i - 1], w[i]];
            const len = d2(a, b);
            const t = len ? Math.max(0, Math.min(1, ((c[0] - a[0]) * (b[0] - a[0]) + (c[1] - a[1]) * (b[1] - a[1])) / len)) : 0;
            best = { d, from: c, to: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
          }
        }
  }
  if (!best) return { align: al, snapped: null };
  return { align: { ...al, tx: al.tx + best.to[0] - best.from[0], ty: al.ty + best.to[1] - best.from[1] }, snapped: best.to };
}
