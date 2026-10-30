import { readSizeCode, sizeCode } from "./window-list";

/**
 * What a door or a window is described by — its "parts" (Catalog → Doors / Windows). Each company picks:
 * which parts are asked when one is added to a job, each part's choices (picked, never typed, so the same
 * door gets the same name on every job), the usual choice, and whether the part is in the name always or
 * only when it isn't the usual ("3068 Ext Prehung Metal", every wood door just "… Prehung").
 *
 * The name a door or window gets comes only from here, and an Item List item by that name is the one
 * used — so with the same picks it's the same item, job after job. With the parts as they start, names
 * are exactly what they were before parts could be changed ("2868 Int Prehung Hollow 2x4 Jamb",
 * "3050 Single Hung White/Black"). No database here — tested in unit-parts.test.ts.
 *
 * Where each part's pick is kept on the Item List item: Int / Ext → `exterior`, Type → `style`,
 * Color → `color`, everything else → `details` (JSON, by the part's key: "Jamb", "Core", "Grids"…).
 */

export type UnitKind = "door" | "window";

export type UnitPart = {
  /** Built in: "ext", "type", "color", "Jamb", "Core". Your own: its name. */
  key: string;
  name: string;
  /** Picked from its choices, or a yes / no (in the name as its own name when Yes: "Grids"). */
  kind: "pick" | "yesno";
  builtIn: boolean;
  /** Asked when a door / window is added. Off: never asked, and not in the name. */
  ask: boolean;
  choices: string[];
  /** Picked to start with; "" = left blank until picked (a part from before choices). */
  usual: string;
  /** In the name every time, or only when it isn't the usual choice. */
  inName: "always" | "unusual";
  /** How it reads in the name: "Metal", "Glass Low-E", "2x6 Jamb". */
  word: "value" | "name value" | "value name";
};

export type UnitParts = {
  parts: UnitPart[];
  /** Item pairs "id|id" marked "Not the same" (duplicates cleanup). */
  notSame: string[];
  /**
   * Names merged away (duplicates cleanup), by name key → the item kept: picks that make "2868 Int Prehung
   * Hollow 2x4 Jamb" again use "2868 Hollow Core" when that's the one you kept, not a new one.
   */
  aliases: Record<string, string>;
};

/** Every door type to start with (more are added as choices). */
export const DOOR_TYPES = ["Prehung", "Slab", "Barn", "Pocket", "Bifold", "Bypass", "French", "Sliding Glass", "Entry", "Dutch", "Attic Access"];
/** Every window type to start with. */
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

export const MAX_OWN_PARTS = 8;
export const MAX_CHOICES = 40;
const NAME_MAX = 40;

const part = (p: Partial<UnitPart> & Pick<UnitPart, "key" | "name" | "choices" | "usual">): UnitPart => ({
  kind: "pick",
  builtIn: true,
  ask: true,
  inName: "always",
  word: "value",
  ...p,
});

/** A door's parts as every company starts. */
export function defaultParts(kind: UnitKind): UnitPart[] {
  return kind === "door"
    ? [
        part({ key: "ext", name: "Int / Ext", choices: ["Int", "Ext"], usual: "Int" }),
        part({ key: "type", name: "Type", choices: DOOR_TYPES, usual: "Prehung" }),
        part({ key: "Core", name: "Core", choices: ["Hollow", "Solid"], usual: "Hollow" }),
        part({ key: "Jamb", name: "Jamb", choices: ["2x4", "2x6", "2x8"], usual: "2x4", word: "value name" }),
      ]
    : [
        part({ key: "type", name: "Type", choices: WINDOW_TYPES, usual: "Single Hung" }),
        part({ key: "color", name: "Color", choices: ["Standard", "White/Black", "Black/Black"], usual: "Standard", inName: "unusual" }),
      ];
}

/** Int / Ext is always asked (it files the door under interior or exterior, for cost codes and the bid list) and its two choices are fixed. */
export const lockedAsk = (p: UnitPart) => p.key === "ext";
export const lockedChoices = (p: UnitPart) => p.key === "ext" || p.kind === "yesno";

/** A choice or name as kept: trimmed, single-spaced, not too long. */
export const tidy = (s: unknown, max = NAME_MAX) =>
  String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const json = (s: string | null | undefined): unknown => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

/**
 * The company's parts, from what's saved (Company.doorDetails / windowDetails). Saved before parts could be
 * changed — a list of { name, kind } details — it's the parts as every company starts plus those details:
 * a yes / no stays one, a typed-in one becomes a part to pick (its choices filled from the values already
 * used — see `withUsedChoices`). `migrated` says it was the old kind (to save it the new way).
 */
