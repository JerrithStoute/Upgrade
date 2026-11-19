import type { Row } from "./xlsx";

/**
 * A CoConstruct estimate export, read into its Divisions → Categories → Items, and what
 * bringing it in would add up to. Plain functions (no database) — tested in estimate.test.ts.
 *
 * CoConstruct's export is the estimate as it stands today: change orders and the client's
 * choices are already folded in, each as a category ("Roof pitch changes : 1. Main roof…").
 * Which of those are change orders, which are choices, and which are left over (declined,
 * or counted twice) isn't in the file — it's picked on the Station's screen (CcPlan).
 *
 * Columns: A division, B category ("<name> : <choice>", "<name> (Allowance): <choice>"),
 * C item, D qty, E units, F unit cost, G ext cost, H cost type, I "1002 - Permit" account code,
 * J profit (0.14 = 14%), K profit $, L line price, M category price, N division price, Q notes.
 * An allowance's chosen item has no profit of its own: the category's K is the allowance's profit.
 */

export type CcItem = {
  row: number;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  cost: number;
  costType: string;
  code: string | null;
  codeName: string | null;
  markupPct: number;
  price: number;
  notes: string | null;
};

export type CcCategory = {
  /** The category's row in the sheet — its id on the screen. */
  row: number;
  division: string;
  /** Its name, without the choice ("4120 Fireplace"). */
  name: string;
  /** The choice after the colon ("LUNAR 36\"…"); null for "Original Budget" or none. */
  choice: string | null;
  /** A CoConstruct selection (it had a colon). */
  isSelection: boolean;
  isAllowance: boolean;
  /** The category's price (M) and its own profit (K, an allowance's). */
  price: number;
  profit: number;
  items: CcItem[];
};

export type CcEstimate = { categories: CcCategory[]; cost: number; price: number };

