/**
 * Windows, the way they're bid: a size, a type and a color — plus any details a company adds of
 * its own (Settings → Windows: "Grids" yes / no, "Glass" typed in). Each window a job uses is an Item
 * List item (kind "windows") named from those, so the material list, estimate and bids carry on as
 * they are; the job keeps a short list of them to pick from (Project.windowList).
 */

export type WindowDetail = { name: string; kind: "yesno" | "text" };
export type JobWindows = { lines: string[] };

/**
 * The colors a window comes in: Standard (white), White/Black (white inside, black outside — the
 * upcharge) and Black/Black. `name`: what the window's name ends with (nothing for Standard).
 */
export const WINDOW_COLORS = [
  { value: "Standard", label: "Standard (white)", name: "" },
  { value: "White/Black", label: "White on black (white inside, black outside)", name: "White/Black" },
  { value: "Black/Black", label: "Black on black", name: "Black/Black" },
] as const;
export type WindowColor = (typeof WINDOW_COLORS)[number]["value"];
export const readColor = (s: string | null | undefined): WindowColor => WINDOW_COLORS.find((c) => c.value === s)?.value ?? "Standard";

/** Every window type in the dropdown (anything else: Other…, typed in). */
export const WINDOW_TYPES = [
  "Single Hung",
  "Double Hung",
  "Picture",
  "Casement",
  "Slider",
  "Transom",
  "Arched",
  "Mulled Unit",
  "Fixed",
  "Awning",
  "Hopper",
  "Bay",
  "Bow",
  "Garden",
  "Glass Block",
];

/**
 * A new detail on the company's list — or why not: no name, one every window has already, a repeat, or
 * past 8. (Settings → Windows, and "+ Add a detail" while adding a window.)
 */
export function withDetail(list: WindowDetail[], rawName: string, kind: string): WindowDetail[] | string {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return "Name the detail, like Grids";
  if (["size", "type", "black", "color"].includes(name.toLowerCase())) return `Every window already has ${name.toLowerCase()}`;
  if (list.some((d) => d.name.toLowerCase() === name.toLowerCase())) return `There's already a ${name}`;
  if (list.length >= 8) return "That's 8 details — take one off in Settings → Windows first";
  return [...list, { name, kind: kind === "text" ? "text" : "yesno" }];
}

/** How many windows a job's list holds (keys 1–9). */
export const MAX_LINES = 9;

const json = (s: string | null | undefined): unknown => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export function readWindowDetails(s: string | null | undefined): WindowDetail[] {
  const v = json(s);
  if (!Array.isArray(v)) return [];
  return v
    .filter((d): d is { name: string; kind?: string } => !!d && typeof d.name === "string" && !!d.name.trim())
    .map((d) => ({ name: d.name.trim().slice(0, 40), kind: d.kind === "text" ? ("text" as const) : ("yesno" as const) }))
    .slice(0, 8);
}

export function readJobWindows(s: string | null | undefined): JobWindows {
  const v = json(s) as { lines?: unknown } | null;
  return {
    lines: Array.isArray(v?.lines) ? Array.from(new Set(v.lines.filter((x): x is string => typeof x === "string"))).slice(0, MAX_LINES) : [],
  };
}

export function readItemDetails(s: string | null | undefined): Record<string, string> {
  const v = json(s);
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string" && x.trim()) as [string, string][]);
}

/**
 * A window size as builders write it — "3050" is 3'0" wide by 5'0" tall, "2868" 2'8" by 6'8" — or in
 * inches, "36x60". Null when it isn't a size.
 */
export function readSizeCode(raw: string): { widthIn: number; heightIn: number } | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  const code = /^(\d)(\d{1,2})(\d)(\d{1,2})$/.exec(t);
  if (/^\d{4}$/.test(t) && code) {
    const [w, h] = [Number(t[0]) * 12 + Number(t[1]), Number(t[2]) * 12 + Number(t[3])];
    return w > 0 && h > 0 ? { widthIn: w, heightIn: h } : null;
  }
  const inches = /^(\d{1,3}(?:\.\d+)?)["]?x(\d{1,3}(?:\.\d+)?)["]?$/.exec(t);
  if (inches) {
    const [w, h] = [Number(inches[1]), Number(inches[2])];
    return w >= 6 && h >= 6 && w <= 240 && h <= 240 ? { widthIn: w, heightIn: h } : null;
  }
  return null;
}

/** The size the usual way: 36 × 60 → "3050", 32 × 80 → "2868" (feet, then inches, wide then tall). */
export function sizeCode(widthIn: number, heightIn: number) {
  const part = (i: number) => `${Math.floor(i / 12)}${Math.round(i - Math.floor(i / 12) * 12)}`;
  return `${part(widthIn)}${part(heightIn)}`;
}

/** What a detail adds to a window's name: "Grids" when yes, "Glass Low-E" when typed. */
function detailWords(details: WindowDetail[], values: Record<string, string>) {
  return details
    .map((d) => {
      const v = values[d.name]?.trim();
      if (!v) return null;
      if (d.kind === "yesno") return v.toLowerCase() === "yes" ? d.name : null;
      return `${d.name} ${v}`;
    })
    .filter(Boolean) as string[];
}

/** A window's Item List name: "3050 Single Hung", "3050 Single Hung White/Black", "5040 Picture Black/Black Grids". */
export function windowName(o: { widthIn: number; heightIn: number; type: string; color: WindowColor; details?: WindowDetail[]; values?: Record<string, string> }) {
  const color = WINDOW_COLORS.find((c) => c.value === o.color)?.name ?? "";
  return [sizeCode(o.widthIn, o.heightIn), o.type.trim() || "Window", color || null, ...detailWords(o.details ?? [], o.values ?? {})].filter(Boolean).join(" ");
}

/** The bid list: one line per window on the job's list, with how many — in the list's order. */
export function bidList<T extends { id: string }>(lines: T[], counts: Map<string, number>) {
  return lines.map((l, i) => ({ key: i + 1, ...l, count: counts.get(l.id) ?? 0 }));
}
