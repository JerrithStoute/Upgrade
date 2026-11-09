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

/** An allowance: its items' cost (sales tax in), or their price with profit in — your choice per allowance. Optional items are left out. */
export function allowanceAmount(lines: { quantity: number; unitCost: number; markupPct: number; taxPct?: number | null; isOptional: boolean }[], withProfit: boolean) {
  const t = lines.filter((l) => !l.isOptional).reduce((n, l) => n + l.quantity * l.unitCost * (1 + (l.taxPct ?? 0) / 100) * (withProfit ? 1 + l.markupPct / 100 : 1), 0);
  return Math.round(t * 100) / 100;
}

const bool = (d: boolean) => z.boolean().catch(d);

/** A starting payment schedule; each builder changes it to their own. */
export const STARTER_PAYMENTS = [
  { label: "Deposit at signing", pct: 10 },
  { label: "Final payment at completion", pct: 90 },
];
const paymentRow = z.object({ label: z.string().max(80).catch(""), pct: z.number().finite().min(0).max(100).catch(0) });

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
  /** "Choice – To be specified by client … TBD" under each Selection category. */
  selectionTbd: bool(true),
  /** The heading over the body ("Estimate", "Proposal"…). */
  heading: z.string().max(60).catch("Proposal"),
  /** A cover page with the job's picture. */
  cover: bool(false),
  /** The estimate's notes open the proposal as its introduction — untitled unless you give it one. */
  intro: z.object({ titled: bool(false), title: z.string().max(60).catch("Notes") }).catch({ titled: false, title: "Notes" }),
  /** The payment schedule: each payment's name and % of the total (the amounts are worked out from the total). */
  payments: z
    .object({ show: bool(false), rows: z.array(paymentRow).max(12).catch(STARTER_PAYMENTS) })
    .catch({ show: false, rows: STARTER_PAYMENTS }),
  /** The estimate's Terms (its Terms box) as the Terms & conditions section. */
  terms: bool(true),
  /** Who signs for you ("Builder: …"); empty = your company name. */
  signer: z.string().max(80).catch(""),
  /** A signature line for the client too. */
  clientSignature: bool(true),
  /** "Pricing in this proposal is good for N days, through …" — 0 leaves it off. */
  validDays: z.number().int().min(0).max(365).catch(30),
  profit: z
    .object({ mode: z.enum(["BUILT_IN", "FEE"]).catch("BUILT_IN"), label: z.string().max(60).catch("Builder's fee"), showPct: bool(true) })
    .catch({ mode: "BUILT_IN", label: "Builder's fee", showPct: true }),
  /** Sales tax: `on` shows it as its own line (prices before tax); off builds it into the prices. */
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

export type ProposalLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  markupPct: number;
  /** Sales tax you pay on it, % of cost (in its price). */
  taxPct?: number | null;
  costType: string;
  isOptional: boolean;
};
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
  photos?: DocPhoto[];
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
  /** "Choice – To be specified by client … TBD" (or the choice once it's made). */
  tbd: boolean;
  choice: { name: string; price: number } | "DECLINED" | null;
  show: boolean;
  showPrice: boolean;
  /** null: its items aren't shown. */
  items: DocItem[] | null;
  /** Pictures under it on the proposal. */
  photos: DocPhoto[];
};
export type DocPhoto = { id: string; url: string; caption: string | null };
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
  allowances: { id: string; name: string; division: string; note: string | null; amount: number }[];
  allowancesTotal: number;
  optional: { id: string; description: string; quantity: number; unit: string; amount: number }[];
  totalOnly: boolean;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** From the estimate's Markup, Margin & Tax table: overhead on top of the lines, and what its tax is called and its rate. */
export type ProposalExtras = { overhead: number; taxLabel?: string; taxPct?: number };

/**
 * The proposal as the client sees it. The sales tax you pay is in each line's price (profit
 * figured on cost with tax), so the total is the same either way; `tax.on` shows it as its
 * own line — the other amounts before tax — instead of built into them. With a base price
 * (what you quoted, tax in) the numbers add up to it: built-in profit scales every amount to
 * it; a fee line is the base price less cost.
 */
