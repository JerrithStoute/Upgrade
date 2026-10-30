import { z } from "zod";

/**
 * Positions: what a team member sees and changes. One rule everywhere:
 *
 * - Each AREA of the program is Hidden, Can view or Can edit.
 * - "Which jobs": every job, or only the jobs they manage or are on the team of.
 * - Three switches: may delay a job's schedule, may approve & pay bills, sees costs and profit.
 *   With costs and profit off, the screens that are mostly your costs are hidden (Takeoffs,
 *   Budget, Purchasing, Reports, the Catalog), estimates and change orders open as the
 *   client sees them (the proposal, the change order document), and Selections and Timesheets
 *   leave out cost and profit numbers.
 * - A person gets their position's access; an admin can change single areas for just them.
 * - Admins get everything, always. Company, team and billing settings stay admin-only —
 *   whoever can change the team could give themselves anything.
 *
 * Pure (no database), so the rules can be tested and shown the same way everywhere.
 */

export const AREAS = [
  { key: "leads", label: "Leads & clients", short: "Leads", hint: "Leads, clients" },
  { key: "estimates", label: "Estimates, proposals & bids", short: "Estimates", hint: "Estimate, proposal, lumber bids" },
  { key: "takeoffs", label: "Takeoffs & Material List", short: "Takeoffs", hint: "Takeoff, Material list" },
  { key: "selections", label: "Selections & change orders", short: "Selections & COs", hint: "Selections, change orders" },
  { key: "field", label: "Schedule, daily logs & to-dos", short: "Schedule & logs", hint: "Schedule, daily logs, to-dos, warranty" },
  { key: "files", label: "Files, plans & messages", short: "Files", hint: "Files, plans, client messages" },
  { key: "purchasing", label: "Purchasing, bills & inventory", short: "Purchasing", hint: "POs, bills, inventory" },
  { key: "budget", label: "Budget & spec sales", short: "Budget", hint: "Budget, spec sale, spec homes" },
  { key: "invoices", label: "Invoices", short: "Invoices", hint: "Client invoices and payments" },
  { key: "reports", label: "Reports", short: "Reports", hint: "Reports, money cards on the dashboard" },
  { key: "time", label: "Everyone's time", short: "Everyone's time", hint: "Their own time clock always works; this is everyone else's hours and timesheets" },
  { key: "lists", label: "Catalog & lists", short: "Catalog", hint: "The Catalog (Item List, doors, windows, lumber, templates), and cost codes, vendors and lead sources in Settings" },
  { key: "quickbooks", label: "Settings: QuickBooks", short: "QuickBooks", hint: "QuickBooks connection and matching" },
] as const;

export type AreaKey = (typeof AREAS)[number]["key"];
export const AREA_KEYS = AREAS.map((a) => a.key) as AreaKey[];

/** 0 Hidden, 1 Can view, 2 Can edit. */
export type Level = 0 | 1 | 2;
export const LEVELS: { value: Level; label: string }[] = [
  { value: 0, label: "Hidden" },
  { value: 1, label: "Can view" },
  { value: 2, label: "Can edit" },
];
export const levelLabel = (l: Level) => LEVELS[l].label;

export type Jobs = "ALL" | "MINE";
export const JOBS_LABEL: Record<Jobs, string> = { ALL: "Every job", MINE: "Only their jobs (manager or on the job's team)" };

export type Access = Record<AreaKey, Level> & { jobs: Jobs; delay: boolean; approveBills: boolean; costs: boolean };
/** A person's changes from their position (only what differs). */
export type AccessChanges = Partial<Access>;

export const SWITCHES = [
  { key: "delay", label: "Can delay a job's schedule" },
  { key: "approveBills", label: "Can approve & pay bills" },
  { key: "costs", label: "Sees costs and profit" },
] as const;

/** What "Sees costs and profit" off does — said the same way wherever the switch is. */
export const COSTS_OFF_NOTE =
  "Off: Takeoffs, Budget, Purchasing, Reports and the Catalog are hidden; estimates and change orders open as the client sees them; Selections and Timesheets leave out cost and profit.";

/** The areas that are mostly your costs — hidden when costs and profit are. */
const COST_AREAS: AreaKey[] = ["takeoffs", "budget", "purchasing", "reports", "lists"];

