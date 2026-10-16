import { DEFAULT_STOCK_LENGTHS, framingMembers, framingOptions, memberThickness, parseStockLengths, shapePath, slopeFactor, stockPieces, type ConditionCalc, type LengthPrices, type MeasurementShape, type Pt } from "./takeoff";
import { memberCrossings } from "./span-tables";
import { EDGE } from "./joist-sections";

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

/**
 * One piece of a joist: where it runs along the joist (0…1), its span, and the length ordered (lap,
 * overhang and pitch in). `from` / `to`: the supports at its two ends (a wall or beam's key, or
 * "edge") — the bay it's in (joist-sections.ts).
 */
export type JoistPiece = { a: number; b: number; spanFt: number; lengthFt: number; from: string; to: string; over?: string[] };

/** A joist as one continuous board, not broken at the walls: its longest span and the length ordered. */
export type WholeJoist = { spanFt: number; lengthFt: number };

/**
 * A piece as the plan draws it: where it runs, the takeoff (size) it's ordered under, its length.
 * `section`: its bay; `span`: its span (feet); `tableSize`: what the span table calls for (when
 * there is one); `picked`: its size is yours, not the table's.
 */
export type MemberPiece = { a: number; b: number; owner: string; length: number; section?: string; span?: number; tableSize?: string | null; picked?: boolean; over?: string[] };

export function joistPieces(
  c: Pick<ConditionCalc, "type" | "spacing" | "overhang" | "pitch" | "memberSize" | "memberWidthIn" | "options">,
  m: Pick<MeasurementShape, "points" | "arcs" | "angle" | "pitch">,
  unitsPerFoot: number,
  supports: [Pt, Pt][],
  /** Which wall or beam each support is part of (parallel to `supports`), and the ones joists run through, not broken on. */
  opts: { keys?: string[]; through?: Iterable<string> } = {},
): { members: [Pt, Pt][]; pieces: JoistPiece[][]; whole: WholeJoist[] } {
  const through = new Set(opts.through ?? []);
  const upf = unitsPerFoot;
  const members = framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * upf, memberThickness(c.memberSize, upf, c.memberWidthIn));
  const factor = slopeFactor(m.pitch ?? c.pitch);
  const lap = framingOptions(c.options).lapIn / 12;
  const overhang = c.overhang / 12;
  const minPiece = MIN_PIECE_FT * upf;
  const whole: WholeJoist[] = [];
  const pieces = members.map((member) => {
    const len = Math.hypot(member[1][0] - member[0][0], member[1][1] - member[0][1]);
    // A joist within 4" of a wall running alongside it sits on that wall: no span of its own. It's still
    // broken where the walls across it are, like the joists beside it (so it goes with their bays).
    const held = memberCrossings(member, supports, opts.keys, (4 / 12) * upf);
    const onWall = !held;
    const crossings = held ?? memberCrossings(member, supports, opts.keys, 0);
    const at = crossings?.map((x) => x.at) ?? null;
    const full = (len / upf + overhang) * factor;
    let longest = 0;
    if (!onWall) for (let k = 1; k < (at?.length ?? 0); k++) longest = Math.max(longest, at![k] - at![k - 1]);
    whole.push({ spanFt: longest / upf, lengthFt: full });
    if (!crossings || !at || !(len > 0)) return [{ a: 0, b: 1, spanFt: 0, lengthFt: full, from: EDGE, to: EDGE }];
    // Breaks that would leave a piece too short to be its own board are left out (the joist runs on),
    // and so are the walls you run it through. They still hold it up (its span), just don't cut it.
    const kept = [crossings[0]];
    for (const x of crossings.slice(1, -1)) if (!through.has(x.key) && x.at - kept[kept.length - 1].at >= minPiece - 1e-9 && len - x.at >= minPiece - 1e-9) kept.push(x);
    kept.push(crossings[crossings.length - 1]);
    const n = kept.length - 1;
    return Array.from({ length: n }, (_, i) => {
      const plan = (kept[i + 1].at - kept[i].at) / upf;
      // Half the lap past each wall it meets; the overhang shared by the two outside ends.
      const laps = ((i > 0 ? 1 : 0) + (i < n - 1 ? 1 : 0)) * (lap / 2);
      const hang = n === 1 ? overhang : (i === 0 ? 1 : 0) * (overhang / 2) + (i === n - 1 ? 1 : 0) * (overhang / 2);
      // Its span: the longest stretch between supports within it (a short end it kept adds to its run).
      const inner = at.filter((x) => x >= kept[i].at - 1e-9 && x <= kept[i + 1].at + 1e-9);
      let span = 0;
      if (!onWall) for (let k = 1; k < inner.length; k++) span = Math.max(span, inner[k] - inner[k - 1]);
      // The walls you run it through, within it.
      const over = crossings.filter((x) => through.has(x.key) && x.at > kept[i].at + 1e-9 && x.at < kept[i + 1].at - 1e-9).map((x) => x.key);
      return { a: kept[i].at / len, b: kept[i + 1].at / len, spanFt: span / upf, lengthFt: (plan + laps + hang) * factor, from: kept[i].key, to: kept[i + 1].key, ...(over.length ? { over } : {}) };
    });
  });
  return { members, pieces, whole };
}

