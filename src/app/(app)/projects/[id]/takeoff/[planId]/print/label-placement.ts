/**
 * Where the print's labels go: each as near its own spot as it can be without covering another
 * label (never) or the plan's own text (as little as it can). A label for an area stays inside
 * its area; one for a wall or a line stays close to it. Plain math — tested in label-placement.test.ts.
 */

type Pt = [number, number];
/** [left, top, right, bottom] */
export type Box = [number, number, number, number];

export type LabelSpot = {
  /** Where it'd like to be (its middle), its size and its turn (degrees). */
  x: number;
  y: number;
  w: number;
  h: number;
  deg: number;
  /** It stays inside this outline (an area's label)… */
  region?: Pt[] | null;
  /** …or within this distance of where it'd like to be (a wall's or a line's label). */
  maxShift?: number;
};

/** The box a turned label takes up. */
export function labelBox(x: number, y: number, w: number, h: number, deg: number): Box {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const hw = (w * c + h * s) / 2;
  const hh = (w * s + h * c) / 2;
  return [x - hw, y - hh, x + hw, y + hh];
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

function inside([x, y]: Pt, poly: Pt[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) hit = !hit;
  }
  return hit;
}

/** Boxes by where they are, for quick "what's near here". */
function grid(boxes: Box[], cell: number) {
  const cells = new Map<string, number[]>();
  boxes.forEach((b, i) => {
    for (let gx = Math.floor(b[0] / cell); gx <= Math.floor(b[2] / cell); gx++)
      for (let gy = Math.floor(b[1] / cell); gy <= Math.floor(b[3] / cell); gy++) {
        const k = `${gx},${gy}`;
        const list = cells.get(k);
        if (list) list.push(i);
        else cells.set(k, [i]);
      }
  });
  return (b: Box) => {
    const seen = new Set<number>();
    for (let gx = Math.floor(b[0] / cell); gx <= Math.floor(b[2] / cell); gx++)
      for (let gy = Math.floor(b[1] / cell); gy <= Math.floor(b[3] / cell); gy++) for (const i of cells.get(`${gx},${gy}`) ?? []) seen.add(i);
    return [...seen].map((i) => boxes[i]);
  };
}

/** Where each label goes (its middle), in the order given — earlier ones get first pick. */
export function placeLabels(labels: LabelSpot[], text: Box[], opts: { rows?: number; cols?: number } = {}): Pt[] {
  const rows = opts.rows ?? 10;
  const cols = opts.cols ?? 6;
  const sizes = labels.map((l) => Math.max(l.w, l.h));
  const cell = Math.max(1, (sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1)) * 2);
  const textNear = grid(text, cell);
  const placed: Box[] = [];
  return labels.map((l) => {
    const r = (l.deg * Math.PI) / 180;
    const along: Pt = [Math.cos(r), Math.sin(r)];
    const across: Pt = [-along[1], along[0]];
    const stepAcross = l.h * 1.15;
    const stepAlong = Math.max(l.h, l.w * 0.35);
    const tries: { at: Pt; d: number }[] = [];
    for (let i = -rows; i <= rows; i++)
      for (let j = -cols; j <= cols; j++) {
        const at: Pt = [l.x + across[0] * i * stepAcross + along[0] * j * stepAlong, l.y + across[1] * i * stepAcross + along[1] * j * stepAlong];
        const d = Math.hypot(at[0] - l.x, at[1] - l.y);
        if (l.maxShift != null && d > l.maxShift + 1e-9) continue;
        if (l.region && l.region.length > 2 && d > 0 && !inside(at, l.region)) continue;
        tries.push({ at, d });
      }
    tries.sort((a, b) => a.d - b.d);
    const area = l.w * l.h || 1;
    let best: { at: Pt; box: Box; score: number } | null = null;
    for (const t of tries) {
      const box = labelBox(t.at[0], t.at[1], l.w, l.h, l.deg);
      if (placed.some((p) => overlap(p, box) > 0)) continue; // never on another label
      const covered = textNear(box).reduce((sum, b) => sum + overlap(b, box), 0) / area;
      // Clear of the plan's text: the nearest such spot wins. Otherwise the least covered (then the nearest).
      const score = covered + t.d / (stepAcross * rows * 50);
      if (!best || score < best.score) best = { at: t.at, box, score };
      if (covered === 0) break;
    }
    const at: Pt = best?.at ?? [l.x, l.y];
    placed.push(best?.box ?? labelBox(l.x, l.y, l.w, l.h, l.deg));
    return at;
  });
}