export function readParts(kind: UnitKind, raw: string | null | undefined): UnitParts & { migrated: boolean } {
  const v = json(raw);
  const base = defaultParts(kind);
  if (Array.isArray(v) || v == null) {
    const own = (Array.isArray(v) ? v : [])
      .filter((d): d is { name: string; kind?: string } => !!d && typeof d.name === "string" && !!tidy(d.name))
      .slice(0, MAX_OWN_PARTS)
      .map((d) => ownPart(tidy(d.name), d.kind === "text" ? "text" : "yesno"));
    return { parts: [...base, ...own], notSame: [], aliases: {}, migrated: v != null };
  }
  const o = v as { parts?: unknown; notSame?: unknown; aliases?: unknown };
  const saved = Array.isArray(o.parts) ? (o.parts as Partial<UnitPart>[]) : [];
  const aliases =
    o.aliases && typeof o.aliases === "object" && !Array.isArray(o.aliases)
      ? (Object.fromEntries(Object.entries(o.aliases as Record<string, unknown>).filter(([, id]) => typeof id === "string").slice(0, 2000)) as Record<string, string>)
      : {};
  return {
    parts: cleanParts(kind, saved),
    notSame: Array.isArray(o.notSame) ? o.notSame.filter((x): x is string => typeof x === "string").slice(0, 2000) : [],
    aliases,
    migrated: false,
  };
}

/** A part of your own: a yes / no, a pick list, or one carried over from typed-in details (its name goes in front: "Glass Low-E"). */
export function ownPart(name: string, as: "yesno" | "pick" | "text"): UnitPart {
  if (as === "yesno") return { key: name, name, kind: "yesno", builtIn: false, ask: true, choices: ["Yes", "No"], usual: "No", inName: "unusual", word: "value" };
  return { key: name, name, kind: "pick", builtIn: false, ask: true, choices: [], usual: "", inName: "always", word: as === "text" ? "name value" : "value" };
}

