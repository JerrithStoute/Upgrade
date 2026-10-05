import { z } from "zod";

/**
 * What a proposal shows. Levels, top down, in the user's words: divisions
 * ("Excavation and Foundation", `categories` here) → categories, the selections /
 * specifications ("2100 Footing and Foundation", `divisions` here) → items, the
 * cost-coded lines inside them. Every level can be
 * shown or hidden, with or without prices; profit can be built into the prices
 * or shown as one fee line; tax is optional. Shared by the proposal page and its
 * options panel — no database code here.
 */

/** An allowance: its items' cost, or their price with profit in — your choice per allowance. Optional items are left out. */
export function allowanceAmount(lines: { quantity: number; unitCost: number; markupPct: number; isOptional: boolean }[], withProfit: boolean) {
  const t = lines.filter((l) => !l.isOptional).reduce((n, l) => n + l.quantity * l.unitCost * (withProfit ? 1 + l.markupPct / 100 : 1), 0);
  return Math.round(t * 100) / 100;
}

const bool = (d: boolean) => z.boolean().catch(d);

export const proposalOptionsSchema = z.object({
  categories: z.object({ show: bool(true), subtotals: bool(true) }).catch({ show: true, subtotals: true }),
  divisions: z.object({ show: bool(true), prices: bool(true), specText: bool(true) }).catch({ show: true, prices: true, specText: true }),
  items: z.object({ show: bool(false), qty: bool(false), prices: bool(false) }).catch({ show: false, qty: false, prices: false }),
  /** Hide every price but the final total. */
  totalOnly: bool(false),
  /** The Allowance Summary (each allowance and their total) after the base price. */
  allowances: bool(true),
  /** "Allowance: $X" under each allowance category's text. */
  allowanceInline: bool(true),
  /** "Option – To be specified by client … TBD" under each Selection category. */
  selectionTbd: bool(true),
  /** The heading over the body ("Estimate", "Proposal"…). */
  heading: z.string().max(60).catch("Proposal"),
  /** A cover page with the job's picture. */
  cover: bool(false),
  /** Who signs for you ("Builder: …"); empty = your company name. */
  signer: z.string().max(80).catch(""),
  /** A signature line for the client too. */
  clientSignature: bool(true),
  /** "Pricing in this proposal is good for N days, through …" — 0 leaves it off. */
  validDays: z.number().int().min(0).max(365).catch(30),
  profit: z
    .object({ mode: z.enum(["BUILT_IN", "FEE"]).catch("BUILT_IN"), label: z.string().max(60).catch("Builder's fee"), showPct: bool(true) })
    .catch({ mode: "BUILT_IN", label: "Builder's fee", showPct: true }),
  tax: z
    .object({
      on: bool(false),
      pct: z.number().finite().min(0).max(100).catch(0),
      label: z.string().max(60).catch("Sales tax"),
      base: z.enum(["TOTAL", "MATERIAL"]).catch("TOTAL"),
    })
    .catch({ on: false, pct: 0, label: "Sales tax", base: "TOTAL" }),
});
export type ProposalOptions = z.infer<typeof proposalOptionsSchema>;

export const DEFAULT_PROPOSAL_OPTIONS: ProposalOptions = proposalOptionsSchema.parse({});

/** Saved options (JSON text), with anything missing or broken falling back to the default. */
export function parseProposalOptions(json: string | null | undefined): ProposalOptions {
  if (!json) return DEFAULT_PROPOSAL_OPTIONS;
  try {
    return proposalOptionsSchema.parse(JSON.parse(json));
  } catch {
    return DEFAULT_PROPOSAL_OPTIONS;
  }
}

/** One division's own choices; null follows the estimate's options. */
export const specViewSchema = z.object({ show: z.boolean().nullable().catch(null), prices: z.boolean().nullable().catch(null), items: z.boolean().nullable().catch(null) });
export type SpecView = z.infer<typeof specViewSchema>;
export const NO_VIEW: SpecView = { show: null, prices: null, items: null };

export function parseSpecView(json: string | null | undefined): SpecView {
  if (!json) return NO_VIEW;
  try {
    return specViewSchema.parse(JSON.parse(json));
  } catch {
    return NO_VIEW;
  }
}

/** Stored only when something is set. */
export function specViewJson(v: SpecView) {
  return v.show === null && v.prices === null && v.items === null ? null : JSON.stringify(v);
}

// --- Building the document ------------------------------------------------------------

export type ProposalLine = { id: string; description: string; quantity: number; unit: string; unitCost: number; markupPct: number; costType: string; isOptional: boolean };
export type ProposalSpec = {
  id: string;
  name: string;
  category: string;
  specText: string | null;
  isAllowance: boolean;
  /** SPECIFICATION | SELECTION */
  kind: string;
  /** This allowance with profit in (true) or at cost (false). */
  allowanceProfit: boolean;
  /** What the Markup, Margin & Tax rows marked for allowances add to this allowance. */
  allowanceExtra?: number;
  /** What the client chose for this selection, "DECLINED", or null (still to be specified). */
  choice: { name: string; price: number } | "DECLINED" | null;
  view: SpecView;
  lines: ProposalLine[];
};

