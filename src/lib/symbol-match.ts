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
export type SymbolMatch = Box & { score: number };

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
type Shape = { w: number; h: number; ink: ReturnType<typeof points>; grown: ReturnType<typeof points>; n: number };

function level(ink: Bits): Level {
  return { ink, grown: dilate(ink), count: integral(ink) };
}

function shape(b: Bits): Shape {
  const ink = points(b);
  return { w: b.w, h: b.h, ink, grown: points(dilate(b)), n: ink.xs.length };
}

/**
 * How well the shape fits at (x, y), 0–1. Ink of the symbol landing on blank paper
 * means it's a different symbol, so that costs a lot (precision, to the 6th power); extra ink
 * around it — a wall line running through — costs only a little (recall, square root).
 */
function score(lv: Level, s: Shape, x: number, y: number, minPrecision: number) {
  const there = lv.count(x, y, s.w, s.h);
  if (there < s.n * 0.5 || there > s.n * 3) return 0;
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
  return precision ** 6 * Math.sqrt(recall);
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
  const seen = new Set<string>();
  const add = (b: Bits) => {
    const key = `${b.w}x${b.h}:${b.on.join("")}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(b);
  };
  let r = base;
  for (let turn = 0; turn < (opts.rotations === false ? 1 : 4); turn++) {
    add(r);
    if (opts.mirrored !== false) add(mirror(r));
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
      if (best && best.score >= minScore) found.push(best);
    }
  });
  opts.onProgress?.(1);
  return nonMax(found);
}
