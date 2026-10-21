/**
 * Is this sheet a floor plan? Worked out quietly from what's drawn on it — nobody is asked. Only used to
 * read a sheet ahead for Find area (a wrong guess costs nothing: every tool still works on every sheet,
 * the first click is just not ready ahead).
 *
 * The tell is doors: a floor plan draws each door as a swing — an arc from the hinge — and the door
 * itself, a straight line from the hinge out to one end of the arc, the door's width long. Elevations,
 * roof and foundation plans have arcs too (arched windows, letters drawn as curves, a fireplace), but not
 * that line from the arc's center.
 */

type Swing = { x: number; y: number; r: number; a: [number, number]; b: [number, number] };

/** How many of `swings` have the door itself drawn: a line from the hinge to one end of the arc. */
export function drawnDoors(segments: Float32Array | number[], swings: Swing[], unitsPerFoot?: number | null): number {
  if (!swings.length) return 0;
  // Line ends filed by where they are, so each swing looks only at the ends near its hinge.
  const CELL = 8;
  const ends = new Map<string, number[]>();
  for (let i = 0; i + 3 < segments.length; i += 4)
    for (const k of [0, 2]) {
      const key = `${Math.floor(segments[i + k] / CELL)}:${Math.floor(segments[i + k + 1] / CELL)}`;
      const list = ends.get(key);
      if (list) list.push(i, k);
      else ends.set(key, [i, k]);
    }
  let n = 0;
  for (const s of swings) {
    // At a known scale, a door is 1'-6" to 4'-0" wide.
    if (unitsPerFoot && (s.r < 1.5 * unitsPerFoot || s.r > 4 * unitsPerFoot)) continue;
    const tol = Math.max(0.15 * s.r, 1);
    const near = (x: number, y: number, p: [number, number]) => Math.hypot(x - p[0], y - p[1]) <= tol;
    let found = false;
    for (let gx = Math.floor((s.x - tol) / CELL); gx <= Math.floor((s.x + tol) / CELL) && !found; gx++)
      for (let gy = Math.floor((s.y - tol) / CELL); gy <= Math.floor((s.y + tol) / CELL) && !found; gy++) {
        const list = ends.get(`${gx}:${gy}`);
        if (!list) continue;
        for (let j = 0; j < list.length && !found; j += 2) {
          const i = list[j];
          const k = list[j + 1];
          const [hx, hy, fx, fy] = [segments[i + k], segments[i + k + 1], segments[i + 2 - k], segments[i + 3 - k]];
          if (!near(hx, hy, [s.x, s.y])) continue;
          // (Out to an end of the arc: the door, not a wall running past the hinge.)
          if (near(fx, fy, s.a) || near(fx, fy, s.b)) found = true;
        }
      }
    if (found) n++;
  }
  return n;
}

/** Whether a sheet looks like a floor plan: 3 or more doors drawn as doors (see drawnDoors). */
export function looksLikeFloorPlan(segments: Float32Array | number[], swings: Swing[], unitsPerFoot?: number | null): boolean {
  return drawnDoors(segments, swings, unitsPerFoot) >= 3;
}
