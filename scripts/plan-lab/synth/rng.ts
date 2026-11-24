/** A seeded random number source: the same seed always draws the same plan (so a plan can be deleted and made again). */
export type Rng = {
  /** 0 ≤ n < 1 */
  f(): number;
  /** a whole number lo..hi (both included) */
  int(lo: number, hi: number): number;
  /** lo..hi in steps of `step` */
  step(lo: number, hi: number, step?: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(list: T[]): T[];
};

export function rng(seed: number): Rng {
  let s = (seed * 2654435761) >>> 0 || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(f() * (hi - lo + 1));
  return {
    f,
    int,
    step: (lo, hi, st = 6) => lo + st * int(0, Math.max(0, Math.floor((hi - lo) / st))),
    pick: (list) => list[Math.floor(f() * list.length)],
    chance: (p) => f() < p,
    shuffle: (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
  };
}
