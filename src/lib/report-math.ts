/**
 * The arithmetic behind Reports (no database here, so it's tested on its own):
 * a job's profit and WIP numbers, AR aging buckets, and cash-flow periods.
 */

const cents = (n: number) => Math.round(n * 100) / 100;

export type JobInputs = {
  /** Approved estimate + approved change orders (what the client pays). */
  contract: number;
  /** What it's budgeted to cost: the approved estimate's and change orders' cost. */
  budgetCost: number;
  /** Cost so far: expenses and approved bills. */
  actualCost: number;
  /** Invoiced so far (not drafts or void). */
  billed: number;
  /** Paid by the client so far. */
  collected: number;
  /** A finished job is 100% complete whatever its costs say. */
  completed?: boolean;
};

export type JobNumbers = JobInputs & {
  /** Expected total cost: the budget, or what's been spent if that's already more. */
  projectedCost: number;
  budgetProfit: number;
  projectedProfit: number;
  budgetMargin: number | null;
  projectedMargin: number | null;
  /** Projected profit minus budgeted profit (negative = the job is eating its profit). */
  fade: number;
  /** Cost-to-cost: cost so far ÷ expected total cost (0–1). Null without a budget. */
  pctComplete: number | null;
  /** Contract × % complete: what you've earned so far. */
  earned: number;
  /** Billed − earned: positive = over-billed, negative = under-billed. */
  overUnder: number;
  costToFinish: number;
  /** Profit earned so far (earned − cost so far) and still to come. */
  profitToDate: number;
  profitToCome: number;
  /** Billed but not paid yet. */
  owed: number;
};

export function jobNumbers(j: JobInputs): JobNumbers {
  const projectedCost = Math.max(j.budgetCost, j.actualCost);
  const projectedProfit = j.contract - projectedCost;
  // No budget (no approved estimate): nothing to measure against — bid = where it's heading, no fade.
  const budgetProfit = j.budgetCost > 0 ? j.contract - j.budgetCost : projectedProfit;
  const margin = (p: number) => (j.contract > 0 ? p / j.contract : null);
  const pctComplete = j.completed ? 1 : projectedCost > 0 ? Math.min(1, j.actualCost / projectedCost) : null;
  // Without a budget there's no way to tell what's earned — treat billing as earned (neither over nor under).
  const earned = pctComplete == null ? j.billed : j.contract * pctComplete;
  const profitToDate = earned - j.actualCost;
  return {
    ...j,
    projectedCost: cents(projectedCost),
    budgetProfit: cents(budgetProfit),
    projectedProfit: cents(projectedProfit),
    budgetMargin: margin(budgetProfit),
    projectedMargin: margin(projectedProfit),
    fade: cents(projectedProfit - budgetProfit),
    pctComplete,
    earned: cents(earned),
    overUnder: cents(j.billed - earned),
    costToFinish: cents(j.completed ? 0 : projectedCost - j.actualCost),
    profitToDate: cents(profitToDate),
    profitToCome: cents(projectedProfit - profitToDate),
    owed: cents(j.billed - j.collected),
  };
}

// --- AR aging -------------------------------------------------------------------------------

export const AGING_BUCKETS = [
  { key: "current", label: "Not due yet" },
  { key: "d30", label: "1–30 days late" },
  { key: "d60", label: "31–60" },
  { key: "d90", label: "61–90" },
  { key: "d90plus", label: "Over 90" },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days past due (0 or less = not late yet). */
export function daysLate(due: Date, today: Date) {
  return Math.round((startOfDay(today).getTime() - startOfDay(due).getTime()) / DAY);
}

export function agingBucket(days: number): AgingKey {
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "d90plus";
}

// --- Cash flow ------------------------------------------------------------------------------

export type Period = { key: string; label: string; start: Date; end: Date; past: boolean; current: boolean };

const mondayOf = (d: Date) => {
  const s = startOfDay(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - ((s.getDay() + 6) % 7));
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `back` periods before this one, this one, and `ahead` after it — by week (Monday start) or month. */
export function periods(by: "week" | "month", today: Date, back: number, ahead: number): Period[] {
  const out: Period[] = [];
  for (let i = -back; i <= ahead; i++) {
    let start: Date;
    let end: Date;
    let label: string;
    if (by === "month") {
      start = new Date(today.getFullYear(), today.getMonth() + i, 1);
      end = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
      label = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    } else {
      const m = mondayOf(today);
      start = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7 * i);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      label = `Week of ${MONTHS[start.getMonth()]} ${start.getDate()}`;
    }
    out.push({ key: start.toISOString().slice(0, 10), label, start, end, past: i < 0, current: i === 0 });
  }
  return out;
}

/** The period a date falls in (null = outside the range). */
export function periodOf(list: Period[], d: Date) {
  return list.find((p) => d >= p.start && d < p.end) ?? null;
}
