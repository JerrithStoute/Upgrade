export const PROJECT_STATUSES = [
  "LEAD",
  "ESTIMATING",
  "PROPOSAL_SENT",
  "CONTRACTED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_TYPES = ["NEW_HOME", "REMODEL", "ADDITION", "COMMERCIAL", "OTHER"] as const;

export const ESTIMATE_STATUSES = ["DRAFT", "SENT", "APPROVED", "DECLINED"] as const;
export const SELECTION_STATUSES = ["PENDING", "CHOSEN", "APPROVED", "ORDERED", "INSTALLED"] as const;
export const CHANGE_ORDER_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "DECLINED", "VOID"] as const;
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"] as const;
export const EXPENSE_CATEGORIES = ["MATERIAL", "LABOR", "SUBCONTRACTOR", "EQUIPMENT", "PERMIT", "OTHER"] as const;
export const PAYMENT_METHODS = ["CHECK", "ACH", "CARD", "CASH", "OTHER"] as const;
export const TODO_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const FILE_FOLDERS = ["Photos", "Plans", "Documents", "Contracts", "Permits"] as const;
export const UNITS = ["ea", "sf", "lf", "sy", "cy", "hr", "day", "ls", "ton", "gal"] as const;
export const WEATHER = ["Sunny", "Partly Cloudy", "Cloudy", "Rain", "Snow", "Windy", "Storm"] as const;
export const USER_ROLES = ["ADMIN", "STAFF", "CLIENT", "SUB"] as const;

export const SCHEDULE_PHASES = [
  "Pre-Construction",
  "Site Work",
  "Foundation",
  "Framing",
  "Exterior",
  "Rough-Ins",
  "Insulation & Drywall",
  "Interior Finishes",
  "Final",
] as const;

/** Tailwind badge classes by status. */
export const STATUS_STYLES: Record<string, string> = {
  // project
  LEAD: "bg-slate-100 text-slate-700 ring-slate-200",
  ESTIMATING: "bg-amber-50 text-amber-800 ring-amber-200",
  PROPOSAL_SENT: "bg-violet-50 text-violet-800 ring-violet-200",
  CONTRACTED: "bg-sky-50 text-sky-800 ring-sky-200",
  IN_PROGRESS: "bg-blue-50 text-blue-800 ring-blue-200",
  ON_HOLD: "bg-orange-50 text-orange-800 ring-orange-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-800 ring-rose-200",
  // generic
  DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  SENT: "bg-sky-50 text-sky-800 ring-sky-200",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-800 ring-amber-200",
  CHOSEN: "bg-sky-50 text-sky-800 ring-sky-200",
  APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ORDERED: "bg-violet-50 text-violet-800 ring-violet-200",
  INSTALLED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  DECLINED: "bg-rose-50 text-rose-800 ring-rose-200",
  VOID: "bg-slate-100 text-slate-500 ring-slate-200 line-through",
  PARTIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  UNPAID: "bg-amber-50 text-amber-800 ring-amber-200",
  OPEN: "bg-sky-50 text-sky-800 ring-sky-200",
  DONE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
  NORMAL: "bg-sky-50 text-sky-800 ring-sky-200",
  HIGH: "bg-rose-50 text-rose-800 ring-rose-200",
  ADMIN: "bg-violet-50 text-violet-800 ring-violet-200",
  STAFF: "bg-sky-50 text-sky-800 ring-sky-200",
  CLIENT: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  SUB: "bg-amber-50 text-amber-800 ring-amber-200",
};
