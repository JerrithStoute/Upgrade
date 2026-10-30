/**
 * Which part of the program a page is, for the Station's "How they use it" (usage.ts). Plain words, in
 * the order the Station shows them. No database — tested in usage-areas.test.ts.
 */

export const AREAS = [
  "Dashboard",
  "Leads",
  "Jobs",
  "Plans",
  "Takeoff",
  "Material list",
  "Estimates",
  "Bids",
  "Selections",
  "Change orders",
  "Schedule",
  "Spec sale",
  "Purchasing",
  "Budget",
  "Invoices",
  "Bills",
  "Daily logs",
  "To-dos",
  "Files",
  "Messages",
  "Warranty",
  "Clients",
  "Time clock",
  "Inventory",
  "Reports",
  "Catalog",
  "Settings",
  "Help",
  "Client portal",
  "Sub portal",
] as const;
export type Area = (typeof AREAS)[number];

/** A job's tabs (/projects/<id>/<tab>). */
const JOB_TABS: Record<string, Area> = {
  plans: "Plans",
  takeoff: "Takeoff",
  materials: "Material list",
  estimate: "Estimates",
  bids: "Bids",
  selections: "Selections",
  "change-orders": "Change orders",
  schedule: "Schedule",
  spec: "Spec sale",
  purchasing: "Purchasing",
  budget: "Budget",
  invoices: "Invoices",
  "daily-logs": "Daily logs",
  todos: "To-dos",
  files: "Files",
  messages: "Messages",
  warranty: "Warranty",
};

/** The program's own pages (/<first part>). */
const PAGES: Record<string, Area> = {
  dashboard: "Dashboard",
  leads: "Leads",
  projects: "Jobs",
  spec: "Jobs",
  clients: "Clients",
  schedule: "Schedule",
  todos: "To-dos",
  time: "Time clock",
  invoices: "Invoices",
  bills: "Bills",
  inventory: "Inventory",
  reports: "Reports",
  settings: "Settings",
  catalog: "Catalog",
  warranty: "Warranty",
  help: "Help",
  portal: "Client portal",
  vendor: "Sub portal",
};

/** The area a page's address belongs to, or null (sign-in pages, the Station, the website…). */
export function areaOf(path: string): Area | null {
  const parts = path.split(/[?#]/)[0].split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === "projects" && parts.length >= 3) return JOB_TABS[parts[2]] ?? "Jobs";
  return PAGES[parts[0]] ?? null;
}
