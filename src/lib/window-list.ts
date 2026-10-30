/**
 * Windows on a job: the short list to pick from while counting (Project.windowList — Item List ids, in
 * order), and sizes the way builders write them. What a window is described by, and its name, is in
 * unit-parts.ts (Catalog → Windows).
 */

export type JobWindows = { lines: string[] };

/** How many windows a job's list holds — plenty; keys 1–9 pick the first nine. */
export const MAX_LINES = 40;

const json = (s: string | null | undefined): unknown => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export function readJobWindows(s: string | null | undefined): JobWindows {
  const v = json(s) as { lines?: unknown } | null;
  return {
    lines: Array.isArray(v?.lines) ? Array.from(new Set(v.lines.filter((x): x is string => typeof x === "string"))).slice(0, MAX_LINES) : [],
  };
}

/**
 * A window size as builders write it — "3050" is 3'0" wide by 5'0" tall, "2868" 2'8" by 6'8" — or in
 * inches, "36x60". Null when it isn't a size.
 */
export function readSizeCode(raw: string): { widthIn: number; heightIn: number } | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  const code = /^(\d)(\d{1,2})(\d)(\d{1,2})$/.exec(t);
  if (/^\d{4}$/.test(t) && code) {
    const [w, h] = [Number(t[0]) * 12 + Number(t[1]), Number(t[2]) * 12 + Number(t[3])];
    return w > 0 && h > 0 ? { widthIn: w, heightIn: h } : null;
  }
  const inches = /^(\d{1,3}(?:\.\d+)?)["]?x(\d{1,3}(?:\.\d+)?)["]?$/.exec(t);
  if (inches) {
    const [w, h] = [Number(inches[1]), Number(inches[2])];
    return w >= 6 && h >= 6 && w <= 240 && h <= 240 ? { widthIn: w, heightIn: h } : null;
  }
  return null;
}

/** The size the usual way: 36 × 60 → "3050", 32 × 80 → "2868" (feet, then inches, wide then tall). */
export function sizeCode(widthIn: number, heightIn: number) {
  const part = (i: number) => `${Math.floor(i / 12)}${Math.round(i - Math.floor(i / 12) * 12)}`;
  return `${part(widthIn)}${part(heightIn)}`;
}
