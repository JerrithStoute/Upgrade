import {
  feetInches,
  framingLengths,
  framingMembers,
  memberThickness,
  parseStockLengths,
  shapePath,
  stockPieces,
  type ConditionCalc,
  type MeasurementShape,
  type Pt,
} from "@/lib/takeoff";
import type { MemberPiece } from "@/lib/joist-pieces";

type Cond = ConditionCalc & { id: string; name: string; color: string };

/** A run of side-by-side joists of one size in an area: how many boards at each length, and where its label goes. */
export type JoistGroup = { conditionId: string; size: string; color: string; count: number; pieces: [number, number][]; at: Pt };

/**
 * What a joist / rafter area uses, to order — the plan's labels for the area ("2x8: (10) 14' (3) 18'").
 * Pieces side by side of the same size are one group, labeled over the middle of them. Where joists
 * are broken at walls (`memberPieces`, joist-pieces.ts), each side of the wall is its own group, over
 * its own pieces; on a span table each piece counts under the size takeoff it's ordered under.
 */
export function areaJoists(c: Cond, m: MeasurementShape & { memberPieces?: MemberPiece[][] }, unitsPerFoot: number, condById: Map<string, Cond>): JoistGroup[] {
  const members = framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn));
  if (!members.length) return [];
  const split = m.memberPieces && m.memberPieces.length === members.length ? m.memberPieces : null;
  const lengths = split ? null : framingLengths(c, { ...m, memberLengths: null }, unitsPerFoot);
  if (lengths && lengths.length !== members.length) return [];
  const rows: MemberPiece[][] = split ?? lengths!.map((length) => [{ a: 0, b: 1, owner: c.id, length }]);
  // Runs of side-by-side joists whose pieces line up (same size, same side of the wall).
  const runs: { key: string; cond: Cond; at: Pt[]; pieces: Map<number, number> }[] = [];
  const open = new Map<string, (typeof runs)[number]>();
  rows.forEach((row, i) => {
    const [a, b] = members[i];
    const seen = new Set<string>();
    row.forEach((p, j) => {
      const cond = condById.get(p.owner) ?? c;
      const key = `${cond.id}|${j}/${row.length}`;
      seen.add(key);
      let run = open.get(key);
      if (!run) {
        run = { key, cond, at: [], pieces: new Map() };
        runs.push(run);
        open.set(key, run);
      }
      const mid = (p.a + p.b) / 2;
      run.at.push([a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid]);
      for (const piece of stockPieces(p.length, parseStockLengths(cond.stockLengths), cond.soldAs)) {
        const k = Math.round(piece * 10000) / 10000;
        run.pieces.set(k, (run.pieces.get(k) ?? 0) + 1);
      }
    });
    // A run ends where the next joist doesn't continue it.
    for (const k of [...open.keys()]) if (!seen.has(k)) open.delete(k);
  });
  return runs.map(({ cond, at, pieces }) => ({
    conditionId: cond.id,
    size: cond.memberSize?.trim() || cond.name,
    color: cond.color,
    count: at.length,
    pieces: [...pieces.entries()].sort((x, y) => y[0] - x[0]),
    // Over the middle joist of the run, at the middle of its piece.
    at: at[Math.floor(at.length / 2)],
  }));
}

/** Where a piece runs on the plan: from `a` to `b` of the way along its joist. */
export function pieceLine([a, b]: [Pt, Pt], p: { a: number; b: number }): [Pt, Pt] {
  return [
    [a[0] + (b[0] - a[0]) * p.a, a[1] + (b[1] - a[1]) * p.a],
    [a[0] + (b[0] - a[0]) * p.b, a[1] + (b[1] - a[1]) * p.b],
  ];
}

/** "2x8: (10) 14' (3) 18'" — exact lengths (made to order) to the inch. */
export function joistGroupText(g: JoistGroup) {
  const len = (l: number) => (Number.isInteger(l) ? `${l}'` : feetInches(l));
  return `${g.size}: ${g.pieces.map(([l, n]) => `(${n}) ${len(l)}`).join(" ")}`;
}