export type DocItem = { id: string; description: string; quantity: number; unit: string; amount: number };
export type DocDivision = {
  id: string;
  name: string;
  specText: string | null;
  isAllowance: boolean;
  amount: number;
  /** The allowance as the client sees it (profit included), when this is an allowance category and that's shown. */
  allowance: number | null;
  /** "Option – To be specified by client … TBD" (or the choice once it's made). */
  tbd: boolean;
  choice: { name: string; price: number } | "DECLINED" | null;
  show: boolean;
  showPrice: boolean;
  /** null: its items aren't shown. */
  items: DocItem[] | null;
};
export type ProposalDoc = {
  categories: { name: string; amount: number; divisions: DocDivision[] }[];
  showCategories: boolean;
  showCategoryAmounts: boolean;
  showItemPrices: boolean;
  showItemQty: boolean;
  showSpecText: boolean;
  /** Before the fee line (FEE: cost) — shown when there's a fee or tax line under it. */
  subtotal: number;
  fee: { label: string; pct: number | null; amount: number } | null;
  tax: { label: string; pct: number; amount: number } | null;
  /** Each tax row (the proposal shows one line per row). */
  taxes: { label: string; pct: number; amount: number }[];
  total: number;
  allowances: { id: string; name: string; note: string | null; amount: number }[];
  allowancesTotal: number;
  optional: { id: string; description: string; quantity: number; unit: string; amount: number }[];
  totalOnly: boolean;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The proposal as the client sees it. With a base price (what you quoted) the
 * numbers add up to it: built-in profit scales every amount to it; a fee line is
 * the base price less cost. Tax goes on top of the base price / total.
 */
/** From the estimate's Markup, Margin & Tax table: overhead on top of the lines, and the tax rows. */
export type ProposalExtras = { overhead: number; taxes: { label: string; pct: number; amount: number }[] };

export function buildProposal(specs: ProposalSpec[], o: ProposalOptions, basePrice: number | null, extras: ProposalExtras = { overhead: 0, taxes: [] }): ProposalDoc {
  const included = specs.flatMap((s) => s.lines.filter((l) => !l.isOptional));
  const cost = included.reduce((t, l) => t + l.quantity * l.unitCost, 0);
  const price = included.reduce((t, l) => t + l.quantity * l.unitCost * (1 + l.markupPct / 100), 0);
  // Overhead (from the table) is part of what the client pays: built into the prices, or in the fee.
  const preTax = basePrice ?? price + extras.overhead;
  // Each line's share of what the client pays (profit included).
  const k = price > 0 ? preTax / price : 1;
  const share = (l: ProposalLine) => l.quantity * l.unitCost * (1 + l.markupPct / 100) * k;
  const fee = o.profit.mode === "FEE";
  const shown = (l: ProposalLine) => (fee ? l.quantity * l.unitCost : share(l));
  const sum = (lines: ProposalLine[]) => cents(lines.filter((l) => !l.isOptional).reduce((t, l) => t + shown(l), 0));

  const order: string[] = [];
  for (const s of specs) if (!order.includes(s.category)) order.push(s.category);
  const categories = order.map((name) => {
    const divisions = specs
      .filter((s) => s.category === name)
      .map((s): DocDivision => {
        const lines = s.lines.filter((l) => !l.isOptional);
        const showItems = s.view.items ?? o.items.show;
        return {
          id: s.id,
          name: s.name,
          specText: s.specText,
          isAllowance: s.isAllowance,
          amount: sum(lines),
          allowance: s.isAllowance && o.allowanceInline ? cents(allowanceAmount(lines, s.allowanceProfit) + (s.allowanceExtra ?? 0)) : null,
          tbd: (s.kind === "SELECTION" || s.choice !== null) && o.selectionTbd,
          choice: s.choice,
          show: s.view.show ?? o.divisions.show,
          showPrice: !o.totalOnly && (s.view.prices ?? o.divisions.prices),
          items: showItems ? lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, unit: l.unit, amount: cents(shown(l)) })) : null,
        };
      });
    return { name, amount: cents(divisions.reduce((t, d) => t + d.amount, 0)), divisions };
  });

  const feeAmount = fee ? cents(preTax - cost) : 0;
  const taxBase = o.tax.base === "MATERIAL" ? included.filter((l) => l.costType === "MATERIAL").reduce((t, l) => t + share(l), 0) : preTax;
  const legacyTax = o.tax.on && o.tax.pct > 0 ? { label: o.tax.label || "Sales tax", pct: o.tax.pct, amount: cents((taxBase * o.tax.pct) / 100) } : null;
  // Tax comes from the table's tax rows (older estimates may still use the proposal's own tax option).
  const taxes = extras.taxes.length ? extras.taxes : legacyTax ? [legacyTax] : [];
  const taxTotal = cents(taxes.reduce((n, t) => n + t.amount, 0));
  const tax = taxes.length ? { label: taxes.map((t) => t.label).join(" + "), pct: cents(taxes.reduce((n, t) => n + t.pct, 0)), amount: taxTotal } : null;

  const allowances = o.allowances
    ? specs
        .filter((s) => s.isAllowance)
        .map((s) => ({ id: s.id, name: s.name, note: s.specText, amount: cents(allowanceAmount(s.lines, s.allowanceProfit) + (s.allowanceExtra ?? 0)) }))
    : [];

  return {
    categories,
    showCategories: o.categories.show,
    showCategoryAmounts: o.categories.subtotals && !o.totalOnly,
    showItemPrices: o.items.prices && !o.totalOnly,
    showItemQty: o.items.qty,
    showSpecText: o.divisions.specText,
    subtotal: cents(fee ? cost : preTax),
    fee: fee ? { label: o.profit.label || "Builder's fee", pct: o.profit.showPct && cost > 0 ? cents((feeAmount / cost) * 100) : null, amount: feeAmount } : null,
    tax,
    taxes,
    total: cents(preTax + (tax?.amount ?? 0)),
    allowances,
    allowancesTotal: cents(allowances.reduce((t, a) => t + a.amount, 0)),
    optional: specs.flatMap((s) =>
      s.lines
        .filter((l) => l.isOptional)
        .map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, unit: l.unit, amount: cents(l.quantity * l.unitCost * (1 + l.markupPct / 100)) })),
    ),
    totalOnly: o.totalOnly,
  };
}
