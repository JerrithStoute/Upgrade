/**
 * Symbol auto-count: find every copy of a small symbol on a plan sheet.
 *
 * Works on a grayscale picture of the sheet (any PDF or scanned image). Dark pixels
 * are "ink". A spot matches when the symbol's ink lands on ink there (allowing a
 * pixel of slop) and there isn't much other ink in the way. The search runs coarse
 * first (a shrunken copy of the sheet, so it's fast), then refines each likely spot
 * at full size. Rotated (90° steps) and mirrored copies are found too.
 *
 * Pure — no browser APIs — so it runs in a Web Worker and in unit tests.
 */

export type Gray = { w: number; h: number; data: Uint8Array | Uint8ClampedArray };
export type Box = { x: number; y: number; w: number; h: number };
/** `turn` / `mirrored`: which way it was found (quarter turns, and flipped). */
export type SymbolMatch = Box & { score: number; turn?: number; mirrored?: boolean };

/** Darker than this (0–255) counts as ink. */
const INK = 170;

type Bits = { w: number; h: number; on: Uint8Array };

function inkOf(img: Gray): Bits {
  const on = new Uint8Array(img.w * img.h);
  for (let i = 0; i < on.length; i++) on[i] = img.data[i] < INK ? 1 : 0;
  return { w: img.w, h: img.h, on };
}

/** Any ink in each k×k block → ink (a shrunken copy that keeps thin lines). */
function shrink(b: Bits, k: number): Bits {
  if (k <= 1) return b;
  const w = Math.ceil(b.w / k);
  const h = Math.ceil(b.h / k);
  const on = new Uint8Array(w * h);
  for (let y = 0; y < b.h; y++) {
    const row = y * b.w;
    const out = Math.floor(y / k) * w;
    for (let x = 0; x < b.w; x++) if (b.on[row + x]) on[out + Math.floor(x / k)] = 1;
  }
  return { w, h, on };
}

/** Ink grown by one pixel in every direction — tolerance for slightly different line drawing. */
function dilate(b: Bits): Bits {
  const on = new Uint8Array(b.w * b.h);
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      if (!b.on[y * b.w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= b.h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < b.w) on[yy * b.w + xx] = 1;
        }
      }
    }
  return { w: b.w, h: b.h, on };
}

/** Summed-area table, for "how much ink in this window" in four lookups. */
function integral(b: Bits) {
  const w = b.w + 1;
  const s = new Uint32Array(w * (b.h + 1));
  for (let y = 0; y < b.h; y++) {
    let run = 0;
    for (let x = 0; x < b.w; x++) {
      run += b.on[y * b.w + x];
      s[(y + 1) * w + x + 1] = s[y * w + x + 1] + run;
    }
  }
  return (x: number, y: number, ww: number, hh: number) => s[(y + hh) * w + x + ww] - s[y * w + x + ww] - s[(y + hh) * w + x] + s[y * w + x];
}

/** Offsets of the ink pixels, relative to the template's corner. */
function points(b: Bits) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      if (b.on[y * b.w + x]) {
        xs.push(x);
        ys.push(y);
      }
  return { xs: Int32Array.from(xs), ys: Int32Array.from(ys) };
}

function rotate90(b: Bits): Bits {
  const on = new Uint8Array(b.w * b.h);
  // (x, y) → (h-1-y, x) in a h×w result
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) on[x * b.h + (b.h - 1 - y)] = b.on[y * b.w + x];
  return { w: b.h, h: b.w, on };
}

function mirror(b: Bits): Bits {
  const on = new Uint8Array(b.w * b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) on[y * b.w + (b.w - 1 - x)] = b.on[y * b.w + x];
  return { w: b.w, h: b.h, on };
}

