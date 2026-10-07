import { z } from "zod";
import { specViewSchema, type SpecView } from "./proposal-options";
import { markupTableSchema, type MarkupRow } from "./markup";

/**
 * The estimate sheet: categories → spec items → cost lines. Shared by the
 * estimate screen (client), the save actions (server) and tests — no database
 * code here.
 */

export const COST_TYPES = [
  { value: "MATERIAL", label: "Material" },
  { value: "LABOR", label: "Labor" },
  { value: "SUBCONTRACTOR", label: "Subcontractor" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "OTHER", label: "Other" },
] as const;
export type CostType = (typeof COST_TYPES)[number]["value"];

export function costTypeLabel(value: string) {
  return COST_TYPES.find((t) => t.value === value)?.label ?? "Other";
}

/** A sensible cost type from a cost code's name. */
export function guessCostType(name: string) {
  if (/labor|install/i.test(name)) return "LABOR";
  if (/sub ?contract/i.test(name)) return "SUBCONTRACTOR";
  if (/equipment|rental/i.test(name)) return "EQUIPMENT";
  return "MATERIAL";
}

/** `category`: where a new item for this code's division goes (your Settings categories, else General). */
export type RollupCode = { label: string; name: string; division: string; category: string };

/**
 * The takeoff as estimate lines: one per cost code, its cost the total of every
 * item behind it (lumber, sheathing, nails… all in "3120 Framing Package").
 * Items with no cost code roll up per takeoff group. Profit is set on the estimate.
 */
export function rollupTakeoff(lines: { costCodeId: string | null; group: string; quantity: number; unitCost: number }[], codeOf: (id: string) => RollupCode | undefined) {
  const out = new Map<string, { key: string; costCodeId: string | null; cost: number; description: string; name: string; category: string }>();
  for (const l of lines) {
    const code = l.costCodeId ? codeOf(l.costCodeId) : undefined;
    const key = code ? `code:${l.costCodeId}` : `group:${l.group.trim().toLowerCase()}`;
    const r = out.get(key);
    if (r) r.cost += l.quantity * l.unitCost;
    else
      out.set(key, {
        key,
        costCodeId: code ? l.costCodeId : null,
        cost: l.quantity * l.unitCost,
        description: `From takeoff — ${code ? code.label : `${l.group} (no cost code)`}`,
        // A new item for it: the division's ("3100 Framing"), in General until you file it.
        name: code ? code.division : l.group,
        category: code ? code.category : "General",
      });
  }
  return Array.from(out.values()).map((r) => ({ ...r, cost: Math.round(r.cost * 100) / 100 }));
}

export const SPEC_KINDS = [
  { value: "SPECIFICATION", label: "Specification" },
  { value: "SELECTION", label: "Selection" },
] as const;

export type SheetLine = {
  /** Saved line id, or null for a line added since the last save. */
  id: string | null;
  /** Stable key for React and drag-and-drop (the id once saved). */
  key: string;
  costCodeId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  /** Profit % of cost (cost with tax). */
  markupPct: number;
  /** Sales tax you pay on it, % of cost (0 = not taxed). */
  taxPct: number;
  costType: string;
  notes: string;
  isOptional: boolean;
  /** Sent from a takeoff — re-sending it updates this line. */
  fromTakeoff: boolean;
  /** Which takeoff total it carries ("code:<cost code id>") — its dropdown shows the takeoff items behind it. */
  takeoffKey?: string | null;
  /** Linked to an Item List item (added to it, or priced from it). */
  materialItemId: string | null;
  /** "Add cost lines to Item List" was picked — happens on save. */
  addToItemList: boolean;
  /** Quantity from the job's estimate parameters (stored form, "[#id] * 1.1"); null = typed in. */
  qtyFormula: string | null;
  /** Unit cost from the job's estimate parameters, the same way; null = typed in. */
  costFormula: string | null;
};

export type SheetSpec = {
  id: string | null;
  key: string;
  name: string;
  category: string;
  specText: string;
  kind: string;
  isAllowance: boolean;
  clientNotes: string;
  tradeNotes: string;
  urgent: boolean;
  /** yyyy-mm-dd or "" */
  requestedBy: string;
  /** This item on the proposal (estimates only); nulls follow the estimate's options. */
  proposalView: SpecView;
  /** An allowance with profit in (true) or at cost (false); null = the company default. */
  allowanceProfit: boolean | null;
  lines: SheetLine[];
};

/** A line's money: cost, the sales tax you pay on it, profit on the two, and the price. */
export function lineMath(l: { quantity: number; unitCost: number; markupPct: number; taxPct?: number | null }) {
  const cost = l.quantity * l.unitCost;
  const tax = (cost * (l.taxPct ?? 0)) / 100;
  const profit = (cost + tax) * (l.markupPct / 100);
  return { cost, tax, profit, price: cost + tax + profit };
}