const num = (s: string | undefined) => {
  const n = Number(String(s ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const cents = (n: number) => Math.round(n * 100) / 100;
const clean = (s: string | undefined) => (s ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();

const UNITS: Record<string, string> = { each: "ea", "s.f.": "sf", "l.f.": "lf", "s.y.": "sy", "c.y.": "cy", "l.s.": "ls", lump: "ls" };
const COST_TYPES: Record<string, string> = { subcontract: "SUBCONTRACTOR", labor: "LABOR", materials: "MATERIAL", material: "MATERIAL", equipment: "EQUIPMENT", other: "OTHER" };

/** "4120 Fireplace (Allowance): 1. LUNAR 36\"" → name, choice, allowance. */
export function splitCategory(b: string) {
  const text = clean(b);
  const allowance = /\(Allowance\)\s*:/i.exec(text);
  const colon = allowance ?? / : /.exec(text);
  if (!colon) return { name: text.replace(/\s*\(Allowance\)\s*$/i, ""), choice: null, isSelection: false, isAllowance: /\(Allowance\)\s*$/i.test(text) };
  const name = text.slice(0, colon.index).trim();
  const after = text
    .slice(colon.index + colon[0].length)
    .trim()
    .replace(/^\d+\.\s*/, "");
  const choice = !after || /^original budget$/i.test(after) ? null : after;
  return { name, choice, isSelection: true, isAllowance: !!allowance };
}

/** The rows of a CoConstruct estimate export, as its categories and items. */
export function parseEstimate(rows: Row[]): CcEstimate {
  const head = rows[0] ?? {};
  if (!/item description/i.test(head.C ?? "") || !/acct/i.test(head.I ?? ""))
    throw new Error("That doesn't look like a CoConstruct estimate export (Estimate → Export → Excel)");
  const categories: CcCategory[] = [];
  let division = "";
  let cat: CcCategory | null = null;
  let cost = 0;
  let price = 0;
  for (const [i, r] of rows.entries()) {
    if (i === 0) continue;
    if (r.A) {
      if (/^totals$/i.test(r.A.trim())) {
        cost = num(r.G);
        price = num(r.N);
        break;
      }
      division = clean(r.A);
      cat = null;
      continue;
    }
    if (r.B) {
      cat = { row: i + 1, division, ...splitCategory(r.B), price: num(r.M), profit: num(r.K), items: [] };
      categories.push(cat);
      continue;
    }
    if (!r.C) continue;
    if (!cat) {
      // A division's lines with no category ("Other Line Items"): one under the division's name.
      cat = { row: i + 1, division, name: division, choice: null, isSelection: false, isAllowance: false, price: 0, profit: 0, items: [] };
      categories.push(cat);
    }
    const acct = clean(r.I);
    const m = /^(\S+)\s*-\s*(.*)$/.exec(acct);
    const qty = num(r.D);
    const unitCost = num(r.F);
    const ext = r.G !== undefined ? num(r.G) : qty * unitCost;
    const markupPct = Math.round(num(r.J) * 10000) / 100;
    cat.items.push({
      row: i + 1,
      description: clean(r.C),
      quantity: qty,
      unit: UNITS[clean(r.E).toLowerCase()] ?? (clean(r.E) || "ea"),
      unitCost,
      cost: cents(ext),
      costType: COST_TYPES[clean(r.H).toLowerCase()] ?? "OTHER",
      code: m ? m[1] : acct || null,
      codeName: m ? m[2].trim() || null : null,
      markupPct,
      price: r.L !== undefined ? num(r.L) : cents(ext * (1 + markupPct / 100)),
      notes: clean(r.Q) || null,
    });
  }
  // A category with no price of its own (one made for loose lines): its lines'.
  for (const c of categories) if (!c.price && c.items.length) c.price = cents(c.items.reduce((n, x) => n + x.price, 0));
  return { categories, cost, price };
}

// ---------------------------------------------------------------------------
// What to do with each category (picked on the Station's screen)
// ---------------------------------------------------------------------------

/**
 * ESTIMATE: part of the estimate (and the quoted price). CO: an approved change order of its own.
 * SKIP: left out (declined, or counted twice). A category on the estimate can be a selection:
 * OPEN (not chosen yet), CHOSEN (chosen; its over/under on a draft change order) or FINAL
 * (chosen and done; its over/under on an approved change order, counted in the contract).
 */
export type CcRole = "ESTIMATE" | "CO" | "SKIP";
export type CcChoiceStatus = "OPEN" | "CHOSEN" | "FINAL";
export type CcCategoryPlan = {
  row: number;
  role: CcRole;
  selection: boolean;
  /** An allowance's amount (at cost) — what CoConstruct's file doesn't say when a choice is made. */
  allowance: number | null;
  status: CcChoiceStatus;
  /** A change order's title and the day it was approved (yyyy-mm-dd). */
  coTitle: string;
  coDate: string;
  /** Lines left out (their rows). */
  skip: number[];
};
export type CcPlan = { categories: CcCategoryPlan[]; basePrice: number | null };

/** The name without its leading code ("4120 Fireplace" → "Fireplace"). */
export const plainName = (s: string) => s.replace(/^\d{3,5}\s+/, "").trim() || s;

/** A chosen allowance's item(s): what was picked, at cost. */
export const chosenCost = (c: CcCategory, skip: number[] = []) => cents(c.items.filter((i) => !skip.includes(i.row)).reduce((n, i) => n + i.cost, 0));

/** What CoConstruct's file suggests for a category (the screen starts from this). */
export function guessPlan(c: CcCategory, defaultMarkupPct: number): CcCategoryPlan {
  const base = { row: c.row, coTitle: plainName(c.name), coDate: "", skip: [] as number[], allowance: null as number | null, status: "OPEN" as CcChoiceStatus };
  if (c.isAllowance) {
    // A choice made: the allowance is what its profit was figured on (K ÷ the usual markup) — check it.
    const allowance = c.choice && c.profit > 0 && defaultMarkupPct > 0 ? cents(c.profit / (defaultMarkupPct / 100)) : null;
    return { ...base, role: "ESTIMATE", selection: true, allowance, status: c.choice ? "CHOSEN" : "OPEN" };
  }
  if (!c.isSelection) return { ...base, role: "ESTIMATE", selection: false };
  if (!c.choice) return { ...base, role: "ESTIMATE", selection: true };
  if (/^declined$/i.test(c.choice) || c.price === 0) return { ...base, role: "SKIP", selection: false };
  // A full category (several lines) with a choice made: a selection on the estimate.
  if (c.items.length > 1) return { ...base, role: "ESTIMATE", selection: true, status: "CHOSEN" };
  // A category that's only a choice, under a name of its own: most often a change order.
  return { ...base, role: "CO", selection: false };
}

const included = (c: CcCategory, p: CcCategoryPlan) => c.items.filter((i) => !p.skip.includes(i.row));

/** The estimate lines a category brings in. A chosen allowance comes in as its allowance (one line). */
export function estimateLines(c: CcCategory, p: CcCategoryPlan) {
  const items = included(c, p);
  if (c.isAllowance && p.allowance !== null && c.choice) {
    const first = items[0] ?? c.items[0];
    const markupPct = p.allowance > 0 ? Math.round((c.profit / p.allowance) * 100 * 10000) / 10000 : 0;
    return [
      {
        ...(first ?? { row: c.row, quantity: 1, unit: "ea", costType: "MATERIAL", code: null, codeName: null, notes: null }),
        description: `${plainName(c.name)} allowance`,
        quantity: 1,
        unit: "ls",
        unitCost: p.allowance,
        cost: p.allowance,
        markupPct,
        price: cents(p.allowance * (1 + markupPct / 100)),
      } as CcItem,
    ];
  }
  return items;
}

/** A selection's allowance (at cost): what was set, or its lines' cost. */
export function allowanceOf(c: CcCategory, p: CcCategoryPlan) {
  if (!c.isAllowance) return 0;
  return p.allowance ?? cents(included(c, p).reduce((n, i) => n + i.cost, 0));
}

/** The client's choice and its over/under (at cost, the way CoConstruct figures it). */
export function choiceOf(c: CcCategory, p: CcCategoryPlan) {
  if (!p.selection || p.status === "OPEN") return null;
  const price = c.isAllowance ? chosenCost(c, p.skip) : 0;
  const allowance = allowanceOf(c, p);
  return { name: c.choice ?? "Original budget", price, allowance, difference: cents(price - allowance) };
}

/** What it all adds up to: the estimate's lines, the change orders, the choices, and the contract. */
export function planTotals(est: CcEstimate, plan: CcPlan) {
  const byRow = new Map(plan.categories.map((p) => [p.row, p]));
  let lines = 0;
  let cos = 0;
  let final = 0;
  let chosen = 0;
  const changeOrders: { row: number; title: string; amount: number }[] = [];
  for (const c of est.categories) {
    const p = byRow.get(c.row);
    if (!p || p.role === "SKIP") continue;
    if (p.role === "CO") {
      const amount = cents(included(c, p).reduce((n, i) => n + i.price, 0));
      cos += amount;
      changeOrders.push({ row: c.row, title: p.coTitle, amount });
      continue;
    }
    lines += estimateLines(c, p).reduce((n, i) => n + i.price, 0);
    const ch = choiceOf(c, p);
    if (ch && ch.difference) {
      if (p.status === "FINAL") final += ch.difference;
      else chosen += ch.difference;
    }
  }
  const basePrice = plan.basePrice ?? cents(lines);
  return {
    lines: cents(lines),
    basePrice: cents(basePrice),
    changeOrders,
    coTotal: cents(cos),
    finalChoices: cents(final),
    chosenChoices: cents(chosen),
    contract: cents(basePrice + cos + final),
  };
}
