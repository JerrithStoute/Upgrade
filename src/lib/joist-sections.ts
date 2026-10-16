/**
 * Your calls on single bays of a joist / rafter area. An area drawn across walls is broken at
 * them (joist-pieces.ts) and each bay sized by the span table — the cheapest way. Bay by bay you
 * can change that, without redrawing: a bigger size for one bay (an attic you walk, strongbacks),
 * or run the joists on through a wall as one longer board (fewer to hang).
 *
 * A bay is a run of side-by-side joists between the same two walls (or beams) — "edge" where it's
 * the area's own edge — at the same span-table size, named by those walls (and numbered when there's
 * more than one such run), so your call stays with it when the outline or a wall is nudged. A wall
 * that's deleted takes its calls with it.
 *
 * Kept on the shape (TakeoffMeasurement.sections) as JSON: { sizes: { "<from>|<to>|<run>": "2x8" },
 * through: ["<wall id>"], breaks: ["<wall id>"] }.
 */

export type JoistSections = {
  /** A bay's size, picked by you (the member size's name), by bay. */
  sizes: Record<string, string>;
  /** Walls or beams the joists run through (one board over it, not broken there). */
  through: string[];
  /** Walls the joists are always broken on — "Cheapest" packing doesn't join them over these. */
  breaks: string[];
};

export const EDGE = "edge";

/** A bay's name: the supports on its two sides, in the joists' direction, and which run between them it is (bayKeys in joist-pieces.ts). */
export const sectionKey = (from: string, to: string, run = 1) => `${from}|${to}|${run}`;
/** A bay's two sides, from its name. */
export const bayWalls = (key: string): [string, string] => {
  const [from = EDGE, to = EDGE] = key.split("|");
  return [from, to];
};

export function parseSections(json: string | null | undefined): JoistSections {
  const empty: JoistSections = { sizes: {}, through: [], breaks: [] };
  if (!json) return empty;
  try {
    const raw = JSON.parse(json) as Partial<JoistSections>;
    const sizes: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.sizes ?? {})) if (typeof v === "string" && v.trim() && k.includes("|")) sizes[k] = v.trim().slice(0, 80);
    const walls = (list: unknown) => (Array.isArray(list) ? [...new Set(list.filter((t): t is string => typeof t === "string" && !!t && t !== EDGE))] : []);
    return { sizes, through: walls(raw.through), breaks: walls(raw.breaks) };
  } catch {
    return empty;
  }
}

/** Stored form — null when there's nothing of yours. */
export function sectionsJson(s: JoistSections): string | null {
  const sizes = Object.fromEntries(Object.entries(s.sizes).filter(([, v]) => v));
  const through = [...new Set(s.through)];
  const breaks = [...new Set(s.breaks)];
  return Object.keys(sizes).length || through.length || breaks.length ? JSON.stringify({ sizes, through, ...(breaks.length ? { breaks } : {}) }) : null;
}

/** One change to an area's bays: a size for one bay (null = back to the table / the takeoff), or a wall run through (or broken again). */
export function changeSections(s: JoistSections, change: { section: string; size?: string | null } | { wall: string; through: boolean }): JoistSections {
  if ("wall" in change) {
    // Run through: one board over it. Break: broken there — and kept broken (Cheapest packing doesn't join it again).
    const through = change.through ? [...new Set([...s.through, change.wall])] : s.through.filter((w) => w !== change.wall);
    const breaks = change.through ? s.breaks.filter((w) => w !== change.wall) : [...new Set([...s.breaks, change.wall])];
    return { ...s, through, breaks };
  }
  const sizes = { ...s.sizes };
  if (change.size) sizes[change.section] = change.size;
  else delete sizes[change.section];
  return { ...s, sizes };
}
