import { readSizeCode, sizeCode } from "./window-list";

/**
 * Doors on a job, like windows (window-list.ts): the short list to pick from while counting
 * (Project.doorList — Item List ids, in order). What a door is described by, and its name, is in
 * unit-parts.ts (Catalog → Doors).
 */

export type JobDoors = { lines: string[] };

/** How many doors a job's list holds — plenty; keys 1–9 pick the first nine. */
export const MAX_DOOR_LINES = 40;

export function readJobDoors(s: string | null | undefined): JobDoors {
  let v: { lines?: unknown } | null = null;
  try {
    v = s ? JSON.parse(s) : null;
  } catch {
    v = null;
  }
  return {
    lines: Array.isArray(v?.lines) ? Array.from(new Set(v.lines.filter((x): x is string => typeof x === "string"))).slice(0, MAX_DOOR_LINES) : [],
  };
}

export { readSizeCode, sizeCode };
