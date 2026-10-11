/**
 * The cards a dashboard can show, and where each person put them: a full-width band at the
 * top, then three columns that each stack their cards with no gaps. Cards are dragged around
 * on the Dashboard; Customize turns them on and off. Nothing saved = the default. Report cards
 * are for those who can see Reports.
 */

export type CardDef = { key: string; title: string; description: string; reports?: boolean };

export const DASHBOARD_CARDS: CardDef[] = [
  { key: "stats", title: "Key numbers", description: "Active jobs, contract value, receivables, your to-dos, client approvals" },
  { key: "projects", title: "Active projects", description: "Each job with its schedule progress" },
  { key: "sales", title: "Sales pipeline", description: "Open leads by stage, follow-ups due, win rate" },
  { key: "vendors", title: "Subs & vendors", description: "Bills to approve and insurance running out" },
  { key: "attention", title: "Needs attention", description: "Overdue selections and to-dos, change orders waiting, late invoices" },
  { key: "todos", title: "My to-dos", description: "Your open to-dos, soonest first" },
  { key: "schedule", title: "Upcoming schedule", description: "Tasks starting in the next 7 days" },
  { key: "activity", title: "Recent activity", description: "What's happened lately across jobs" },
  { key: "profit", title: "Job profit", description: "Where each active job is heading against its bid", reports: true },
  { key: "wip", title: "Over / under billing", description: "Billed ahead of or behind the work (WIP)", reports: true },
  { key: "cash", title: "Cash next 30 days", description: "Money coming in and going out", reports: true },
  { key: "aging", title: "What clients owe", description: "Unpaid invoices by how late they are", reports: true },
];

export const COLUMNS = 3;

/** Where the cards go: `wide` = the full-width band at the top; `cols` = the three columns. */
export type Layout = { wide: string[]; cols: string[][] };

export const DEFAULT_LAYOUT: Layout = {
  wide: ["stats"],
  cols: [
    ["projects", "attention"],
    ["sales", "schedule"],
    ["vendors", "todos", "activity"],
  ],
};

/** The cards someone can choose from. */
export function availableCards(canSeeReports: boolean) {
  return DASHBOARD_CARDS.filter((c) => !c.reports || canSeeReports);
}

/** Every card on a layout, top band first, then column by column. */
export const layoutKeys = (l: Layout) => [...l.wide, ...l.cols.flat()];

/** A layout with only cards they may see, each once, and always three columns. */
function clean(l: Layout, allowed: Set<string>): Layout {
  const seen = new Set<string>();
  const keep = (k: unknown): k is string => typeof k === "string" && allowed.has(k) && !seen.has(k) && (seen.add(k), true);
  const wide = (Array.isArray(l.wide) ? l.wide : []).filter(keep);
  const cols = Array.from({ length: COLUMNS }, (_, i) => (Array.isArray(l.cols?.[i]) ? l.cols[i] : []).filter(keep));
  return { wide, cols };
}

/** The shortest column (fewest cards) — where a new card goes. */
const shortest = (cols: string[][]) => cols.reduce((best, c, i) => (c.length < cols[best].length ? i : best), 0);

/**
 * Their saved layout, or the default. An older saved list of cards (before cards could be
 * moved) keeps those cards: Key numbers across the top, the rest dealt into the columns.
 */
export function dashboardLayout(saved: string | null | undefined, canSeeReports: boolean): Layout {
  const allowed = new Set(availableCards(canSeeReports).map((c) => c.key));
  let v: unknown = null;
  try {
    v = saved ? JSON.parse(saved) : null;
  } catch {
    v = null;
  }
  if (Array.isArray(v)) {
    const keys = v.filter((k): k is string => typeof k === "string");
    const l: Layout = { wide: keys.filter((k) => k === "stats"), cols: Array.from({ length: COLUMNS }, () => []) };
    for (const k of keys) if (k !== "stats") l.cols[shortest(l.cols)].push(k);
    return clean(l, allowed);
  }
  if (v && typeof v === "object" && "cols" in v) return clean(v as Layout, allowed);
  return clean(DEFAULT_LAYOUT, allowed);
}

/** Turns cards on and off: cards kept stay where they are; new ones go to the shortest column. */
export function withCards(l: Layout, keys: string[], canSeeReports: boolean): Layout {
  const allowed = new Set(availableCards(canSeeReports).map((c) => c.key));
  const on = new Set(keys.filter((k) => allowed.has(k)));
  const next: Layout = { wide: l.wide.filter((k) => on.has(k)), cols: l.cols.map((c) => c.filter((k) => on.has(k))) };
  const have = new Set(layoutKeys(next));
  for (const k of keys) {
    if (!on.has(k) || have.has(k)) continue;
    (k === "stats" ? next.wide : next.cols[shortest(next.cols)]).push(k);
    have.add(k);
  }
  return next;
}

/** Where a dragged card lands: the top band or a column (0–2), before `index` (end if past it). */
export type Spot = { zone: "wide" | number; index: number };

/** Moves a card to a spot. */
export function moveCard(l: Layout, key: string, to: Spot): Layout {
  const next: Layout = { wide: l.wide.filter((k) => k !== key), cols: l.cols.map((c) => c.filter((k) => k !== key)) };
  // The index counts the list as it was shown (with the card still in it).
  const before = to.zone === "wide" ? l.wide : l.cols[to.zone];
  const from = before.indexOf(key);
  const index = from >= 0 && from < to.index ? to.index - 1 : to.index;
  const list = to.zone === "wide" ? next.wide : next.cols[to.zone];
  list.splice(Math.max(0, Math.min(index, list.length)), 0, key);
  return next;
}
