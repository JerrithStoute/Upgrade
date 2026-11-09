/**
 * A job's Budget tab, one cost code at a time: what it was supposed to cost, what you've
 * agreed to pay, what's been spent, and where it's heading.
 *
 * Projected: a line checked Done is exactly what's been spent (later bills still land on it,
 * so projected follows them). Otherwise it's the bid or PO when there is one, else the
 * budget — or what's been spent, once spending passes that.
 */
export function projectedCost(l: { budget: number; committed: number | null; spent: number; done: boolean }) {
  if (l.done) return l.spent;
  return Math.max(l.committed ?? l.budget, l.spent);
}

/** Why projected is what it is, in a sentence (the Projected panel). */
export function projectedWhy(l: { budget: number; committed: number | null; spent: number; done: boolean; unsorted?: boolean }, money: (n: number) => string) {
  if (l.unsorted && !l.budget && l.committed == null) return "These costs have no cost code yet, so they count as over budget until you sort them.";
  if (l.done) return `This line is checked Done, so projected is exactly what's been spent: ${money(l.spent)}. A bill that comes in later still lands here, and projected goes up with it. Nothing to uncheck.`;
  const plan = l.committed ?? l.budget;
  if (l.spent > plan) return `Spending (${money(l.spent)}) has passed the ${l.committed != null ? "bid" : "budget"}, so projected is what's been spent.`;
  if (l.committed != null) return `You've committed ${money(l.committed)} (a bid you took or a PO), so projected uses that. Spent so far: ${money(l.spent)}.`;
  return `No bid or PO yet, so projected is the budget, ${money(l.budget)}, until spending passes it or you check Done.`;
}

export type BudgetTotals = { budget: number; committed: number; spent: number; projected: number; price: number; invoiced: number; done: number; lines: number };

export function budgetTotals(lines: { budget: number; committed: number | null; spent: number; done: boolean; price: number; invoiced: number; unsorted?: boolean }[]): BudgetTotals {
  const t: BudgetTotals = { budget: 0, committed: 0, spent: 0, projected: 0, price: 0, invoiced: 0, done: 0, lines: 0 };
  for (const l of lines) {
    t.budget += l.budget;
    t.committed += l.committed ?? 0;
    t.spent += l.spent;
    t.projected += projectedCost(l);
    t.price += l.price;
    t.invoiced += l.invoiced;
    if (!l.unsorted) {
      t.lines += 1;
      if (l.done) t.done += 1;
    }
  }
  return t;
}

const NONE = "none";
const LIVE_PO = ["SENT", "ACCEPTED", "CLOSED"];

/**
 * A job's projected cost, added up line by line the way its Budget tab does it: each cost code's
 * budget, committed (sent POs, and bids taken that no PO was made from), spent and Done.
 * Costs with no cost code (or one not in `knownCodes`) are one line. Used by Reports.
 */
export function jobProjectedCost(j: {
  budget: { costCodeId: string | null; amount: number }[];
  spent: { costCodeId: string | null; amount: number }[];
  pos: { status: string; bidId: string | null; lines: { costCodeId: string | null; quantity: number; unitCost: number }[] }[];
  awards: { bidId: string; codeKey: string; lines: { codeKey: string; quantity: number; unitPrice: number | null }[] }[];
  done: string[];
  knownCodes?: Set<string>;
}) {
  const key = (id: string | null) => (id && (!j.knownCodes || j.knownCodes.has(id)) ? id : NONE);
  const lines = new Map<string, { budget: number; committed: number | null; spent: number }>();
  const at = (id: string | null) => {
    const k = key(id);
    let l = lines.get(k);
    if (!l) lines.set(k, (l = { budget: 0, committed: null, spent: 0 }));
    return l;
  };
  for (const b of j.budget) at(b.costCodeId).budget += b.amount;
  for (const s of j.spent) at(s.costCodeId).spent += s.amount;
  const live = j.pos.filter((p) => LIVE_PO.includes(p.status));
  for (const po of live)
    for (const pl of po.lines) {
      const l = at(pl.costCodeId);
      l.committed = (l.committed ?? 0) + pl.quantity * pl.unitCost;
    }
  const fromBid = new Set(live.map((p) => p.bidId).filter(Boolean));
  for (const a of j.awards) {
    if (fromBid.has(a.bidId)) continue;
    const code = a.codeKey.startsWith("sub:") ? a.codeKey.slice(4) : a.codeKey;
    const amount = a.lines.filter((bl) => bl.codeKey === code && bl.unitPrice != null).reduce((n, bl) => n + bl.quantity * (bl.unitPrice ?? 0), 0);
    if (!amount) continue;
    const l = at(code === NONE ? null : code);
    l.committed = (l.committed ?? 0) + amount;
  }
  const done = new Set(j.done);
  let total = 0;
  for (const [k, l] of lines) total += projectedCost({ ...l, done: k !== NONE && done.has(k) });
  return Math.round(total * 100) / 100;
}
