import "server-only";
import { db } from "./db";
import { lineCost, lineTax } from "./utils";
import { accrued, closedMonths, dailyRate, loanOn, dayNo, DEFAULT_CLOSING_LINES, type Carry, type ClosingLine, type Sheet } from "./spec-math";

/**
 * Spec houses: built to sell. Carrying costs (loan interest — following its draws —
 * insurance, HOA…) are charged to the job's Budget a month at a time under their cost codes;
 * the offer calculator adds what's been charged to what's still coming up to the closing date —
 * and uses the rest of the budget (each cost code: its estimate, or what's been spent once
 * that's more) for the house itself, never the estimate's carrying-cost lines on top. Property
 * taxes aren't a carrying cost: they're paid at closing (prorated), on the net sheet.
 */

/** The sale of the house: its selling costs go on the Budget under this vendor. */
export const SALE_VENDOR = "Sale of home";

export type SpecDefaults = { listPct: number; buyerPct: number; concessions: number; closingLines: ClosingLine[] };
export const SPEC_DEFAULTS: SpecDefaults = { listPct: 3, buyerPct: 2.5, concessions: 0, closingLines: DEFAULT_CLOSING_LINES };

export function parseLines(json: string | null | undefined): ClosingLine[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v)
      ? v
          .filter((l) => l && typeof l.name === "string")
          .map((l) => ({ name: String(l.name), kind: l.kind === "PCT" ? "PCT" : "FLAT", value: Number(l.value) || 0, ...(l.title ? { title: true } : {}) }))
      : null;
  } catch {
    return null;
  }
}

export async function specDefaults(): Promise<SpecDefaults> {
  const c = await db.company.findFirst({ select: { specDefaults: true } });
  try {
    const saved = c?.specDefaults ? JSON.parse(c.specDefaults) : {};
    return {
      listPct: Number(saved.listPct ?? SPEC_DEFAULTS.listPct),
      buyerPct: Number(saved.buyerPct ?? SPEC_DEFAULTS.buyerPct),
      concessions: Number(saved.concessions ?? 0),
      closingLines: parseLines(saved.closingLines ? JSON.stringify(saved.closingLines) : null) ?? DEFAULT_CLOSING_LINES,
    };
  } catch {
    return SPEC_DEFAULTS;
  }
}

type CostWithMoves = Parameters<typeof accrued>[0];
const withMoves = <T extends { loanEntries: { kind: string; date: Date; amount: number; ratePct: number | null }[] }>(c: T & Omit<Carry, "moves">): CostWithMoves => ({
  ...c,
  moves: c.loanEntries.filter((e) => e.kind !== "ACTUAL"),
});

/**
 * Charges carrying costs to the Budget: each month once it's over (one-time costs on their
 * day). A loan month with the bank's actual interest uses that — and fixes a month already charged.
 */
export async function syncCarrying(projectId?: string, today = new Date()) {
  const costs = await db.carryingCost.findMany({
    where: { project: { isSpec: true, ...(projectId ? { id: projectId } : {}) } },
    include: {
      expenses: { select: { id: true, carryingMonth: true, amount: true } },
      loanEntries: true,
      project: { select: { spec: { select: { soldAt: true } } } },
    },
  });
  for (const c of costs) {
    const stop = c.project.spec?.soldAt ?? null;
    const have = new Map(c.expenses.map((e) => [e.carryingMonth, e]));
    const actual = new Map(c.loanEntries.filter((e) => e.kind === "ACTUAL" && e.month).map((e) => [e.month!, e.amount]));
    const cost = withMoves(c);
    const posts: { key: string; amount: number; date: Date; label: string }[] = [];
    if (c.kind !== "INTEREST" && c.frequency === "ONCE") {
      if (c.startDate <= today && (!stop || c.startDate < stop) && !have.has("once")) posts.push({ key: "once", amount: c.amount, date: c.startDate, label: c.name });
    } else {
      for (const m of closedMonths(cost, today, stop)) {
        const amount = actual.get(m.key) ?? accrued(cost, m.from, m.to, stop);
        const had = have.get(m.key);
        if (had) {
          // A loan's months follow its draw log (or the bank's figure, when you've typed it) —
          // so draws logged late, or a bank statement, fix months already charged.
          if ((c.kind === "INTEREST" || actual.has(m.key)) && Math.abs(had.amount - amount) > 0.004)
            await db.expense.update({ where: { id: had.id }, data: { amount: Math.round(amount * 100) / 100 } });
          continue;
        }
        if (amount > 0.004)
          posts.push({
            key: m.key,
            amount,
            date: new Date(m.to.getTime() - 86400000),
            label: `${c.name} — ${m.from.toLocaleString("en-US", { month: "long", year: "numeric" })}${actual.has(m.key) ? " (bank's figure)" : ""}`,
          });
      }
    }
    for (const p of posts)
      await db.expense.create({
        data: {
          projectId: c.projectId,
          costCodeId: c.costCodeId,
          date: p.date,
          vendor: c.name,
          description: `Carrying cost: ${p.label}`,
          category: "OTHER",
          amount: Math.round(p.amount * 100) / 100,
          status: "PAID",
          carryingCostId: c.id,
          carryingMonth: p.key,
        },
      });
  }
}

