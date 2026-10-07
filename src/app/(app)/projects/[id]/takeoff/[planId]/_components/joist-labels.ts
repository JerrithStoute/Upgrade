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

type Cond = ConditionCalc & { id: string; name: string; color: string };

/** A run of side-by-side joists of one size in an area: how many boards at each length, and where its label goes. */
export type JoistGroup = { conditionId: string; size: string; color: string; count: number; pieces: [number, number][]; at: Pt };

/**
 * What a joist / rafter area uses, to order — the plan's labels for the area ("2x8: (10) 14' (3) 18'").
 * Joists side by side of the same size are one group, labeled over the middle of them; where an
 * area's joists are split by size (`memberOwners`, span tables), each joist counts under the size
 * takeoff it's ordered under, so the 2x8 label sits over the 2x8s and the 2x6 label over the 2x6s.
 */
export function areaJoists(c: Cond, m: MeasurementShape & { memberOwners?: string[] }, unitsPerFoot: number, condById: Map<string, Cond>): JoistGroup[] {
  const members = framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn));
  const lengths = framingLengths(c, { ...m, memberLengths: null }, unitsPerFoot);
  if (!members.length || members.length !== lengths.length) return [];
  const owners = m.memberOwners && m.memberOwners.length === lengths.length ? m.memberOwners : null;
  const runs: { cond: Cond; members: [Pt, Pt][]; pieces: Map<number, number> }[] = [];
  lengths.forEach((len, i) => {
    const owner = (owners ? condById.get(owners[i]) : null) ?? c;
    let run = runs[runs.length - 1];
    if (!run || run.cond.id !== owner.id) {
      run = { cond: owner, members: [], pieces: new Map() };
      runs.push(run);
    }
    run.members.push(members[i]);
    for (const p of stockPieces(len, parseStockLengths(owner.stockLengths), owner.soldAs)) {
      const key = Math.round(p * 10000) / 10000;
      run.pieces.set(key, (run.pieces.get(key) ?? 0) + 1);
    }
  });
  return runs.map(({ cond, members: ms, pieces }) => {
    // The middle joist of the run, at its middle.
    const [a, b] = ms[Math.floor(ms.length / 2)];
    return {
      conditionId: cond.id,
      size: cond.memberSize?.trim() || cond.name,
      color: cond.color,
      count: ms.length,
      pieces: [...pieces.entries()].sort((x, y) => y[0] - x[0]),
      at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    };
  });
}

/** "2x8: (10) 14' (3) 18'" — exact lengths (made to order) to the inch. */
export function joistGroupText(g: JoistGroup) {
  const len = (l: number) => (Number.isInteger(l) ? `${l}'` : feetInches(l));
  return `${g.size}: ${g.pieces.map(([l, n]) => `(${n}) ${len(l)}`).join(" ")}`;
}
