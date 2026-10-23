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
export type JoistGroup = { conditionId: string; size: string; color: string; count: number; pieces: [number, number][]; at: Pt; picked?: boolean };

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
  const runs: { key: string; cond: Cond; at: Pt[]; pieces: Map<number, number>; picked: boolean }[] = [];
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
        run = { key, cond, at: [], pieces: new Map(), picked: false };
        runs.push(run);
        open.set(key, run);
      }
      if (p.picked) run.picked = true;
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
  return runs.map(({ cond, at, pieces, picked }) => ({
    conditionId: cond.id,
    size: cond.memberSize?.trim() || cond.name,
    color: cond.color,
    count: at.length,
    pieces: [...pieces.entries()].sort((x, y) => y[0] - x[0]),
    // Over the middle joist of the run, at the middle of its piece.
    at: at[Math.floor(at.length / 2)],
    picked,
  }));
}

/** Where a piece runs on the plan: from `a` to `b` of the way along its joist. */
export function pieceLine([a, b]: [Pt, Pt], p: { a: number; b: number }): [Pt, Pt] {
  return [
    [a[0] + (b[0] - a[0]) * p.a, a[1] + (b[1] - a[1]) * p.a],
    [a[0] + (b[0] - a[0]) * p.b, a[1] + (b[1] - a[1]) * p.b],
  ];
}

/** "2x8: (10) 14' (3) 18'" — made-to-order lengths in even feet. A size you picked for the bay gets a ✎. */
export function joistGroupText(g: JoistGroup) {
  const len = (l: number) => (Number.isInteger(l) ? `${l}'` : feetInches(l));
  return `${g.size}${g.picked ? " ✎" : ""}: ${g.pieces.map(([l, n]) => `(${n}) ${len(l)}`).join(" ")}`;
}

/**
 * The bay of a joist area under a point (joist-sections.ts): the piece nearest it, if it's within
 * half a joist spacing. Null off the joists, or when the area isn't broken into bays.
 */
export function bayAt(c: Cond, m: MeasurementShape & { memberPieces?: MemberPiece[][] }, p: Pt, unitsPerFoot: number): string | null {
  const members = framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn));
  const rows = m.memberPieces && m.memberPieces.length === members.length ? m.memberPieces : null;
  if (!rows) return null;
  let best: string | null = null;
  let bestD = ((c.spacing / 12) * unitsPerFoot) / 2 + unitsPerFoot / 12;
  rows.forEach((row, i) =>
    row.forEach((piece) => {
      if (!piece.section) return;
      const [a, b] = pieceLine(members[i], piece);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
      if (d < bestD) {
        bestD = d;
        best = piece.section;
      }
    }),
  );
  return best;
}

/**
 * The outline of a bay (joist-sections.ts): around its joists' pieces, half a joist spacing out on
 * each side — what the plan draws around the bay you picked. One outline per run of side-by-side
 * joists (a bay is one run).
 */
export function bayOutline(members: [Pt, Pt][], rows: MemberPiece[][] | null, key: string, half: number): Pt[] {
  if (!rows) return [];
  const starts: Pt[] = [];
  const ends: Pt[] = [];
  let n: Pt = [0, 0];
  rows.forEach((row, i) => {
    const piece = row.find((p) => p.section === key);
    if (!piece || !members[i]) return;
    const [a, b] = pieceLine(members[i], piece);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    n = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    starts.push(a);
    ends.push(b);
  });
  if (!starts.length) return [];
  // Out half a spacing past the first and last joist, so the outline sits between joists.
  const out = (p: Pt, s: number): Pt => [p[0] + n[0] * half * s, p[1] + n[1] * half * s];
  const first = 0;
  const last = starts.length - 1;
  // Which way across the joists the rows go (first to last).
  const dir = Math.sign((starts[last][0] - starts[first][0]) * n[0] + (starts[last][1] - starts[first][1]) * n[1]) || 1;
  return [out(starts[first], -dir), ...starts, out(starts[last], dir), out(ends[last], dir), ...[...ends].reverse(), out(ends[first], -dir)];
}

const areaMembers = (c: Cond, m: MeasurementShape, unitsPerFoot: number) =>
  framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn));

