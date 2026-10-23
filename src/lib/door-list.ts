import { readItemDetails, readSizeCode, sizeCode, withDetail, type WindowDetail } from "./window-list";

/**
 * Doors, the way they're bid — like windows (window-list.ts): a size ("2868"), interior or exterior, the
 * type, the jamb width and the core, plus any details a company adds of its own (Settings → Doors: "Door
 * Swing" typed in). Each door a job uses is an Item List item (kind "doors") named from those, so the
 * material list, estimate, bids and wall openings carry on as they are; the job keeps a short list of
 * them to pick from (Project.doorList).
 */

export type DoorDetail = WindowDetail;
export type JobDoors = { lines: string[] };

/** Every door type in the dropdown (anything else: Other…, typed in). */
export const DOOR_TYPES = ["Prehung", "Slab", "Barn", "Pocket", "Bifold", "Bypass", "French", "Sliding Glass", "Entry", "Dutch", "Attic Access"];

export const DOOR_JAMBS = ["2x4", "2x6", "2x8"] as const;
export const DOOR_CORES = ["Hollow", "Solid"] as const;
export type DoorJamb = (typeof DOOR_JAMBS)[number];
export type DoorCore = (typeof DOOR_CORES)[number];

export const readJamb = (s: string | null | undefined): DoorJamb => DOOR_JAMBS.find((j) => j === s) ?? "2x4";
export const readCore = (s: string | null | undefined): DoorCore => DOOR_CORES.find((c) => c === s) ?? "Hollow";

/** How many doors a job's list holds — plenty; keys 1–9 pick the first nine. */
export const MAX_DOOR_LINES = 40;

/** A new detail on the company's door list — or why not. */
export const withDoorDetail = (list: DoorDetail[], rawName: string, kind: string) =>
  withDetail(list, rawName, kind, {
    noun: "door",
    settings: "Settings → Doors",
    builtIn: ["size", "type", "jamb", "core", "int", "ext", "interior", "exterior", "hollow", "solid"],
    example: "Door Swing",
  });

export { readSizeCode, sizeCode, readItemDetails };
export { readWindowDetails as readDoorDetails } from "./window-list";

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

/** A door's own choices, kept in its Item List details alongside the company's ("Jamb": "2x6", "Core": "Solid"). */
export const JAMB_KEY = "Jamb";
export const CORE_KEY = "Core";

/** What the company's details add to a door's name: the name when yes, "Door Swing LH" when typed. */
function detailWords(details: DoorDetail[], values: Record<string, string>) {
  return details
    .map((d) => {
      const v = values[d.name]?.trim();
      if (!v) return null;
      if (d.kind === "yesno") return v.toLowerCase() === "yes" ? d.name : null;
      return `${d.name} ${v}`;
    })
    .filter(Boolean) as string[];
}

/** A door's Item List name: "2868 Int Prehung Hollow 2x4 Jamb", "3068 Ext Entry Solid 2x6 Jamb Door Swing LH". */
export function doorName(o: {
  widthIn: number;
  heightIn: number;
  exterior: boolean;
  type: string;
  jamb: DoorJamb;
  core: DoorCore;
  details?: DoorDetail[];
  values?: Record<string, string>;
}) {
  return [
    sizeCode(o.widthIn, o.heightIn),
    o.exterior ? "Ext" : "Int",
    o.type.trim() || "Door",
    o.core,
    `${o.jamb} Jamb`,
    ...detailWords(o.details ?? [], o.values ?? {}),
  ].join(" ");
}
