import {
  AppWindow,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock,
  Cable,
  Calculator,
  Copy,
  FilePen,
  FileSignature,
  FileStack,
  Layers,
  ListTree,
  Megaphone,
  Package,
  PencilRuler,
  Percent,
  Receipt,
  Ruler,
  Table2,
  Truck,
  Users,
  Variable,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type SettingsPage = { href: string; label: string; about: string; icon: LucideIcon };
export type SettingsGroup = { title: string; icon: LucideIcon; pages: SettingsPage[] };

/**
 * Every Settings page, grouped by the part of the program it sets up — the Settings home lists
 * them, and each page's heading comes from here. Who sees a page: admins all of them; others the
 * ones their position allows (src/lib/access.ts — the lists and QuickBooks).
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Your company",
    icon: Building2,
    pages: [
      { href: "/settings/company", label: "Company profile", about: "Name, address, logo and colors, time zone, backups", icon: Building2 },
      { href: "/settings/team", label: "Team & positions", about: "Invite people, what each position sees, two-step sign-in", icon: Users },
    ],
  },
  {
    title: "Sales",
    icon: Megaphone,
    pages: [{ href: "/settings/lead-sources", label: "Lead sources", about: "Where your leads come from", icon: Megaphone }],
  },
  {
    title: "Estimates & proposals",
    icon: Calculator,
    pages: [
      { href: "/settings/cost-codes", label: "Cost codes", about: "Your cost code library and its groups", icon: ListTree },
      { href: "/settings/estimate-divisions", label: "Estimate divisions", about: "How cost codes file into divisions and categories", icon: Layers },
      { href: "/settings/estimate-parameters", label: "Estimate parameters", about: "Job numbers your quantities use, like square feet", icon: Variable },
      { href: "/settings/estimate-templates", label: "Estimate templates", about: "Estimates to start new jobs from", icon: FileStack },
      { href: "/settings/markup", label: "Markup, margin & tax", about: "The table new estimates start with, and allowance profit", icon: Percent },
      { href: "/settings/proposals", label: "Proposal defaults", about: "What a new proposal shows, and how", icon: FileSignature },
    ],
  },
  {
    title: "Takeoff",
    icon: PencilRuler,
    pages: [
      { href: "/settings/items", label: "Item List", about: "What you buy: prices, units, waste, cost codes", icon: Package },
      { href: "/settings/member-sizes", label: "Member sizes", about: "Lumber sizes and the lengths you buy", icon: Ruler },
      { href: "/settings/windows", label: "Windows", about: "What every window has: size, type, color, and your own details", icon: AppWindow },
      { href: "/settings/span-tables", label: "Span tables", about: "How far each size can span", icon: Table2 },
      { href: "/settings/takeoff-templates", label: "Takeoff templates", about: "Your takeoff library", icon: Copy },
    ],
  },
  {
    title: "Jobs",
    icon: Briefcase,
    pages: [
      { href: "/settings/schedule", label: "Work week & delays", about: "The days you work, and your delay reasons", icon: CalendarDays },
      { href: "/settings/schedule-templates", label: "Schedule templates", about: "Schedules to start new jobs from", icon: CalendarRange },
      { href: "/settings/change-orders", label: "Change order defaults", about: "Wording, profit and terms a new change order starts with", icon: FilePen },
      { href: "/settings/time-clock", label: "Time clock", about: "Overtime, rounding, lunch, long shifts, job sites, pay", icon: Clock },
    ],
  },
  {
    title: "Financials",
    icon: Wallet,
    pages: [
      { href: "/settings/invoices", label: "Invoices", about: "Invoice numbers, and what moves onto invoices by itself", icon: Receipt },
      { href: "/settings/vendors", label: "Vendors", about: "Who you buy from, and their insurance", icon: Truck },
    ],
  },
  {
    title: "Connections",
    icon: Cable,
    pages: [{ href: "/settings/quickbooks", label: "QuickBooks", about: "Link your QuickBooks Desktop company", icon: Cable }],
  },
];

/** The Settings page an address is on (its own page or one inside it), if any. */
export function settingsPageFor(pathname: string) {
  for (const g of SETTINGS_GROUPS) for (const p of g.pages) if (pathname === p.href || pathname.startsWith(p.href + "/")) return p;
  return null;
}