export function buildProposal(specs: ProposalSpec[], o: ProposalOptions, basePrice: number | null, extras: ProposalExtras = { overhead: 0 }): ProposalDoc {
  const included = specs.flatMap((s) => s.lines.filter((l) => !l.isOptional));
  const taxOf = (l: ProposalLine) => (l.quantity * l.unitCost * (l.taxPct ?? 0)) / 100;
  const full = (l: ProposalLine) => l.quantity * l.unitCost * (1 + (l.taxPct ?? 0) / 100) * (1 + l.markupPct / 100);
  const taxAmount = cents(included.reduce((t, l) => t + taxOf(l), 0));
  // Its own line: every other amount is before tax.
  const taxLine = o.tax.on && taxAmount > 0;
  const lineAmount = (l: ProposalLine) => full(l) - (taxLine ? taxOf(l) : 0);
  const costOf = (l: ProposalLine) => l.quantity * l.unitCost + (taxLine ? 0 : taxOf(l));
  const cost = included.reduce((t, l) => t + costOf(l), 0);
  const price = included.reduce((t, l) => t + lineAmount(l), 0);
  // Overhead (from the table) is part of what the client pays: built into the prices, or in the fee.
  const all = basePrice ?? included.reduce((t, l) => t + full(l), 0) + extras.overhead;
  const preTax = all - (taxLine ? taxAmount : 0);
  // Each line's share of what the client pays (profit included).
  const k = price > 0 ? preTax / price : 1;
  const share = (l: ProposalLine) => lineAmount(l) * k;
  const fee = o.profit.mode === "FEE";
  const shown = (l: ProposalLine) => (fee ? costOf(l) : share(l));
  const sum = (lines: ProposalLine[]) => cents(lines.filter((l) => !l.isOptional).reduce((t, l) => t + shown(l), 0));

  // A category with nothing in it (no lines, no text, no choice to make, no pictures) is left off — a template's
  // unused ones would otherwise print as rows of $0.00. A division with none left is left off too.
  const empty = (s: ProposalSpec) => !s.lines.some((l) => !l.isOptional) && !s.specText?.trim() && s.kind !== "SELECTION" && s.choice === null && !s.photos?.length;
  const order: string[] = [];
  for (const s of specs) if (!empty(s) && !order.includes(s.category)) order.push(s.category);
  const categories = order.map((name) => {
    const divisions = specs
      .filter((s) => s.category === name && !empty(s))
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
          photos: s.photos ?? [],
        };
      });
    return { name, amount: cents(divisions.reduce((t, d) => t + d.amount, 0)), divisions };
  });

  const feeAmount = fee ? cents(preTax - cost) : 0;
  const tax = taxLine ? { label: o.tax.label.trim() || extras.taxLabel || "Sales tax", pct: extras.taxPct ?? 0, amount: taxAmount } : null;
  const taxes = tax ? [tax] : [];

  const allowances = o.allowances
    ? specs
        .filter((s) => s.isAllowance)
        .map((s) => ({ id: s.id, name: s.name, division: s.category, note: s.specText, amount: cents(allowanceAmount(s.lines, s.allowanceProfit) + (s.allowanceExtra ?? 0)) }))
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
      s.lines.filter((l) => l.isOptional).map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, unit: l.unit, amount: cents(full(l)) })),
    ),
    totalOnly: o.totalOnly,
  };
}

/**
 * The proposal as the client's browser gets it: only what's shown on the page. Categories
 * you hid, prices you hid and item quantities you hid are taken out of the data itself —
 * not just left off the screen. The page reads the same.
 */