export type Totals = { cost: number; tax: number; profit: number; price: number };
const ZERO: Totals = { cost: 0, tax: 0, profit: 0, price: 0 };

function add(a: Totals, b: Totals): Totals {
  return { cost: a.cost + b.cost, tax: a.tax + b.tax, profit: a.profit + b.profit, price: a.price + b.price };
}

/** Totals of lines; optional lines are left out (they aren't in the price). */
export function linesTotals(lines: SheetLine[]): Totals {
  return lines.filter((l) => !l.isOptional).reduce((t, l) => add(t, lineMath(l)), ZERO);
}

export function specsTotals(specs: SheetSpec[]): Totals {
  return specs.reduce((t, s) => add(t, linesTotals(s.lines)), ZERO);
}

/** Categories in the order their first spec item appears. */
export function categoryOrder(specs: { category: string }[]) {
  return Array.from(new Set(specs.map((s) => s.category)));
}

/** Specs grouped by category, keeping each category's specs together in sheet order. */
export function byCategory<T extends { category: string }>(specs: T[]): [string, T[]][] {
  return categoryOrder(specs).map((c) => [c, specs.filter((s) => s.category === c)]);
}

/**
 * How lines without a spec item get one (old estimates, takeoff lines): one spec
 * per category + cost code, named after the cost code. Allowance lines get their own
 * (an allowance named after its line). Returns groups in the order their first line appears.
 */
export function groupLooseLines<L extends { id: string; group: string; costCodeId: string | null; description: string; sortOrder: number; isAllowance?: boolean }>(
  lines: L[],
  costCodeName: (id: string) => string | undefined,
) {
  const groups = new Map<string, { category: string; name: string; costCodeId: string | null; lines: L[]; sortOrder: number }>();
  for (const l of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const k = l.isAllowance ? `allowance\u0000${l.id}` : `${l.group}\u0000${l.costCodeId ?? ""}`;
    const g = groups.get(k);
    if (g) g.lines.push(l);
    else {
      const name = (l.isAllowance ? allowanceName(l.description) : l.costCodeId && costCodeName(l.costCodeId)) || l.description || "Other";
      groups.set(k, { category: l.group || "General", name, costCodeId: l.costCodeId, lines: [l], sortOrder: l.sortOrder });
    }
  }
  return Array.from(groups.values());
}

/** "Cabinets allowance" → "Cabinets" (it's marked as an allowance anyway). */
export function allowanceName(description: string) {
  return description.replace(/\s*\(?allowance\)?\s*$/i, "").trim() || description;
}

// --- Organizing by your divisions ------------------------------------------------------
// The user's words: Division ("Excavation and Foundation", our `category`) → Category
// ("2000 Excavation" — a spec item named after a cost code category, CostCode.division)
// → Items (the cost-coded lines).

/** A category with nothing of its own (no spec text, allowance, notes…): safe to fold into its cost code category. */
function isPlain(s: SheetSpec) {
  const v = s.proposalView;
  return (
    !s.specText &&
    !s.isAllowance &&
    !s.clientNotes &&
    !s.tradeNotes &&
    s.kind === "SPECIFICATION" &&
    !s.urgent &&
    !s.requestedBy &&
    v.show === null &&
    v.prices === null &&
    v.items === null
  );
}

/**
 * The sheet organized by your divisions: per-code categories ("Legal Fees", "Permit"…)
 * fold into their cost code category ("1000 Permits and Fees"), and every category
 * goes into its division, divisions in your order. Categories with their own spec
 * text, allowance or notes are kept (just filed). `changed` counts what moved.
 */
