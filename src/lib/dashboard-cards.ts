/**
 * The cards a dashboard can show. Each person picks theirs and their order (Customize on the
 * Dashboard); nothing saved = the default. Report cards are for those who can see Reports.
 */

export type CardSize = "full" | "wide" | "narrow";
export type CardDef = { key: string; title: string; description: string; size: CardSize; reports?: boolean };

export const DASHBOARD_CARDS: CardDef[] = [
  { key: "stats", title: "Key numbers", description: "Active jobs, contract value, receivables, your to-dos, client approvals", size: "full" },
  { key: "projects", title: "Active projects", description: "Each job with its schedule progress", size: "wide" },
  { key: "vendors", title: "Subs & vendors", description: "Bills to approve and insurance running out", size: "narrow" },
  { key: "attention", title: "Needs attention", description: "Overdue selections and to-dos, change orders waiting, late invoices", size: "wide" },
  { key: "todos", title: "My to-dos", description: "Your open to-dos, soonest first", size: "narrow" },
  { key: "schedule", title: "Upcoming schedule", description: "Tasks starting in the next 7 days", size: "wide" },
  { key: "activity", title: "Recent activity", description: "What's happened lately across jobs", size: "narrow" },
  { key: "profit", title: "Job profit", description: "Where each active job is heading against its bid", size: "wide", reports: true },
  { key: "wip", title: "Over / under billing", description: "Billed ahead of or behind the work (WIP)", size: "narrow", reports: true },
  { key: "cash", title: "Cash next 30 days", description: "Money coming in and going out", size: "narrow", reports: true },
  { key: "aging", title: "What clients owe", description: "Unpaid invoices by how late they are", size: "narrow", reports: true },
];

export const DEFAULT_CARDS = ["stats", "projects", "vendors", "attention", "todos", "schedule", "activity"];

/** The cards someone can choose from. */
export function availableCards(canSeeReports: boolean) {
  return DASHBOARD_CARDS.filter((c) => !c.reports || canSeeReports);
}

/** Their saved cards (known ones they may see, no repeats), or the default. */
export function pickedCards(saved: string | null | undefined, canSeeReports: boolean): string[] {
  const allowed = new Set(availableCards(canSeeReports).map((c) => c.key));
  let list: unknown = null;
  try {
    list = saved ? JSON.parse(saved) : null;
  } catch {
    list = null;
  }
  if (!Array.isArray(list)) return DEFAULT_CARDS.filter((k) => allowed.has(k));
  return [...new Set(list.filter((k): k is string => typeof k === "string" && allowed.has(k)))];
}