/**
 * Each piece's bay (joist-sections.ts): a run of side-by-side joists with the same walls on each
 * side and the same span-table size — what the plan labels as one group. Named by its walls, and
 * numbered when the area has more than one run between the same two (the joists running edge to
 * edge on each side of a short wall): "edge|wall-a|1", "edge|edge|2".
 */
/** How far apart (of the joist's length) two joists' ends on a wall can be and still be one bay. */
const END_SLACK = 0.04;

export function bayKeys(split: Pick<JoistPiece, "from" | "to" | "a" | "b">[][], tableSizes: (string | null)[][] | null): string[][] {
  const runs = new Map<string, number>();
  let prev: { key: string; a: number; b: number }[] = [];
  return split
    .map((row, i) => {
      const keys = row.map((p, j) => {
        const base = `${p.from}|${p.to}`;
        const size = tableSizes?.[i]?.[j] ?? "";
        // Carries on the run in the joist before when that one has a piece between the same walls, the
        // same size, lined up with this one (side by side, not off in another room on the same long wall).
        // A wall end has to land at the same spot too: one wall line can jog (the pantry's corner),
        // and a joist ending on another stretch of it is in another bay.
        const before = prev.find((q) => {
          if (!q.key.startsWith(`${base}|`) || !q.key.endsWith(`~${size}`)) return false;
          const overlap = Math.min(q.b, p.b) - Math.max(q.a, p.a);
          if (!(overlap > 0.5 * Math.min(q.b - q.a, p.b - p.a))) return false;
          if (p.from !== EDGE && Math.abs(q.a - p.a) > END_SLACK) return false;
          if (p.to !== EDGE && Math.abs(q.b - p.b) > END_SLACK) return false;
          return true;
        });
        if (before) return { key: before.key, a: p.a, b: p.b };
        const n = (runs.get(base) ?? 0) + 1;
        runs.set(base, n);
        return { key: `${base}|${n}~${size}`, a: p.a, b: p.b };
      });
      prev = keys;
      return keys.map((k) => k.key);
    })
    .map((row) => row.map((k) => k.slice(0, k.lastIndexOf("~"))));
}

/**
 * Each piece's size from its own span. A joist lying on a wall (no span) takes the size of the
 * joists beside it — the one before, or (at the start) the one after.
 */
export function sizePieces(pieces: (Pick<JoistPiece, "spanFt"> & Partial<Pick<JoistPiece, "a" | "b">>)[][], sizeFor: (spanFt: number) => string | null): (string | null)[][] {
  const sizes: (string | null | undefined)[][] = pieces.map((row) => row.map((p) => (p.spanFt > 0 ? sizeFor(p.spanFt) : undefined)));
  // The size of the piece beside it in another joist: the one at the same spot along the joist, else the first known.
  const beside = (k: number, p: (typeof pieces)[number][number]) => {
    const row = sizes[k];
    if (!row) return undefined;
    const mid = p.a != null && p.b != null ? (p.a + p.b) / 2 : null;
    const j = mid == null ? -1 : pieces[k].findIndex((q) => q.a != null && q.b != null && q.a <= mid && mid <= q.b);
    return (j >= 0 ? row[j] : undefined) ?? row.find((x) => x !== undefined);
  };
  for (let i = 0; i < sizes.length; i++) if (i > 0) sizes[i] = sizes[i].map((x, j) => (x === undefined ? beside(i - 1, pieces[i][j]) : x));
  for (let i = sizes.length - 1; i >= 0; i--) sizes[i] = sizes[i].map((x, j) => (x === undefined ? beside(i + 1, pieces[i][j]) ?? sizeFor(0) : x));
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