/** Parts as saved or sent from the Catalog page, checked: every built-in one there (in its place), yours after, nothing out of bounds. */
export function cleanParts(kind: UnitKind, input: Partial<UnitPart>[]): UnitPart[] {
  const base = defaultParts(kind);
  const byKey = new Map(input.filter((p) => p && typeof p.key === "string").map((p) => [p.key as string, p]));
  const fix = (def: UnitPart, p: Partial<UnitPart> | undefined): UnitPart => {
    const kindOf = def.builtIn ? def.kind : p?.kind === "yesno" ? "yesno" : "pick";
    let choices =
      kindOf === "yesno" ? ["Yes", "No"] : def.key === "ext" ? def.choices : dedupe((Array.isArray(p?.choices) ? p!.choices : def.choices).map((c) => tidy(c))).slice(0, MAX_CHOICES);
    if (kindOf === "pick" && def.builtIn && !choices.length) choices = def.choices;
    const usualIn = tidy(p?.usual ?? def.usual);
    const usual = choices.find((c) => same(c, usualIn)) ?? (kindOf === "yesno" ? "No" : def.builtIn ? choices[0] : "");
    return {
      ...def,
      kind: kindOf,
      ask: lockedAsk(def) ? true : p?.ask === undefined ? def.ask : !!p.ask,
      choices,
      usual,
      inName: p?.inName === "unusual" || p?.inName === "always" ? p.inName : def.inName,
      word: def.builtIn ? def.word : p?.word === "name value" || p?.word === "value name" ? p.word : "value",
    };
  };
  const builtIns = base.map((d) => fix(d, byKey.get(d.key)));
  const taken = new Set(["size", ...base.map((d) => d.name.toLowerCase()), ...base.map((d) => d.key.toLowerCase()), "int", "ext", "interior", "exterior"]);
  const own: UnitPart[] = [];
  for (const p of input) {
    if (!p || p.builtIn || base.some((d) => d.key === p.key)) continue;
    const name = tidy(p.name ?? p.key);
    if (!name || taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    own.push(fix(ownPart(name, p.kind === "yesno" ? "yesno" : "pick"), { ...p, key: name }));
    if (own.length >= MAX_OWN_PARTS) break;
  }
  return [...builtIns, ...own];
}

const dedupe = (list: string[]) => {
  const out: string[] = [];
  for (const c of list) if (c && !out.some((x) => same(x, c))) out.push(c);
  return out;
};

/** The parts saved the new way (Company.doorDetails / windowDetails). */
export const writeParts = (p: UnitParts) => JSON.stringify({ v: 2, parts: p.parts, notSame: p.notSame, aliases: p.aliases });

/** After a merge: the dropped one's name (and any merged into it before) lead to the one kept. */
export function withAlias(p: UnitParts, droppedKey: string, droppedId: string, keptId: string): UnitParts {
  const aliases = Object.fromEntries(Object.entries(p.aliases).map(([k, id]) => [k, id === droppedId ? keptId : id]));
  aliases[droppedKey] = keptId;
  return { ...p, aliases };
}

/**
 * Choices already used on the Item List, added to the parts that have them — once, when parts are first read
 * the new way: a type typed in with Other… before ("Fixed with 2 1640 sh sidelights") is one pick away now.
 */
export function withUsedChoices(parts: UnitPart[], used: Record<string, string>[]): UnitPart[] {
  return parts.map((p) => {
    if (p.kind !== "pick" || p.key === "ext") return p;
    const add = used.map((v) => tidy(v[p.key])).filter(Boolean);
    return { ...p, choices: dedupe([...p.choices, ...add]).slice(0, MAX_CHOICES) };
  });
}

/** A new choice on a part — or the one it already has by that name ("metal" when there's "Metal"). */
export function withChoice(parts: UnitPart[], key: string, raw: string): { parts: UnitPart[]; value: string } | string {
  const p = parts.find((x) => x.key === key);
  if (!p) return "That part isn't there any more — reload the page";
  if (lockedChoices(p)) return `${p.name} has fixed choices`;
  const value = tidy(raw);
  if (!value) return "Type the choice";
  const had = p.choices.find((c) => same(c, value));
  if (had) return { parts, value: had };
  if (p.choices.length >= MAX_CHOICES) return `${p.name} has ${MAX_CHOICES} choices — take one off in the Catalog first`;
  return { parts: parts.map((x) => (x === p ? { ...x, choices: [...x.choices, value] } : x)), value };
}

/** What each part is picked as to start with: its usual choice. */
export const usualValues = (parts: UnitPart[]) => Object.fromEntries(parts.filter((p) => p.ask).map((p) => [p.key, p.usual]));

/** Picks as sent, checked: only the parts asked, each one of its choices ("" where a part may stay blank). */
export function cleanValues(parts: UnitPart[], input: Record<string, unknown>): Record<string, string> | string {
  const out: Record<string, string> = {};
  for (const p of parts) {
    if (!p.ask) continue;
    const v = tidy(input?.[p.key]);
    if (!v) {
      if (p.kind === "yesno") out[p.key] = "No";
      else if (p.usual === "") continue;
      else return `Pick the ${p.name.toLowerCase()}`;
      continue;
    }
    const c = p.choices.find((x) => same(x, v));
    if (!c) return `"${v}" isn't one of the ${p.name.toLowerCase()} choices — add it first`;
    out[p.key] = c;
  }
  return out;
}

/** The words a door's or window's picks put in its name, in the parts' order. */
export function nameWords(parts: UnitPart[], values: Record<string, string>) {
  const words: string[] = [];
  for (const p of parts) {
    if (!p.ask) continue;
    const v = values[p.key] ?? "";
    if (p.kind === "yesno") {
      if (v === "Yes") words.push(p.name);
      continue;
    }
    if (!v || (p.inName === "unusual" && v === p.usual)) continue;
    words.push(p.word === "name value" ? `${p.name} ${v}` : p.word === "value name" ? `${v} ${p.name}` : v);
  }
  return words;
}

/** Its Item List name: "2868 Int Prehung Hollow 2x4 Jamb", "3050 Single Hung White/Black", "3068 Ext Prehung Metal". */
export function unitName(kind: UnitKind, parts: UnitPart[], size: { widthIn: number; heightIn: number }, values: Record<string, string>) {
  const words = nameWords(parts, values);
  return [sizeCode(size.widthIn, size.heightIn), ...(words.length ? words : [kind === "door" ? "Door" : "Window"])].join(" ");
}

/** An Item List door's / window's picks, from where each is kept on it. */
export function itemValues(item: { exterior?: boolean | null; style?: string | null; color?: string | null; details?: string | null }): Record<string, string> {
  const d = json(item.details);
  const details =
    d && typeof d === "object" && !Array.isArray(d)
      ? (Object.fromEntries(Object.entries(d as Record<string, unknown>).filter(([, x]) => typeof x === "string" && x.trim())) as Record<string, string>)
      : {};
  return {
    ...details,
    ...(item.exterior == null ? {} : { ext: item.exterior ? "Ext" : "Int" }),
    ...(item.style ? { type: item.style } : {}),
    ...(item.color ? { color: item.color } : {}),
  };
}

/** Where picks are kept on an Item List item (the other way from `itemValues`). */
export function itemFields(kind: UnitKind, values: Record<string, string>) {
  const { ext, type, color, ...rest } = values;
  const details = Object.fromEntries(Object.entries(rest).filter(([, v]) => v && v !== "No"));
  return {
    exterior: kind === "door" ? ext === "Ext" : null,
    style: type || null,
    color: kind === "window" ? color || null : null,
    details: Object.keys(details).length ? JSON.stringify(details) : null,
  };
}

/** A line on a job's list: its size and picks, shown in the parts' order ("Prehung · Hollow · 2x4"), Int / Ext and color aside. */
export function lineSummary(parts: UnitPart[], values: Record<string, string>) {
  return parts
    .filter((p) => p.ask && !isBadge(p))
    .map((p) => (p.kind === "yesno" ? (values[p.key] === "Yes" ? p.name : "") : (values[p.key] ?? "")))
    .filter(Boolean)
    .join(" · ");
}

export type UnitItem = {
  id: string;
  name: string;
  kind: string | null;
  widthIn: number | null;
  heightIn: number | null;
  exterior?: boolean | null;
  style?: string | null;
  color?: string | null;
  details?: string | null;
};

const hasWords = (name: string, words: string) => new RegExp(`(^|[^a-z0-9])${words.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(name.toLowerCase());

/**
 * What's known about an Item List door or window, part by part (a part left out: not known). Its saved picks
 * first. Then its name: a choice in it ("2868 Pocket Door" is a Pocket). Then, for one made from parts (it has
 * a type), what its name leaves out: a part in the name only when it isn't the usual is the usual ("3050
 * Single Hung" is Standard), a tick box not in it is No, and a part that's blank unless picked is blank.
 * A door typed in by hand before ("2868 Hollow Core") says nothing about what its name leaves out.
 */
export function knownValues(item: UnitItem, parts: UnitPart[]): Record<string, string> {
  const saved = itemValues(item);
  const madeFromParts = !!item.style;
  const out: Record<string, string> = {};
  for (const p of parts) {
    const v = saved[p.key];
    if (v != null) {
      out[p.key] = v;
      continue;
    }
    if (p.kind === "yesno") {
      if (hasWords(item.name, p.name)) out[p.key] = "Yes";
      else if (madeFromParts) out[p.key] = "No";
      continue;
    }
    if (p.key === "ext") {
      if (/(^|\s)(ext|exterior)(\s|$)/i.test(item.name)) out.ext = "Ext";
      else if (/(^|\s)(int|interior)(\s|$)/i.test(item.name)) out.ext = "Int";
      continue;
    }
    const named = p.choices.filter((c) => hasWords(item.name, c)).sort((x, y) => y.length - x.length)[0];
    if (named) out[p.key] = named;
    else if (madeFromParts && p.inName === "unusual") out[p.key] = p.usual;
    else if (madeFromParts && p.usual === "") out[p.key] = "";
  }
  return out;
}

/**
 * Two Item List doors (or windows) that could be one: the same size, both doors or both windows, and
 * nothing known about either one that the other says differently (`knownValues`) — what isn't known (a
 * door typed in before, "2868 Hollow Core", with no type) is not a difference; Black vs White/Black, Int vs
 * Ext, Slab vs Prehung, full lite or not, is.
 */
export function likelySame(a: UnitItem, b: UnitItem, parts: UnitPart[]) {
  if (a.id === b.id || !a.kind || a.kind !== b.kind || (a.kind !== "doors" && a.kind !== "windows")) return false;
  if (a.widthIn == null || a.heightIn == null || a.widthIn !== b.widthIn || a.heightIn !== b.heightIn) return false;
  const va = knownValues(a, parts);
  const vb = knownValues(b, parts);
  for (const k of Object.keys(va)) if (vb[k] != null && !same(va[k], vb[k])) return false;
  return true;
}

/** Every likely pair among these, each once ("id|id", smaller id first), but those marked "Not the same". */
export function duplicatePairs(items: UnitItem[], partsFor: (kind: UnitKind) => UnitPart[], notSame: string[] = []) {
  const skip = new Set(notSame);
  const out: { key: string; a: string; b: string }[] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      if (!likelySame(items[i], items[j], partsFor(items[i].kind === "windows" ? "window" : "door"))) continue;
      const [a, b] = [items[i].id, items[j].id].sort();
      const key = `${a}|${b}`;
      if (!skip.has(key)) out.push({ key, a, b });
    }
  return out;
}

/** Int / Ext (doors) and Color (windows) show as a tag at the end of a line. */
export const isBadge = (p: UnitPart) => p.key === "ext" || p.key === "color";

export { readSizeCode, sizeCode };
