import type { ConditionType } from "./takeoff";

/**
 * Kinds of items the program adds to the Item List by itself (no one typing an
 * assembly). The kind is stored on the item, so you can file it under any category
 * you like ("5200 Interior Trim") and pickers still find it. Each group remembers
 * which category its new items go in and whether they share one cost code. Doors
 * are split interior / exterior (often coded and filed differently).
 */
export const CODE_GROUPS = {
  windows: { label: "Windows", plural: "windows", kind: "windows", category: "Windows" },
  "doors:interior": { label: "Interior doors", plural: "interior doors", kind: "doors", category: "Doors" },
  "doors:exterior": { label: "Exterior doors", plural: "exterior doors", kind: "doors", category: "Doors" },
  "framing lumber": { label: "Framing lumber", plural: "framing lumber (studs, plates, headers, joists…)", kind: "framing lumber", category: "Framing Lumber" },
  sheathing: { label: "Sheathing", plural: "sheathing", kind: "sheathing", category: "Sheathing" },
  drywall: { label: "Drywall", plural: "drywall", kind: "drywall", category: "Drywall" },
  trim: { label: "Trim", plural: "trim (casing, stool, apron, baseboard…)", kind: "trim", category: "Trim" },
} as const;

export type CodeGroup = keyof typeof CODE_GROUPS;

export const CODE_GROUP_KEYS = Object.keys(CODE_GROUPS) as CodeGroup[];

export const ITEM_KINDS = ["windows", "doors", "framing lumber", "sheathing", "drywall", "trim"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** What the takeoff form asks about for each kind of takeoff. */
export function codeGroupsFor(type: ConditionType | string): CodeGroup[] {
  switch (type) {
    case "WALL":
      return ["framing lumber", "sheathing", "drywall", "trim"];
    case "OPENING":
    case "FRAMING":
    case "HIP_VALLEY":
      return ["framing lumber"];
    case "DOOR":
      return ["doors:interior", "doors:exterior", "trim"];
    case "WINDOW":
      return ["windows", "trim"];
    default:
      return [];
  }
}

/** The built-in category names the program used before kinds ("Trim" → trim). */
export function kindOfLegacyCategory(category: string | null | undefined): ItemKind | null {
  const key = (category ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return (ITEM_KINDS as readonly string[]).includes(key) ? (key as ItemKind) : null;
}

/** An item's kind: its own tag, or (older items) its built-in category name. */
export function itemKind(i: { kind?: string | null; category: string }): ItemKind | null {
  return i.kind && (ITEM_KINDS as readonly string[]).includes(i.kind) ? (i.kind as ItemKind) : kindOfLegacyCategory(i.category);
}

/** The group an item belongs to (doors by interior / exterior), or null for your own items. */
export function groupOf(kind: string | null | undefined, exterior?: boolean | null): CodeGroup | null {
  if (!kind) return null;
  if (kind === "doors") return exterior ? "doors:exterior" : "doors:interior";
  return kind in CODE_GROUPS ? (kind as CodeGroup) : null;
}

export type CodeRule = { sameForAll: boolean; costCodeId: string | null; category: string | null };
export type CodeRules = Partial<Record<CodeGroup, CodeRule>>;

/** Where new items of a group go: your chosen category, else the built-in name. */
export const groupCategory = (group: CodeGroup, rules: CodeRules) => rules[group]?.category || CODE_GROUPS[group].category;