export function organizeSheet(
  specs: SheetSpec[],
  o: { groupOfCode: Map<string, string>; groups: string[]; divisionOf: Record<string, string>; order: string[]; newKey: () => string },
) {
  const groupByName = new Map(o.groups.map((g) => [g.trim().toLowerCase(), g]));
  const asGroup = (name: string) => groupByName.get(name.trim().toLowerCase());
  const groupOf = (s: SheetSpec) => {
    const own = asGroup(s.name);
    if (own) return own;
    const counts = new Map<string, number>();
    for (const l of s.lines) {
      const g = l.costCodeId ? o.groupOfCode.get(l.costCodeId) : undefined;
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? asGroup(s.category);
  };
  const divisionFor = (s: SheetSpec, g: string | undefined) => (g && o.divisionOf[g]) || (asGroup(s.category) ? "General" : s.category);

  // The category already named after each cost code category, if there is one.
  const home = new Map<string, string>();
  for (const s of specs) {
    const g = asGroup(s.name);
    if (g && !home.has(g)) home.set(g, s.key);
  }
  const extra = new Map<string, SheetLine[]>();
  const out: SheetSpec[] = [];
  let changed = 0;
  for (const s of specs) {
    const g = groupOf(s);
    if (g && !asGroup(s.name) && isPlain(s)) {
      changed++;
      let target = home.get(g);
      if (!target) {
        target = o.newKey();
        home.set(g, target);
        out.push({
          id: null,
          key: target,
          name: g,
          category: divisionFor(s, g),
          specText: "",
          kind: "SPECIFICATION",
          isAllowance: false,
          clientNotes: "",
          tradeNotes: "",
          urgent: false,
          requestedBy: "",
          proposalView: { show: null, prices: null, items: null },
          allowanceProfit: null,
          lines: [],
        });
      }
      extra.set(target, [...(extra.get(target) ?? []), ...s.lines]);
      continue;
    }
    const category = divisionFor(s, g);
    if (category !== s.category) changed++;
    out.push(category === s.category ? s : { ...s, category });
  }
  const merged = out.map((s) => (extra.has(s.key) ? { ...s, lines: [...s.lines, ...extra.get(s.key)!] } : s));
  const seen = [...o.order, ...merged.map((s) => s.category)];
  const rank = (c: string) => seen.indexOf(c);
  const sorted = merged.map((s, i) => ({ s, i })).sort((x, y) => rank(x.s.category) - rank(y.s.category) || x.i - y.i);
  return { specs: sorted.map((x) => x.s), changed };
}

// --- What the screen sends when you click Save -----------------------------------

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim());
const money = z.number().finite().min(-1e9).max(1e9);

const lineInput = z.object({
  id: z.string().nullable(),
  costCodeId: z.string().nullable(),
  description: text(500),
  quantity: money,
  unit: text(20),
  unitCost: money,
  markupPct: z.number().finite().min(-100).max(10000),
  taxPct: z.number().finite().min(0).max(100).catch(0),
  costType: z.enum(COST_TYPES.map((t) => t.value) as [CostType, ...CostType[]]),
  notes: text(2000),
  isOptional: z.boolean(),
  fromTakeoff: z.boolean(),
  /** The takeoff line it was when the sheet loaded ("Stop updating" keeps it, so a stop can be told from a stale sheet). */
  takeoffKey: z.string().nullable().optional(),
  materialItemId: z.string().nullable(),
  addToItemList: z.boolean(),
  qtyFormula: z.string().max(1000).nullable(),
  costFormula: z.string().max(1000).nullable().optional(),
});

const specInput = z.object({
  id: z.string().nullable(),
  name: text(200),
  category: text(100),
  specText: text(10000),
  kind: z.enum(["SPECIFICATION", "SELECTION"]),
  isAllowance: z.boolean(),
  clientNotes: text(5000),
  tradeNotes: text(5000),
  urgent: z.boolean(),
  requestedBy: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  proposalView: specViewSchema,
  allowanceProfit: z.boolean().nullable(),
  lines: z.array(lineInput).max(2000),
});

export const saveSheetInput = z.object({
  specs: z.array(specInput).max(2000),
  /** Ids the screen loaded — only these can be deleted (lines sent from a takeoff meanwhile are kept). */
  knownSpecIds: z.array(z.string()).max(4000),
  knownLineIds: z.array(z.string()).max(20000),
  basePrice: money.nullable(),
  totalSqFt: z.number().finite().min(0).max(1e7).nullable(),
  /** The job's parameter values (job estimates only). */
  parameterValues: z.record(z.string(), z.number().finite().min(-1e9).max(1e9)).optional(),
  /** The Markup, Margin & Tax table. */
  markupTable: markupTableSchema.optional(),
});
export type SaveSheetInput = z.infer<typeof saveSheetInput>;

function withoutKey<T extends { key: string }>({ key, ...rest }: T) {
  void key;
  return rest;
}

/** What the screen sends: the sheet without the React-only keys. */
export function toSaveInput(
  specs: SheetSpec[],
  known: { specIds: string[]; lineIds: string[] },
  extra: { basePrice: number | null; totalSqFt: number | null; parameterValues?: Record<string, number>; markupTable?: MarkupRow[] },
): SaveSheetInput {
  return {
    specs: specs.map(({ lines, ...s }) => ({
      ...withoutKey(s),
      kind: s.kind === "SELECTION" ? "SELECTION" : "SPECIFICATION",
      lines: lines.map((l) => ({ ...withoutKey(l), costType: l.costType as CostType })),
    })),
    knownSpecIds: known.specIds,
    knownLineIds: known.lineIds,
    ...extra,
  };
}