export type LoanEntryInfo = { id: string; kind: string; date: string; amount: number; ratePct: number | null; month: string | null; note: string | null };

export type CarryInfo = {
  id: string;
  name: string;
  kind: string;
  amount: number;
  frequency: string;
  loanBalance: number | null;
  ratePct: number | null;
  startDate: string;
  endDate: string | null;
  costCodeId: string | null;
  codeLabel: string | null;
  /** Interest: draws, paydowns and rate changes (for the math), and every entry (to show). */
  moves: { kind: string; date: string; amount: number; ratePct: number | null }[];
  entries: LoanEntryInfo[];
  /** Interest: today's balance and rate. */
  balance: number | null;
  rate: number | null;
  perDay: number;
  /** Charged to the Budget so far, and the first day not charged yet. */
  posted: number;
  nextFrom: string | null;
  /** Charged + running up to today. */
  toDate: number;
  /** The estimate's cost for its cost code (shared by every carrying cost on that code). */
  estimated: number | null;
};

/** Everything the spec screens and the offer calculator need for one house. */
export async function specPicture(projectId: string, today = new Date()) {
  await syncCarrying(projectId, today);
  const [project, estimate, cos, expenses, carrying, defaults] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, include: { spec: true } }),
    db.estimate.findFirst({
      where: { projectId },
      orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { version: "desc" }],
      include: { items: { where: { isOptional: false } } },
    }),
    db.changeOrder.findMany({ where: { projectId, status: "APPROVED" }, include: { items: true } }),
    db.expense.findMany({ where: { projectId }, select: { amount: true, costCodeId: true, carryingCostId: true, vendor: true } }),
    db.carryingCost.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { costCode: true, expenses: { select: { amount: true, carryingMonth: true } }, loanEntries: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } },
    }),
    specDefaults(),
  ]);
  const spec = project.spec;
  const stop = spec?.soldAt ?? null;
  const key = (id: string | null) => id ?? "none";
  const est = new Map<string, number>();
  // (Kept apart too, to show what The house is made of: the estimate, its sales tax, change orders.)
  const estOnly = new Map<string, number>();
  const taxOnly = new Map<string, number>();
  for (const i of estimate?.items ?? []) {
    est.set(key(i.costCodeId), (est.get(key(i.costCodeId)) ?? 0) + lineCost(i));
    estOnly.set(key(i.costCodeId), (estOnly.get(key(i.costCodeId)) ?? 0) + i.quantity * i.unitCost);
    taxOnly.set(key(i.costCodeId), (taxOnly.get(key(i.costCodeId)) ?? 0) + lineTax(i));
  }
  for (const co of cos) for (const i of co.items) est.set(key(i.costCodeId), (est.get(key(i.costCodeId)) ?? 0) + lineCost(i));
  const spent = new Map<string, number>();
  let carryingPosted = 0;
  for (const e of expenses) {
    if (e.carryingCostId) carryingPosted += e.amount;
    else if (e.vendor !== SALE_VENDOR) spent.set(key(e.costCodeId), (spent.get(key(e.costCodeId)) ?? 0) + e.amount);
  }
  const carryCodes = new Set(carrying.map((c) => c.costCodeId).filter((x): x is string => !!x));
  // The house itself: each cost code, its estimate or what's been spent once that's more.
  // Carrying-cost codes count only what's been spent by hand there (the rest is in carrying).
  let build = 0;
  let buildSpent = 0;
  const parts = { estimate: 0, tax: 0, changeOrders: 0, overEstimate: 0 };
  for (const k of new Set([...est.keys(), ...spent.keys()])) {
    const s = spent.get(k) ?? 0;
    buildSpent += s;
    const e = est.get(k) ?? 0;
    build += carryCodes.has(k) ? s : Math.max(e, s);
    if (carryCodes.has(k)) parts.overEstimate += s;
    else {
      parts.estimate += estOnly.get(k) ?? 0;
      parts.tax += taxOnly.get(k) ?? 0;
      parts.changeOrders += e - (estOnly.get(k) ?? 0) - (taxOnly.get(k) ?? 0);
      parts.overEstimate += Math.max(0, s - e);
    }
  }
  const iso = (d: Date) => d.toISOString();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const items: CarryInfo[] = carrying.map((c) => {
    const cost = withMoves(c);
    const posted = c.expenses.reduce((n, e) => n + e.amount, 0);
    const months = c.expenses
      .map((e) => e.carryingMonth)
      .filter((m): m is string => !!m && m !== "once")
      .sort();
    const last = months[months.length - 1];
    const once = c.expenses.some((e) => e.carryingMonth === "once");
    // The first day not charged yet (null: a one-time cost already charged — nothing more to come).
    const nextFrom = once ? null : last ? new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 1) : c.startDate;
    const loan = c.kind === "INTEREST" ? loanOn(cost, dayNo(today)) : null;
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      amount: c.amount,
      frequency: c.frequency,
      loanBalance: c.loanBalance,
      ratePct: c.ratePct,
      startDate: iso(c.startDate),
      endDate: c.endDate ? iso(c.endDate) : null,
      costCodeId: c.costCodeId,
      codeLabel: c.costCode ? [c.costCode.code, c.costCode.name].filter(Boolean).join(" ") : null,
      moves: (cost.moves ?? []).map((m) => ({ kind: m.kind, date: iso(m.date), amount: m.amount, ratePct: m.ratePct })),
      entries: c.loanEntries.map((e) => ({ id: e.id, kind: e.kind, date: iso(e.date), amount: e.amount, ratePct: e.ratePct, month: e.month, note: e.note })),
      balance: loan?.balance ?? null,
      rate: loan?.rate ?? null,
      perDay: stop && today >= stop ? 0 : dailyRate(cost, today),
      posted,
      nextFrom: nextFrom ? iso(nextFrom) : null,
      toDate: posted + (nextFrom ? accrued(cost, nextFrom, tomorrow, stop) : 0),
      estimated: c.costCodeId ? (est.get(c.costCodeId) ?? null) : null,
    };
  });
  // The house's net sheet (concessions are usual ones; repairs come with an offer).
  const sheet: Sheet = {
    listPct: spec?.listPct ?? defaults.listPct,
    buyerPct: spec?.buyerPct ?? defaults.buyerPct,
    lines: parseLines(spec?.closingLines) ?? defaults.closingLines,
    concessions: spec?.concessions ?? defaults.concessions,
    repairs: 0,
    annualTax: spec?.annualTax ?? null,
    hoaAnnual: spec?.hoaAnnual ?? null,
    hoaPaidThrough: spec?.hoaPaidThrough ?? null,
  };
  const loan = items.find((c) => c.kind === "INTEREST");
  return {
    project,
    spec,
    defaults,
    sheet,
    build,
    /** What The house is made of: the estimate's cost, its sales tax, approved change orders, and spending past the estimate. */
    buildParts: parts,
    buildSpent,
    /** Still to spend on the house — drawn on the loan as it's built. */
    toFinish: Math.max(0, build - buildSpent),
    loanRate: loan?.rate ?? null,
    carrying: items,
    carryingPosted,
    carryingToDate: items.reduce((n, c) => n + c.toDate, 0),
    perDay: items.reduce((n, c) => n + c.perDay, 0),
    stop: stop ? iso(stop) : null,
    hasEstimate: !!estimate,
  };
}
export type SpecPicture = Awaited<ReturnType<typeof specPicture>>;
