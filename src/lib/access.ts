import { z } from "zod";

/**
 * Positions: what a team member sees and changes. One rule everywhere:
 *
 * - Each AREA of the program is Hidden, Can view or Can edit.
 * - "Which jobs": every job, or only the jobs they manage or are on the team of.
 * - Two switches: may delay a job's schedule, may approve & pay bills.
 * - A person gets their position's access; an admin can change single areas for just them.
 * - Admins get everything, always. Company, team and billing settings stay admin-only —
 *   whoever can change the team could give themselves anything.
 *
 * Pure (no database), so the rules can be tested and shown the same way everywhere.
 */

export const AREAS = [
  { key: "leads", label: "Leads & clients", hint: "Leads, clients" },
  { key: "estimates", label: "Estimates, proposals & bids", hint: "Estimate, proposal, lumber bids" },
  { key: "takeoffs", label: "Takeoffs & Material List", hint: "Takeoff, Material list" },
  { key: "selections", label: "Selections & change orders", hint: "Selections, change orders" },
  { key: "field", label: "Schedule, daily logs & to-dos", hint: "Schedule, daily logs, to-dos" },
  { key: "files", label: "Files, plans & messages", hint: "Files, plans, client messages" },
  { key: "purchasing", label: "Purchasing, bills & inventory", hint: "POs, bills, inventory" },
  { key: "budget", label: "Budget & spec sales", hint: "Budget, spec sale, spec homes" },
  { key: "invoices", label: "Invoices", hint: "Client invoices and payments" },
  { key: "reports", label: "Reports", hint: "Reports, money cards on the dashboard" },
  { key: "time", label: "Everyone's time", hint: "Their own time clock always works; this is everyone else's hours and timesheets" },
  { key: "lists", label: "Settings: lists & templates", hint: "Item List, cost codes, vendors, member sizes, span tables, templates" },
  { key: "quickbooks", label: "Settings: QuickBooks", hint: "QuickBooks connection and matching" },
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

export type Access = Record<AreaKey, Level> & { jobs: Jobs; delay: boolean; approveBills: boolean };
/** A person's changes from their position (only what differs). */
export type AccessChanges = Partial<Access>;

export const SWITCHES = [
  { key: "delay", label: "Can delay a job's schedule" },
  { key: "approveBills", label: "Can approve & pay bills" },
] as const;

const level = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const changesSchema = z
  .object({
    ...Object.fromEntries(AREA_KEYS.map((k) => [k, level.optional()])),
    jobs: z.enum(["ALL", "MINE"]).optional(),
    delay: z.boolean().optional(),
    approveBills: z.boolean().optional(),
  })
  .strip();

const areas = (l: Partial<Record<AreaKey, Level>>, rest: Level = 0) => Object.fromEntries(AREA_KEYS.map((k) => [k, l[k] ?? rest])) as Record<AreaKey, Level>;

/** Admins: everything. */
export const ADMIN_ACCESS: Access = { ...areas({}, 2), jobs: "ALL", delay: true, approveBills: true };

/** Clients, vendors and people without a login: nothing inside the program. */
export const NO_ACCESS: Access = { ...areas({}), jobs: "MINE", delay: false, approveBills: false };

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
    },
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

/** What someone may do: admins everything; others their position (Staff if none) plus their own changes. */
export function resolveAccess(role: string, positionJson: string | null | undefined, changesJson: string | null | undefined): Access {
  if (role === "ADMIN") return ADMIN_ACCESS;
  return { ...positionAccess(positionJson), ...parseChanges(changesJson) };
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
  };
}

/** The area a page belongs to (null: everyone on the team — dashboard, a job's overview, their own account…). */
export function areaForPath(pathname: string): AreaKey | null {
  const job = pathname.match(/^\/projects\/[^/]+\/([^/]+)/);
  const seg = job ? job[1] : pathname.split("/")[1];
  // Everyone has their own to-dos (a job's To-Dos tab is the field area's).
  if (!job && seg === "todos") return null;
  if (!job && seg === "settings") {
    const s = pathname.split("/")[2] ?? "";
    if (s === "quickbooks") return "quickbooks";
    return LIST_SETTINGS.has(s) ? "lists" : null;
  }
  return PATH_AREA[seg] ?? null;
}

/** Settings pages under "Settings: lists & templates" (the rest of Settings is admin-only). */
export const LIST_SETTINGS = new Set([
  "items",
  "cost-codes",
  "vendors",
  "member-sizes",
  "span-tables",
  "takeoff-templates",
  "estimate-templates",
  "estimate-parameters",
  "estimate-divisions",
  "schedule-templates",
  "lead-sources",
]);

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