/** A break in a joist area — where its joists meet over a wall in two lapped pieces — under a point. */
export type JoistBreak = {
  wall: string;
  at: Pt;
  /** The longest one board would be with the joists run on through it (two pieces end to end), feet. */
  joinedFt: number;
  /** The size takeoffs those pieces are ordered under. */
  owners: string[];
};

/** The break nearest a point, within about a foot of it. */
export function breakAt(c: Cond, m: MeasurementShape & { memberPieces?: MemberPiece[][] }, p: Pt, unitsPerFoot: number): JoistBreak | null {
  const members = areaMembers(c, m, unitsPerFoot);
  const rows = m.memberPieces && m.memberPieces.length === members.length ? m.memberPieces : null;
  if (!rows) return null;
  let best: JoistBreak | null = null;
  let bestD = Math.max(unitsPerFoot, ((c.spacing / 12) * unitsPerFoot) / 2);
  rows.forEach((row, i) =>
    row.forEach((piece, j) => {
      const next = row[j + 1];
      const wall = piece.section?.split("|")[1];
      if (!next || !wall || wall === "edge" || next.section?.split("|")[0] !== wall) return;
      const [, at] = pieceLine(members[i], piece);
      const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
      if (d < bestD) {
        bestD = d;
        best = { wall, at, joinedFt: 0, owners: [] };
      }
    }),
  );
  if (!best) return null;
  const found = best as JoistBreak;
  // Every joist broken on that wall: how long it would be as one board, and its size.
  rows.forEach((row) =>
    row.forEach((piece, j) => {
      const next = row[j + 1];
      if (!next || piece.section?.split("|")[1] !== found.wall || next.section?.split("|")[0] !== found.wall) return;
      found.joinedFt = Math.max(found.joinedFt, piece.length + next.length);
      for (const o of [piece.owner, next.owner]) if (!found.owners.includes(o)) found.owners.push(o);
    }),
  );
  return found;
}

/** A wall the area's joists run through (joined over it), near a point — `walls`: the sheet's walls and beams by id. */
export function throughAt(c: Cond, m: MeasurementShape & { memberPieces?: MemberPiece[][] }, p: Pt, unitsPerFoot: number, walls: Map<string, Pt[]>): { wall: string; at: Pt } | null {
  const over = new Set((m.memberPieces ?? []).flat().flatMap((piece) => piece.over ?? []));
  let best: { wall: string; at: Pt } | null = null;
  let bestD = Math.max(unitsPerFoot, ((c.spacing / 12) * unitsPerFoot) / 2);
  for (const id of over) {
    const pts = walls.get(id) ?? [];
    for (let k = 1; k < pts.length; k++) {
      const [a, b] = [pts[k - 1], pts[k]];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const q: Pt = [a[0] + dx * t, a[1] + dy * t];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < bestD) {
        bestD = d;
        best = { wall: id, at: q };
      }
    }
  }
  return best;
}

/**
 * The joist or rafter (one piece of it, where they're broken at walls) under a point: its length as
 * ordered (lap, overhang and pitch in) and the size takeoff it's ordered under — for the hover tag.
 */
export function memberAt(c: Cond, m: MeasurementShape & { memberPieces?: MemberPiece[][] }, p: Pt, unitsPerFoot: number): { length: number; owner: string } | null {
  const members = areaMembers(c, m, unitsPerFoot);
  if (!members.length) return null;
  const split = m.memberPieces && m.memberPieces.length === members.length ? m.memberPieces : null;
  const lengths = split ? null : framingLengths(c, { ...m, memberLengths: null }, unitsPerFoot);
  const rows: MemberPiece[][] = split ?? members.map((_, i) => [{ a: 0, b: 1, owner: c.id, length: lengths?.[i] ?? 0 }]);
  let best: { length: number; owner: string } | null = null;
  let bestD = ((c.spacing / 12) * unitsPerFoot) / 2;
  rows.forEach((row, i) =>
    row.forEach((piece) => {
      const [a, b] = pieceLine(members[i], piece);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
      if (d < bestD) {
        bestD = d;
        best = { length: piece.length, owner: piece.owner };
      }
    }),
  );
  return best;
}