const level = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const changesSchema = z
  .object({
    ...Object.fromEntries(AREA_KEYS.map((k) => [k, level.optional()])),
    jobs: z.enum(["ALL", "MINE"]).optional(),
    delay: z.boolean().optional(),
    approveBills: z.boolean().optional(),
    costs: z.boolean().optional(),
  })
  .strip();

const areas = (l: Partial<Record<AreaKey, Level>>, rest: Level = 0) => Object.fromEntries(AREA_KEYS.map((k) => [k, l[k] ?? rest])) as Record<AreaKey, Level>;

/** Admins: everything. */
export const ADMIN_ACCESS: Access = { ...areas({}, 2), jobs: "ALL", delay: true, approveBills: true, costs: true };

/** Clients, vendors and people without a login: nothing inside the program. */
export const NO_ACCESS: Access = { ...areas({}), jobs: "MINE", delay: false, approveBills: false, costs: false };

/** The positions every company starts with (all can be changed, renamed or removed). */
export const STARTER_POSITIONS: { key: string; name: string; access: Access }[] = [
  {
    // What "Staff" could do before positions existed — nobody's access changes on the day they arrive.
    key: "STAFF",
    name: "Staff",
    access: {
      ...areas({ leads: 2, estimates: 2, takeoffs: 2, selections: 2, field: 2, files: 2, purchasing: 2, budget: 2, invoices: 2 }),
      jobs: "ALL",
      delay: false,
      approveBills: false,
      costs: true,
    },
  },
  {
    key: "PM",
    name: "Project manager",
    access: {
      ...areas({ leads: 2, estimates: 2, takeoffs: 2, selections: 2, field: 2, files: 2, purchasing: 2, budget: 2, invoices: 1, time: 1 }),
      jobs: "MINE",
      delay: true,
      approveBills: false,
      costs: true,
    },
  },
  {
    key: "OFFICE",
    name: "Office / Bookkeeper",
    access: {
      ...areas({ leads: 1, estimates: 1, selections: 1, field: 1, files: 1, purchasing: 2, budget: 2, invoices: 2, reports: 2, time: 2, lists: 1, quickbooks: 2 }),
      jobs: "ALL",
      delay: false,
      approveBills: true,
      costs: true,
    },
  },
  {
    key: "ESTIMATOR",
    name: "Estimator",
    access: {
      ...areas({ leads: 2, estimates: 2, takeoffs: 2, selections: 1, field: 1, files: 2, purchasing: 1, budget: 1, lists: 2 }),
      jobs: "ALL",
      delay: false,
      approveBills: false,
      costs: true,
    },
  },
  {
    // In the field: the schedule, daily logs (and their photos), to-dos, plans and files — no money.
    key: "FIELD",
    name: "Field crew",
    access: { ...areas({ field: 2, files: 1 }), jobs: "ALL", delay: false, approveBills: false, costs: false },
  },
];
export const STAFF_ACCESS = STARTER_POSITIONS[0].access;

/** Reads saved access (a position's, or a person's changes); anything unreadable is left out. */
export function parseChanges(json: string | null | undefined): AccessChanges {
  if (!json) return {};
  try {
    const r = changesSchema.safeParse(JSON.parse(json));
    return r.success ? (r.data as AccessChanges) : {};
  } catch {
    return {};
  }
}

/** A position's access: what's saved, anything missing from Staff. */
export function positionAccess(json: string | null | undefined): Access {
  return { ...STAFF_ACCESS, ...parseChanges(json) };
}

/**
 * What someone may do: admins everything; others their position (Staff if none) plus their own
 * changes — and with costs and profit off, the mostly-cost areas hidden (COSTS_OFF_NOTE).
 */
export function resolveAccess(role: string, positionJson: string | null | undefined, changesJson: string | null | undefined): Access {
  if (role === "ADMIN") return ADMIN_ACCESS;
  return withCostRule({ ...positionAccess(positionJson), ...parseChanges(changesJson) });
}

/** Costs and profit off: the areas that are mostly costs are hidden, whatever else they're set to. */
export function withCostRule(a: Access): Access {
  if (a.costs) return a;
  const out = { ...a };
  for (const k of COST_AREAS) out[k] = 0;
  return out;
}

/** As the grid shows it (before the cost rule) — for editing a position or a person. */
export function savedAccess(positionJson: string | null | undefined, changesJson: string | null | undefined): Access {
  return { ...positionAccess(positionJson), ...parseChanges(changesJson) };
}