/** The template trimmed to its ink (a loose box around the symbol is fine). */
function trim(b: Bits): Bits | null {
  let x0 = b.w,
    y0 = b.h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      if (b.on[y * b.w + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) on[y * w + x] = b.on[(y + y0) * b.w + x + x0];
  return { w, h, on };
}

type Level = { ink: Bits; grown: Bits; count: (x: number, y: number, w: number, h: number) => number };
type Shape = { w: number; h: number; ink: ReturnType<typeof points>; grown: ReturnType<typeof points>; n: number; clear: ReturnType<typeof points> };

function level(ink: Bits): Level {
  return { ink, grown: dilate(ink), count: integral(ink) };
}

/** The symbol's blank paper: inside its box, 2 pixels or more clear of its ink (inside a circle, its corners). */
function clearOf(b: Bits): Bits {
  const near = dilate(dilate(b));
  const on = new Uint8Array(b.w * b.h);
  for (let i = 0; i < on.length; i++) on[i] = near.on[i] ? 0 : 1;
  return { w: b.w, h: b.h, on };
}

function shape(b: Bits): Shape {
  const ink = points(b);
  return { w: b.w, h: b.h, ink, grown: points(dilate(b)), n: ink.xs.length, clear: points(clearOf(b)) };
}

/**
 * How well the shape fits at (x, y), 0–1. Ink of the symbol landing on blank paper
 * means it's a different symbol, so that costs a lot (precision, to the 6th power); extra ink
 * around it — a wall line running through — costs only a little (recall, square root). But where
 * the symbol is blank paper (inside a circle), the spot must be mostly blank too: hatching, text,
 * a crowd of lines has ink everywhere a symbol's ink could land, and isn't a copy.
 */
function score(lv: Level, s: Shape, x: number, y: number, minPrecision: number) {
  const there = lv.count(x, y, s.w, s.h);
  if (there < s.n * 0.5 || there > s.n * 2) return 0;
  const w = lv.ink.w;
  let hit = 0;
  const need = s.n * minPrecision;
  for (let i = 0; i < s.n; i++) {
    hit += lv.grown.on[(y + s.ink.ys[i]) * w + x + s.ink.xs[i]];
    // Can't reach the bar any more: stop early.
    if (hit + (s.n - i - 1) < need) return 0;
  }
  const precision = hit / s.n;
  let covered = 0;
  const g = s.grown;
  for (let i = 0; i < g.xs.length; i++) covered += lv.ink.on[(y + g.ys[i]) * w + x + g.xs[i]];
  const recall = there ? Math.min(1, covered / there) : 0;
  let clear = 1;
  if (s.clear.xs.length >= 4) {
    let inked = 0;
    for (let i = 0; i < s.clear.xs.length; i++) inked += lv.ink.on[(y + s.clear.ys[i]) * w + x + s.clear.xs[i]];
    clear = 1 - inked / s.clear.xs.length;
  }
  return precision ** 6 * Math.sqrt(recall) * clear ** 2;
}

/** Keep the best of matches that overlap (centers closer than half the symbol). */
function nonMax(list: SymbolMatch[]) {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const kept: SymbolMatch[] = [];
  for (const m of sorted) {
    const cx = m.x + m.w / 2;
    const cy = m.y + m.h / 2;
    const clash = kept.some((k) => Math.abs(k.x + k.w / 2 - cx) < Math.min(m.w, k.w) * 0.5 && Math.abs(k.y + k.h / 2 - cy) < Math.min(m.h, k.h) * 0.5);
    if (!clash) kept.push(m);
  }
  return kept;
}

/** Where the Match slider starts: true copies score ~0.9–1, different symbols ~0.5 or less. */
export const DEFAULT_MATCH = 0.7;

export type FindOptions = {
  /** Also look for the symbol turned 90°, 180° and 270°. Default true. */
  rotations?: boolean;
  /** Also look for it flipped. Default true. */
  mirrored?: boolean;
  /** Lowest score returned (the slider filters from here up). Default 0.45. */
  minScore?: number;
  onProgress?: (fraction: number) => void;
};

/** The sample cut out of a sheet picture (in its pixels). */
export function cropGray(img: Gray, box: Box): Gray {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const w = Math.max(1, Math.min(img.w - x0, Math.ceil(box.w)));
  const h = Math.max(1, Math.min(img.h - y0, Math.ceil(box.h)));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = img.data[(y + y0) * img.w + x + x0];
  return { w, h, data };
}

/**
 * Every place on `img` that looks like `sample` (both grayscale, same pixels-per-inch).
 * Returns boxes in `img` pixels with a 0–1 score, best first; the sample's own spot is included.
 */
export function findSymbols(img: Gray, sample: Gray, opts: FindOptions = {}): SymbolMatch[] {
  const base = trim(inkOf(sample));
  if (!base || base.w < 3 || base.h < 3) return [];
  const minScore = opts.minScore ?? 0.45;

  // The symbol in every direction asked for (duplicates dropped — a circle is a circle).
  const variants: Bits[] = [];
  const ways: { turn: number; mirrored: boolean }[] = [];
  const seen = new Set<string>();
  const add = (b: Bits, way: { turn: number; mirrored: boolean }) => {
    const key = `${b.w}x${b.h}:${b.on.join("")}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(b);
    ways.push(way);
  };
  let r = base;
  for (let turn = 0; turn < (opts.rotations === false ? 1 : 4); turn++) {
    add(r, { turn, mirrored: false });
    if (opts.mirrored !== false) add(mirror(r), { turn, mirrored: true });
    r = rotate90(r);
  }

  // Coarse level: shrink so the symbol is ~16 px across.
  const k = Math.max(1, Math.floor(Math.max(base.w, base.h) / 16));
  const fineInk = inkOf(img);
  const fine = level(fineInk);
  const coarse = k > 1 ? level(shrink(fineInk, k)) : fine;

  const found: SymbolMatch[] = [];
  variants.forEach((v, vi) => {
    const sv = shape(v);
    const sc = k > 1 ? shape(shrink(v, k)) : sv;
    const candidates: SymbolMatch[] = [];
    for (let y = 0; y + sc.h <= coarse.ink.h; y++) {
      for (let x = 0; x + sc.w <= coarse.ink.w; x++) {
        const s = score(coarse, sc, x, y, 0.6);
        if (s >= minScore - 0.15) candidates.push({ x, y, w: sc.w, h: sc.h, score: s });
      }
      if (opts.onProgress && y % 64 === 0) opts.onProgress((vi + y / coarse.ink.h) / variants.length);
    }
    // Refine each likely spot at full size, a little around where the coarse pass put it.
    for (const c of nonMax(candidates)) {
      let best: SymbolMatch | null = null;
      const fx = c.x * k;
      const fy = c.y * k;
      for (let y = Math.max(0, fy - k - 1); y <= Math.min(fine.ink.h - sv.h, fy + k + 1); y++)
        for (let x = Math.max(0, fx - k - 1); x <= Math.min(fine.ink.w - sv.w, fx + k + 1); x++) {
          const s = score(fine, sv, x, y, 0.6);
          if (!best || s > best.score) best = { x, y, w: sv.w, h: sv.h, score: s };
        }
      if (best && best.score >= minScore) found.push({ ...best, ...ways[vi] });
    }
  });
  opts.onProgress?.(1);
  return nonMax(found);
}

/**
 * A second, sharper look at one likely spot — the sheet drawn again at a high scale around it, and the
 * sample at the same scale. Small symbols (a door tag's "2880" beside a "2680") only differ by a stroke
 * or two, too fine to tell apart on the whole-sheet picture. Score 0–1: all of the sample's ink must be
 * there (to the pixel, near enough — a line crossing it adds ink but takes none away, so a dimension
 * line through a tag doesn't spoil it; a 6 where the sample has an 8 does), and where the sample is
 * blank paper the spot must be mostly blank (hatching, text, a crowd of lines isn't a copy).
 * `patch` is a little bigger than the sample, around where the coarse search put it; every position in
 * it is tried. `turn` / `mirrored`: the way the coarse search found it.
 */
export function verifyMatch(sample: Gray, patch: Gray, way: { turn?: number; mirrored?: boolean } = {}): { score: number; dx: number; dy: number } {
  // The search can mistake a turned symbol for a flipped one (text standing on end looks much the same
  // either way, small), and can't tell at all for a round one: every way it could lie that fits the spot
  // is tried, the way the search found it first.
  let best = { score: 0, dx: 0, dy: 0 };
  const first = (way.turn ?? 0) % 2;
  for (const turn of [first, first + 2, 1 - first, 3 - first]) {
    const [w, h] = turn % 2 ? [sample.h, sample.w] : [sample.w, sample.h];
    if (w > patch.w || h > patch.h) continue;
    for (const mirrored of [false, true]) {
      const r = verifyOne(sample, patch, { turn, mirrored });
      if (r.score > best.score) best = r;
    }
  }
  return best;
}

/**
 * Ink in pieces (joined dark pixels) that touch the picture's edge and don't go around or across its
 * middle — a wire stub, a line passing by. A ring does count: it goes around the middle.
 */
function passingInk(g: Gray): Uint8Array {
  const out = new Uint8Array(g.w * g.h);
  const seen = new Uint8Array(g.w * g.h);
  const stack: number[] = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || g.data[start] >= INK) continue;
    const piece: number[] = [];
    let edge = false;
    let [x0, y0, x1, y1] = [g.w, g.h, -1, -1];
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop()!;
      piece.push(k);
      const x = k % g.w;
      const y = (k - x) / g.w;
      if (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) edge = true;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h) continue;
          const n = yy * g.w + xx;
          if (!seen[n] && g.data[n] < INK) {
            seen[n] = 1;
            stack.push(n);
          }
        }
    }
    const middle = x0 <= g.w / 2 && x1 >= g.w / 2 && y0 <= g.h / 2 && y1 >= g.h / 2;
    if (edge && !middle) for (const k of piece) out[k] = 1;
  }
  return out;
}

function verifyOne(sample: Gray, patch: Gray, way: { turn?: number; mirrored?: boolean }): { score: number; dx: number; dy: number } {
  // The sample turned the way it was found.
  let g = sample;
  const turnGray = (a: Gray): Gray => {
    const data = new Uint8Array(a.w * a.h);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) data[x * a.h + (a.h - 1 - y)] = a.data[y * a.w + x];
    return { w: a.h, h: a.w, data };
  };
  const flipGray = (a: Gray): Gray => {
    const data = new Uint8Array(a.w * a.h);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) data[y * a.w + (a.w - 1 - x)] = a.data[y * a.w + x];
    return { w: a.w, h: a.h, data };
  };
  if (way.mirrored) g = flipGray(g);
  for (let t = 0; t < (way.turn ?? 0) % 4; t++) g = turnGray(g);
  // The sample's ink (dark) and its paper (clearly white). Ink running off the edge of the sample box
  // and not joined to its middle — a wire leading away, a line passing by — isn't the symbol: other
  // copies have their own there, or none. It's left out (neither ink nor paper).
  const passing = passingInk(g);
  const inkAt: number[] = [];
  const paperAt: number[] = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.data[y * g.w + x];
      if (v < INK) {
        if (!passing[y * g.w + x]) inkAt.push(x, y);
      } else if (v > 230) paperAt.push(x, y);
    }
  if (inkAt.length < 6 || patch.w < g.w || patch.h < g.h) return { score: 0, dx: 0, dy: 0 };
  // The spot's ink, grown a pixel (rendering differs a hair from place to place), and its paper.
  const pw = patch.w;
  const grown = new Uint8Array(pw * patch.h);
  const paper = new Uint8Array(pw * patch.h);
  for (let y = 0; y < patch.h; y++)
    for (let x = 0; x < pw; x++) {
      const v = patch.data[y * pw + x];
      if (v > 200) paper[y * pw + x] = 1;
      if (v >= INK) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && xx >= 0 && yy < patch.h && xx < pw) grown[yy * pw + xx] = 1;
        }
    }
  // Only the middle of the symbol has to be there — a letter, a 6 or an 8, a circle; not its edges, where
  // a wire stub or a prong leaves it, a wall it sits against, a tag's frame: copies differ there.
  const inner: number[] = [];
  for (let i = 0; i < inkAt.length; i += 2) {
    const mx = Math.abs(inkAt[i] - (g.w - 1) / 2) / (g.w / 2);
    const my = Math.abs(inkAt[i + 1] - (g.h - 1) / 2) / (g.h / 2);
    if (Math.max(mx, my) <= 0.7) inner.push(inkAt[i], inkAt[i + 1]);
  }
  if (inner.length < 12) return { score: 0, dx: 0, dy: 0 };
  const total = inner.length / 2;
  const nPaper = paperAt.length / 2;
  let best = { score: 0, dx: 0, dy: 0 };
  for (let oy = 0; oy + g.h <= patch.h; oy++)
    for (let ox = 0; ox + g.w <= pw; ox++) {
      let have = 0;
      // The sample's ink must be there: give up as soon as it can't reach 95%.
      let missing = 0;
      const allowed = total * 0.05;
      for (let i = 0; i < inner.length; i += 2) {
        if (grown[(oy + inner[i + 1]) * pw + ox + inner[i]]) have++;
        else if (++missing > allowed) break;
      }
      if (missing > allowed) continue;
      let clean = 0;
      for (let i = 0; i < paperAt.length; i += 2) clean += paper[(oy + paperAt[i + 1]) * pw + ox + paperAt[i]];
      const score = (have / total) * (nPaper ? clean / nPaper : 1);
      if (score > best.score) best = { score, dx: ox, dy: oy };
    }
  if (!best.score) return best;
  // Where it lines up best: what's missing from the very middle. A real copy misses a pixel here and
  // there (a wire it doesn't have runs off the middle); a different symbol misses a whole stroke — a 6
  // where the sample has an 8 — in one piece.
  const miss = new Uint8Array(g.w * g.h);
  let have = 0;
  for (let i = 0; i < inner.length; i += 2) {
    if (grown[(best.dy + inner[i + 1]) * pw + best.dx + inner[i]]) have++;
    else if (Math.max(Math.abs(inner[i] - (g.w - 1) / 2) / (g.w / 2), Math.abs(inner[i + 1] - (g.h - 1) / 2) / (g.h / 2)) <= 0.55)
      miss[inner[i + 1] * g.w + inner[i]] = 1;
  }
  let chunk = 0;
  const stack: number[] = [];
  for (let k = 0; k < miss.length; k++) {
    if (!miss[k]) continue;
    let size = 0;
    miss[k] = 0;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % g.w;
      const y = (c - x) / g.w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h || !miss[yy * g.w + xx]) continue;
          miss[yy * g.w + xx] = 0;
          stack.push(yy * g.w + xx);
        }
    }
    chunk = Math.max(chunk, size);
  }
  let clean = 0;
  for (let i = 0; i < paperAt.length; i += 2) clean += paper[(best.dy + paperAt[i + 1]) * pw + best.dx + paperAt[i]];
  // The biggest piece missing: up to 0.6% of the ink is nothing; 2% or more, a different symbol.
  const r = chunk / total;
  const whole = Math.max(0, Math.min(1, 1 - (r - 0.006) / 0.014));
  const score = (have / total) ** 4 * (nPaper ? clean / nPaper : 1) ** 2 * whole;
  return { score, dx: best.dx, dy: best.dy };
}

/**
 * What's in the way on a sheet, in page units: dimension lines and their ticks (segments
 * [x1, y1, x2, y2, …]) and text that isn't the symbol's ([left, top, right, bottom] boxes).
 */
export type Clutter = { segments: number[]; text: [number, number, number, number][]; ticks?: number[] };

/**
 * Lines that cross the sample box and run on past it — a leader to a tag, a wire, a wall the symbol
 * sits on (segments [x1, y1, x2, y2, …], page units). The symbol's own lines stay inside the box; these
 * differ from copy to copy, so the sample doesn't count them.
 */
export function leavingLines(segments: Float32Array | number[], box: Box): number[] {
  const out: number[] = [];
  const pad = Math.max(box.w, box.h) * 0.15;
  const [x0, y0, x1, y1] = [box.x, box.y, box.x + box.w, box.y + box.h];
  const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const farOut = (x: number, y: number) => x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad;
  for (let i = 0; i + 3 < segments.length; i += 4) {
    const [ax, ay, bx, by] = [segments[i], segments[i + 1], segments[i + 2], segments[i + 3]];
    if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
    if (!farOut(ax, ay) && !farOut(bx, by)) continue;
    // It reaches into the box: an end inside, or it passes through (a point along it inside).
    let into = inBox(ax, ay) || inBox(bx, by);
    for (let k = 1; k < 32 && !into; k++) into = inBox(ax + ((bx - ax) * k) / 32, ay + ((by - ay) * k) / 32);
    if (into) out.push(ax, ay, bx, by);
  }
  return out;
}

type TextItem = { str: string; box: [number, number, number, number] };

/** The words inside the sample box (a tag's number, an outlet's "WP"): part of the symbol. */
export function sampleWords(items: TextItem[], sample: Box): Set<string> {
  const inside = (b: [number, number, number, number]) => {
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    return cx >= sample.x && cx <= sample.x + sample.w && cy >= sample.y && cy <= sample.y + sample.h;
  };
  return new Set(items.filter((t) => inside(t.box)).map((t) => t.str));
}

/** The text to blank out on a sheet: every piece but the sample's own words (`keep`). */
export function clutterText(items: TextItem[], keep: Set<string>) {
  return items.filter((t) => !keep.has(t.str)).map((t) => t.box);
}

/**
 * `clutter` painted over a picture of the sheet (`img`, drawn at `scale` from page-unit box `at`), in
 * `value`: paper (255) for the search, or "don't care" for the sample. Lines a couple of pixels wide.
 */
export function eraseClutter(img: Gray, scale: number, clutter: Clutter, value = 255, at: { x: number; y: number } = { x: 0, y: 0 }): Gray {
  const data = Uint8Array.from(img.data);
  const px = (x: number, y: number) => {
    const xx = Math.round(x);
    const yy = Math.round(y);
    if (xx >= 0 && yy >= 0 && xx < img.w && yy < img.h) data[yy * img.w + xx] = value;
  };
  const line = (s: number[], r: number) => {
    for (let i = 0; i + 3 < s.length; i += 4) {
      const [x1, y1, x2, y2] = [(s[i] - at.x) * scale, (s[i + 1] - at.y) * scale, (s[i + 2] - at.x) * scale, (s[i + 3] - at.y) * scale];
      if (Math.max(x1, x2) < -r || Math.min(x1, x2) > img.w + r || Math.max(y1, y2) < -r || Math.min(y1, y2) > img.h + r) continue;
      const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1;
      for (let k = 0; k <= n; k++) {
        const x = x1 + ((x2 - x1) * k) / n;
        const y = y1 + ((y2 - y1) * k) / n;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) px(x + dx, y + dy);
      }
    }
  };
  line(clutter.segments, Math.max(1, Math.round(scale * 0.6)));
  // Dimension ticks are drawn heavy.
  line(clutter.ticks ?? [], Math.max(1, Math.round(scale * 1.2)));
  // Words: only the ink that stays inside the word's box (its letters). Ink running on out of the box
  // is something else the word sits against (an outlet labeled "GFCI") and stays.
  const seen = new Uint8Array(img.w * img.h);
  const stack: number[] = [];
  for (const [l, t, rr, b] of clutter.text) {
    const x0 = Math.max(0, Math.floor((l - at.x) * scale));
    const y0 = Math.max(0, Math.floor((t - at.y) * scale));
    const x1 = Math.min(img.w - 1, Math.ceil((rr - at.x) * scale));
    const y1 = Math.min(img.h - 1, Math.ceil((b - at.y) * scale));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const start = y * img.w + x;
        if (seen[start] || img.data[start] >= INK) continue;
        const piece: number[] = [];
        let out = false;
        seen[start] = 1;
        stack.push(start);
        while (stack.length) {
          const k = stack.pop()!;
          piece.push(k);
          const px = k % img.w;
          const py = (k - px) / img.w;
          if (px < x0 || px > x1 || py < y0 || py > y1) {
            out = true;
            continue;
          }
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = px + dx;
              const yy = py + dy;
              if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
              const n = yy * img.w + xx;
              if (!seen[n] && img.data[n] < INK) {
                seen[n] = 1;
                stack.push(n);
              }
            }
        }
        // (Pieces are looked at once: the next word's box may share them.)
        for (const k of piece) seen[k] = 0;
        seen[start] = 1;
        if (out) continue;
        for (const k of piece) {
          data[k] = value;
          seen[k] = 1;
        }
      }
  }
  return { w: img.w, h: img.h, data };
}

/** Spots the search scored at least this get the sharp second look; lower ones are dropped. */
export const LOOK_FROM = 0.55;

/** Pixels per page unit for the sharp look: about 100 pixels across the sample box (page units). */
export function sharpScale(box: Box, sheetScale: number): number {
  return Math.min(12, Math.max(sheetScale, 100 / Math.max(box.w, box.h)));
}

/**
 * Where to look again, in page units, for each spot the search found (`found`, in pixels of a sheet
 * picture at `sheetScale`): the spot's middle, as big as the trimmed sharp sample (`sample`, drawn at
 * `scale`) the way round the spot is, plus about 5 pixels of the sheet picture either way — the search
 * can be off by that much when a wire or a line leaves the symbol on one side.
 */
export function lookPatches(found: Box[], sheetScale: number, sample: Gray, scale: number): Box[] {
  const slack = 10 / sheetScale;
  const sw = sample.w / scale;
  const sh = sample.h / scale;
  return found.map((m) => {
    const cx = (m.x + m.w / 2) / sheetScale;
    const cy = (m.y + m.h / 2) / sheetScale;
    const flat = m.w >= m.h === sw >= sh;
    const w = (flat ? sw : sh) + 2 * slack;
    const h = (flat ? sh : sw) + 2 * slack;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  });
}

/**
 * The sharp second look draws the sheet again, but only around the likely spots, in a few big tiles
 * (each drawn once): which tiles (page units) and which spots fall in each. `boxes` are the patches
 * to look at (page units); a tile is at most `maxPx` pixels a side at `scale`.
 */
export function planTiles(boxes: Box[], scale: number, maxPx = 4096): { tile: Box; items: number[] }[] {
  if (!boxes.length) return [];
  const big = Math.max(...boxes.map((b) => Math.max(b.w, b.h)));
  // Cells a tile's worth (less one patch, so a patch starting near a cell's edge still fits).
  const cell = Math.max(big, maxPx / scale - big);
  const tiles = new Map<string, { tile: Box; items: number[] }>();
  boxes.forEach((b, i) => {
    const cx = Math.floor(b.x / cell);
    const cy = Math.floor(b.y / cell);
    const key = `${cx},${cy}`;
    let t = tiles.get(key);
    if (!t) {
      t = { tile: { x: cx * cell, y: cy * cell, w: cell + big, h: cell + big }, items: [] };
      tiles.set(key, t);
    }
    t.items.push(i);
  });
  // Each tile shrunk to what its patches need.
  return [...tiles.values()].map(({ items }) => {
    const x0 = Math.min(...items.map((i) => boxes[i].x));
    const y0 = Math.min(...items.map((i) => boxes[i].y));
    const x1 = Math.max(...items.map((i) => boxes[i].x + boxes[i].w));
    const y1 = Math.max(...items.map((i) => boxes[i].y + boxes[i].h));
    return { tile: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, items };
  });
}

/** The part of a tile picture (drawn from page-unit box `tile` at `scale`) covering page-unit box `b`. */
export function cutPatch(tileImg: Gray, tile: Box, b: Box, scale: number): Gray {
  return cropGray(tileImg, { x: (b.x - tile.x) * scale, y: (b.y - tile.y) * scale, w: b.w * scale, h: b.h * scale });
}

/** A picture trimmed to its ink, plus `pad` pixels of paper round it (a loose box around a symbol → the symbol). */
export function trimGray(g: Gray, pad = 2): { img: Gray; x: number; y: number } {
  let x0 = g.w,
    y0 = g.h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.data[y * g.w + x] < INK) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { img: g, x: 0, y: 0 };
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(g.w - 1, x1 + pad);
  y1 = Math.min(g.h - 1, y1 + pad);
  return { img: cropGray(g, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }), x: x0, y: y0 };
}

/**
 * The sample, ready for the sharp look: a wire or line passing through the box taken out (left as paper),
 * then trimmed to the symbol with a couple of pixels round it.
 */
export function sharpSample(g: Gray): Gray {
  const passing = passingInk(g);
  const data = Uint8Array.from(g.data);
  for (let i = 0; i < data.length; i++) if (passing[i]) data[i] = 255;
  return trimGray({ w: g.w, h: g.h, data }, 2).img;
}

/**
 * The symbol inside a loosely drawn box (`g`, the box drawn sharp): the box shrunk to it. What's at the
 * very middle of the box is the symbol, with whatever goes round it (a tag's frame, a light's circle)
 * and whatever's inside that. Lines
 * running right across the box (a wall, a dimension line) and loose bits off to the side (ticks, other
 * text) aren't. Pixels of `g`, with a little paper round.
 */
export function symbolBox(g: Gray): Box {
  const { w, h } = g;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = g.data[i] < INK ? 1 : 0;
  // Lines right across the box.
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    if (n >= w * 0.9) for (let x = 0; x < w; x++) across[y * w + x] = 1;
  }
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += ink[y * w + x];
    if (n >= h * 0.9) for (let y = 0; y < h; y++) across[y * w + x] = 1;
  }
  for (let i = 0; i < ink.length; i++) if (across[i]) ink[i] = 0;
  // The pieces (joined ink) and each one's box.
  const piece = new Int32Array(w * h).fill(-1);
  const boxes: [number, number, number, number][] = [];
  const stack: number[] = [];
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || piece[start] >= 0) continue;
    const id = boxes.length;
    const bb: [number, number, number, number] = [w, h, -1, -1];
    piece[start] = id;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % w;
      const y = (k - x) / w;
      bb[0] = Math.min(bb[0], x);
      bb[1] = Math.min(bb[1], y);
      bb[2] = Math.max(bb[2], x);
      bb[3] = Math.max(bb[3], y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const n = yy * w + xx;
          if (ink[n] && piece[n] < 0) {
            piece[n] = id;
            stack.push(n);
          }
        }
    }
    boxes.push(bb);
  }
  if (!boxes.length) return { x: 0, y: 0, w, h };
  // The piece at the very middle of the box (or the one nearest it)...
  const keep = new Set<number>();
  const rx = Math.max(2, w * 0.1);
  const ry = Math.max(2, h * 0.1);
  for (let y = Math.max(0, Math.floor(h / 2 - ry)); y <= Math.min(h - 1, h / 2 + ry); y++)
    for (let x = Math.max(0, Math.floor(w / 2 - rx)); x <= Math.min(w - 1, w / 2 + rx); x++) if (piece[y * w + x] >= 0) keep.add(piece[y * w + x]);
  if (!keep.size) {
    let near = 0;
    let best = Infinity;
    for (let k = 0; k < piece.length; k++) {
      if (piece[k] < 0) continue;
      const d = Math.hypot((k % w) - w / 2, Math.floor(k / w) - h / 2);
      if (d < best) [best, near] = [d, piece[k]];
    }
    keep.add(near);
  }
  const boxOf = () => {
    const ids = [...keep];
    return [Math.min(...ids.map((i) => boxes[i][0])), Math.min(...ids.map((i) => boxes[i][1])), Math.max(...ids.map((i) => boxes[i][2])), Math.max(...ids.map((i) => boxes[i][3]))];
  };
  // ...what goes round it (a tag's frame, a light's circle), and what's inside that (the other digits).
  for (let grew = true; grew; ) {
    grew = false;
    const [bx0, by0, bx1, by1] = boxOf();
    boxes.forEach((b, i) => {
      if (keep.has(i)) return;
      const round = b[0] <= bx0 && b[1] <= by0 && b[2] >= bx1 && b[3] >= by1;
      const inside = b[0] >= bx0 && b[1] >= by0 && b[2] <= bx1 && b[3] <= by1;
      if (!round && !inside) return;
      keep.add(i);
      grew = true;
    });
  }
  const [x0, y0, x1, y1] = boxOf();
  const pad = 2;
  const [bx, by] = [Math.max(0, x0 - pad), Math.max(0, y0 - pad)];
  return { x: bx, y: by, w: Math.min(w - 1, x1 + pad) - bx + 1, h: Math.min(h - 1, y1 + pad) - by + 1 };
}