export function clientCopy(doc: ProposalDoc): ProposalDoc {
  const foot = !doc.totalOnly && !!(doc.fee || doc.tax);
  const categories = doc.categories
    .map((c) => ({
      name: doc.showCategories ? c.name : "",
      amount: doc.showCategories && doc.showCategoryAmounts ? c.amount : 0,
      divisions: c.divisions
        .filter((d) => d.show || d.items?.length)
        .map((d) => ({
          ...d,
          name: d.show ? d.name : "",
          specText: d.show && doc.showSpecText ? d.specText : null,
          photos: d.show ? d.photos : [],
          amount: d.show && d.showPrice ? d.amount : 0,
          items: d.items?.map((i) => ({ ...i, amount: doc.showItemPrices ? i.amount : 0, quantity: doc.showItemQty ? i.quantity : 0, unit: doc.showItemQty ? i.unit : "" })) ?? null,
        })),
    }))
    .filter((c) => doc.showCategories || c.divisions.length)
    // Unnamed (hidden) division headings still need something to tell them apart.
    .map((c, i) => (c.name ? c : { ...c, name: `\u200b${i}` }));
  return {
    ...doc,
    categories,
    subtotal: foot ? doc.subtotal : 0,
    fee: doc.totalOnly ? null : doc.fee,
    optional: doc.optional.map((i) => ({ ...i, amount: doc.totalOnly ? 0 : i.amount })),
  };
}

/**
 * The last day a proposal's pricing holds — "yyyy-mm-dd", `validDays` after the day it was priced
 * (sent) — or null when it has no "good for" days. Past it, the client can't approve it in their
 * portal (the builder can still mark it approved, or give it more days).
 */
export function goodThroughDay(pricedOn: string, validDays: number) {
  if (!(validDays > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(pricedOn)) return null;
  const [y, m, d] = pricedOn.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, d + validDays));
  return end.toISOString().slice(0, 10);
}

/** `today` ("yyyy-mm-dd", the company's day) is past the proposal's good-through day. */
export function proposalExpired(pricedOn: string, validDays: number, today: string) {
  const end = goodThroughDay(pricedOn, validDays);
  return !!end && today > end;
}

/**
 * The payment schedule's amounts, from the total: each payment its % of it, to the cent. When the
 * percentages add up to 100, the last payment takes what rounding leaves, so they add up to the total exactly.
 */
export function paymentSchedule(total: number, rows: { label: string; pct: number }[]) {
  const used = rows.filter((r) => r.label.trim() || r.pct > 0);
  const pctTotal = Math.round(used.reduce((t, r) => t + r.pct, 0) * 1000) / 1000;
  const out = used.map((r) => ({ label: r.label.trim(), pct: r.pct, amount: cents((total * r.pct) / 100) }));
  if (out.length && pctTotal === 100) {
    const others = out.slice(0, -1).reduce((t, r) => t + r.amount, 0);
    out[out.length - 1].amount = cents(total - others);
  }
  return { rows: out, pctTotal, amountTotal: cents(out.reduce((t, r) => t + r.amount, 0)) };
}

/** A picture's caption from its file name — none for a camera's own name (IMG_4053.jpg). */
export function photoCaption(name: string) {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  if (!base || /^(img|dsc|dscn|pxl|photo|image|screenshot|screen shot|mvimg|wp)[-_ ]?\d/i.test(base) || /^[\d_ -]+$/.test(base) || /^[0-9a-f-]{16,}$/i.test(base)) return null;
  return base.replace(/[_]+/g, " ").replace(/\s+/g, " ").slice(0, 60);
}

/** A line that reads as a heading: short, on its own, not a sentence or a list item. */
const isTermsTitle = (l: string) => l.length > 0 && l.length <= 60 && !/[.,;:!?]$/.test(l) && !/^([-•*–]|\d+[.)])/.test(l);

/**
 * The Terms box in blocks: paragraphs as typed (a blank line between them), each with a heading when
 * its first line is a short line of its own (no period at its end) — or when such a line stands alone
 * just above it.
 */
export function termsBlocks(text: string) {
  const paras = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: { title: string | null; body: string }[] = [];
  let pending: string | null = null;
  paras.forEach((p, i) => {
    const lines = p.split("\n");
    const first = lines[0].trim();
    if (lines.length === 1 && isTermsTitle(first) && i < paras.length - 1 && !pending) pending = first;
    else if (lines.length > 1 && isTermsTitle(first) && !pending) out.push({ title: first, body: lines.slice(1).join("\n").trim() });
    else {
      out.push({ title: pending, body: p });
      pending = null;
    }
  });
  if (pending) out.push({ title: null, body: pending });
  return out;
}
