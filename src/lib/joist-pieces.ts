import { DEFAULT_STOCK_LENGTHS, framingMembers, framingOptions, memberThickness, parseStockLengths, shapePath, slopeFactor, stockPieces, type ConditionCalc, type LengthPrices, type MeasurementShape, type Pt } from "./takeoff";
import { memberBreaks } from "./span-tables";

/**
 * Joists and rafters broken where they're held up: a joist that crosses a wall or beam traced on
 * the sheet is ordered as a piece on each side of it, the two lapping over it (framingOptions —
 * 3" by default, half of it past the wall's center each way). Each piece has its own span, so on a
 * span table each gets the size its own span calls for: a 30' run with a wall at 14' is a 14'
 * piece and a 16' piece, each sized for itself.
 *
 * A piece shorter than MIN_PIECE_FT stays with the one beside it — the joist runs on past that
 * wall (a few feet of cantilever, or the area drawn to the outside of the wall it sits on).
 *
 * Plain math — tested in joist-pieces.test.ts.
 */

export const MIN_PIECE_FT = 4;

/** One piece of a joist: where it runs along the joist (0…1), its span, and the length ordered (lap, overhang and pitch in). */
export type JoistPiece = { a: number; b: number; spanFt: number; lengthFt: number };

/** A joist as one continuous board, not broken at the walls: its longest span and the length ordered. */
export type WholeJoist = { spanFt: number; lengthFt: number };

/** A piece as the plan draws it: where it runs, the takeoff (size) it's ordered under, its length. */
export type MemberPiece = { a: number; b: number; owner: string; length: number };

export function joistPieces(
  c: Pick<ConditionCalc, "type" | "spacing" | "overhang" | "pitch" | "memberSize" | "memberWidthIn" | "options">,
  m: Pick<MeasurementShape, "points" | "arcs" | "angle" | "pitch">,
  unitsPerFoot: number,
  supports: [Pt, Pt][],
): { members: [Pt, Pt][]; pieces: JoistPiece[][]; whole: WholeJoist[] } {
  const upf = unitsPerFoot;
  const members = framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * upf, memberThickness(c.memberSize, upf, c.memberWidthIn));
  const factor = slopeFactor(m.pitch ?? c.pitch);
  const lap = framingOptions(c.options).lapIn / 12;
  const overhang = c.overhang / 12;
  const minPiece = MIN_PIECE_FT * upf;
  const whole: WholeJoist[] = [];
  const pieces = members.map((member) => {
    const len = Math.hypot(member[1][0] - member[0][0], member[1][1] - member[0][1]);
    // A joist within 4" of a wall running alongside it sits on that wall: no span of its own, one piece.
    const at = memberBreaks(member, supports, (4 / 12) * upf);
    const full = (len / upf + overhang) * factor;
    let longest = 0;
    for (let k = 1; k < (at?.length ?? 0); k++) longest = Math.max(longest, at![k] - at![k - 1]);
    whole.push({ spanFt: longest / upf, lengthFt: full });
    if (!at || !(len > 0)) return [{ a: 0, b: 1, spanFt: 0, lengthFt: full }];
    // Breaks that would leave a piece too short to be its own board are left out (the joist runs on).
    const kept = [0];
    for (const x of at.slice(1, -1)) if (x - kept[kept.length - 1] >= minPiece - 1e-9 && len - x >= minPiece - 1e-9) kept.push(x);
    kept.push(len);
    const n = kept.length - 1;
    return Array.from({ length: n }, (_, i) => {
      const plan = (kept[i + 1] - kept[i]) / upf;
      // Half the lap past each wall it meets; the overhang shared by the two outside ends.
      const laps = ((i > 0 ? 1 : 0) + (i < n - 1 ? 1 : 0)) * (lap / 2);
      const hang = n === 1 ? overhang : (i === 0 ? 1 : 0) * (overhang / 2) + (i === n - 1 ? 1 : 0) * (overhang / 2);
      // Its span: the longest stretch between supports within it (a short end it kept adds to its run).
      const inner = at.filter((x) => x >= kept[i] - 1e-9 && x <= kept[i + 1] + 1e-9);
      let span = 0;
      for (let k = 1; k < inner.length; k++) span = Math.max(span, inner[k] - inner[k - 1]);
      return { a: kept[i] / len, b: kept[i + 1] / len, spanFt: span / upf, lengthFt: (plan + laps + hang) * factor };
    });
  });
  return { members, pieces, whole };
}

/**
 * Each piece's size from its own span. A joist lying on a wall (no span) takes the size of the
 * joists beside it — the one before, or (at the start) the one after.
 */
export function sizePieces(pieces: JoistPiece[][], sizeFor: (spanFt: number) => string | null): (string | null)[][] {
  const sizes: (string | null | undefined)[][] = pieces.map((row) => row.map((p) => (p.spanFt > 0 ? sizeFor(p.spanFt) : undefined)));
  const known = (row: (string | null | undefined)[]) => row.find((x) => x !== undefined);
  for (let i = 0; i < sizes.length; i++) if (sizes[i].some((x) => x === undefined) && i > 0) sizes[i] = sizes[i].map((x) => (x === undefined ? known(sizes[i - 1]) : x));
  for (let i = sizes.length - 1; i >= 0; i--)
    if (sizes[i].some((x) => x === undefined)) sizes[i] = sizes[i].map((x) => (x === undefined ? (i + 1 < sizes.length ? known(sizes[i + 1]) : undefined) ?? sizeFor(0) : x));
  return sizes as (string | null)[][];
}

/**
 * What one board (or piece) costs at your real prices — the cheapest priced stock length that
 * holds it. Null when no length that holds it has a price of its own (no guessing from other
 * lengths), when it's longer than any length you buy, or when the size isn't sold in stock lengths.
 */
export function boardCost(lengthFt: number, f: { stockLengths?: string | null; soldAs?: string | null; lengthPrices?: LengthPrices | null } | null | undefined): number | null {
  if (!f || (f.soldAs ?? "STOCK") !== "STOCK" || !f.lengthPrices) return null;
  const stock = parseStockLengths(f.stockLengths ?? null) ?? DEFAULT_STOCK_LENGTHS;
  if (stockPieces(lengthFt, stock).length !== 1) return null; // longer than you buy: no one board
  let best: number | null = null;
  for (const l of stock) {
    const price = f.lengthPrices[l];
    if (l >= lengthFt - 1e-9 && price > 0 && (best == null || price < best)) best = price;
  }
  return best;
}

/**
 * Packing by cheapest, for a joist that crosses a wall: one continuous board over the wall, or
 * the pieces broken on it — whichever costs less at your real prices. Every board involved needs a
 * price of its own; if one doesn't, it isn't guessed: the joist stays broken at the wall.
 */
export function wholeIsCheaper(pieceCosts: (number | null)[], wholeCost: number | null) {
  if (wholeCost == null || pieceCosts.some((c) => c == null)) return false;
  return wholeCost < pieceCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0) - 1e-9;
}