/** A position (or person) in a line: "Edits: Estimates, Takeoffs · Views: Budget · Every job · No costs or profit". */
export function summarizeAccess(raw: Access): string {
  const a = withCostRule(raw);
  const names = (l: Level) => AREAS.filter((x) => a[x.key] === l).map((x) => x.short);
  const edits = names(2);
  const views = names(1);
  const parts = [
    edits.length ? `Edits: ${edits.join(", ")}` : "",
    views.length ? `Views: ${views.join(", ")}` : "",
    !edits.length && !views.length ? "Only their own time clock and to-dos" : "",
    a.jobs === "MINE" ? "Only their jobs" : "Every job",
    a.costs ? "" : "No costs or profit",
    a.delay ? "Can delay" : "",
    a.approveBills ? "Approves bills" : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Only what `access` changes from `base` — what's saved for a person. */
export function diffAccess(base: Access, access: Access): AccessChanges {
  const out: AccessChanges = {};
  for (const k of Object.keys(base) as (keyof Access)[]) if (access[k] !== base[k]) (out as Record<string, unknown>)[k] = access[k];
  return out;
}

/** Access from a form: `area_<key>` selects (0/1/2), `jobs`, and the switches as checkboxes. */
export function accessFromForm(get: (name: string) => string | null): Access {
  const lv = (v: string | null): Level => (v === "2" ? 2 : v === "1" ? 1 : 0);
  return {
    ...(Object.fromEntries(AREA_KEYS.map((k) => [k, lv(get(`area_${k}`))])) as Record<AreaKey, Level>),
    jobs: get("jobs") === "MINE" ? "MINE" : "ALL",
    delay: get("delay") === "on",
    approveBills: get("approveBills") === "on",
    costs: get("costs") === "on",
  };
}

/** The area a page belongs to (null: everyone on the team — dashboard, a job's overview, their own account…). */
export function areaForPath(pathname: string): AreaKey | null {
  const job = pathname.match(/^\/projects\/[^/]+\/([^/]+)/);
  const seg = job ? job[1] : pathname.split("/")[1];
  // Everyone has their own to-dos (a job's To-Dos tab is the field area's).
  if (!job && seg === "todos") return null;
  // The Catalog: the lists and templates (the same permission as Settings' lists).
  if (!job && seg === "catalog") return "lists";
  if (!job && seg === "settings") {
    const s = pathname.split("/")[2] ?? "";
    if (s === "quickbooks") return "quickbooks";
    return LIST_SETTINGS.has(s) ? "lists" : null;
  }
  return PATH_AREA[seg] ?? null;
}

/** Settings pages under "lists & templates", with the whole Catalog (the rest of Settings is admin-only). */
export const LIST_SETTINGS = new Set(["cost-codes", "vendors", "estimate-parameters", "estimate-divisions", "lead-sources"]);

/** First part of an address (a job's tab, or a main page) → its area. */
export const PATH_AREA: Record<string, AreaKey> = {
  // A job's tabs
  estimate: "estimates",
  bids: "estimates",
  takeoff: "takeoffs",
  materials: "takeoffs",
  selections: "selections",
  "change-orders": "selections",
  schedule: "field",
  "daily-logs": "field",
  todos: "field",
  warranty: "field",
  files: "files",
  plans: "files",
  messages: "files",
  purchasing: "purchasing",
  budget: "budget",
  spec: "budget",
  invoices: "invoices",
  // Main pages (the same words as a job's tabs where they match)
  leads: "leads",
  clients: "leads",
  bills: "purchasing",
  inventory: "purchasing",
  reports: "reports",
};

/** True when `access` reaches `need` in `area` (null area: everyone). */
export function allows(access: Access, area: AreaKey | null, need: Level = 1) {
  return area === null || access[area] >= need;
}

/** Settings is in the menu for admins, or anyone who may see part of it. */
export const seesSettings = (role: string, access: Access) => role === "ADMIN" || access.lists > 0 || access.quickbooks > 0;

/** The main menu pages this access shows (the menu is filtered by it; each page checks again). */
export function navPages(role: string, access: Access, pages: string[]) {
  return pages.filter((href) => (href === "/settings" ? seesSettings(role, access) : allows(access, areaForPath(href), 1)));
}
