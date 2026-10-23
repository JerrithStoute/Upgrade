import { DEFAULT_OPENING_OPTIONS, DEFAULT_STOCK_LENGTHS, DEFAULT_WALL_OPTIONS, itemNameKey, parseOptions, parseStockLengths } from "./takeoff";

/**
 * A job's length substitutions ("2x4 treated × 18'" → 20') as its takeoffs load: no takeoff of that size
 * orders the replaced length — no database here (substitutions.ts keeps them).
 */

type LengthSub = { size: string | null; fromLen: number | null; toLen: number | null };

/** A stock length list ("16" or "8-20") with a substituted length swapped for the other one. */
function swapLength(stockText: string, size: string, subs: LengthSub[]) {
  const mine = subs.filter((s) => itemNameKey(s.size!) === itemNameKey(size));
  if (!mine.length) return stockText;
  let stock = parseStockLengths(stockText) ?? DEFAULT_STOCK_LENGTHS;
  for (const s of mine) if (stock.includes(s.fromLen!)) stock = Array.from(new Set([...stock.filter((l) => l !== s.fromLen), s.toLen!])).sort((a, b) => a - b);
  return stock.join(",");
}

/** Studs cut from stock (not precut): a substituted length becomes the other one. */
function swapStud<O extends { studPrecut: boolean; studLengthIn: number }>(o: O, size: string, subs: LengthSub[]): O {
  if (o.studPrecut) return o;
  const s = subs.find((x) => itemNameKey(x.size!) === itemNameKey(size) && Math.abs(x.fromLen! * 12 - o.studLengthIn) < 0.01);
  return s ? { ...o, studLengthIn: s.toLen! * 12 } : o;
}

/**
 * Length substitutions applied to a job's takeoffs as they load: a takeoff of that size
 * doesn't use the replaced length (its pieces come from the other one) — joists and rafters,
 * and the lumber walls and openings order themselves (plates, studs cut from stock).
 */
export function withLengthSubstitutions<
  T extends { memberSize: string | null; stockLengths: string | null; packLength: number | null; type?: string; options?: string | null },
>(conditions: T[], subs: LengthSub[]): T[] {
  const bySize = subs.filter((s) => s.size && s.fromLen && s.toLen);
  if (!bySize.length) return conditions;
  return conditions.map((c) => {
    const walls = c.type === "WALL" || c.type === "OPENING" ? { ...c, options: wallOptionsWith(c, bySize) } : c;
    const mine = c.memberSize ? bySize.filter((s) => itemNameKey(s.size!) === itemNameKey(c.memberSize!)) : [];
    if (!mine.length) return walls;
    c = walls;
    let stock = parseStockLengths(c.stockLengths) ?? DEFAULT_STOCK_LENGTHS;
    let packLength = c.packLength;
    for (const s of mine) {
      if (!stock.includes(s.fromLen!) && packLength !== s.fromLen) continue;
      stock = Array.from(new Set([...stock.filter((l) => l !== s.fromLen), s.toLen!])).sort((a, b) => a - b);
      if (packLength === s.fromLen) packLength = s.toLen;
    }
    return { ...c, stockLengths: stock.join(","), packLength };
  });
}

/** A Walls / Openings takeoff's options with the job's length substitutions in its plates and studs (as wallTakeoff names them). */
function wallOptionsWith(c: { type?: string; memberSize: string | null; options?: string | null }, subs: LengthSub[]) {
  if (c.type === "OPENING") {
    const o = parseOptions(c.options, DEFAULT_OPENING_OPTIONS);
    const next = swapStud(o, o.studSize.trim() || "2x4", subs);
    return next === o ? (c.options ?? null) : JSON.stringify(next);
  }
  const o = parseOptions(c.options, DEFAULT_WALL_OPTIONS);
  const stud = c.memberSize?.trim() || "2x4";
  const top = o.topPlateSize.trim() || stud;
  const bottom = `${o.bottomPlateSize.trim() || stud}${o.treatedBottom ? " treated" : ""}`;
  const next = {
    ...swapStud(o, stud, subs),
    topPlateStock: swapLength(o.topPlateStock, top, subs),
    bottomPlateStock: swapLength(o.bottomPlateStock, bottom, subs),
  };
  const same = next.topPlateStock === o.topPlateStock && next.bottomPlateStock === o.bottomPlateStock && next.studLengthIn === o.studLengthIn;
  return same ? (c.options ?? null) : JSON.stringify(next);
}
