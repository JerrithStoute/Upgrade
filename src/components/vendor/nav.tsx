"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, FileInput, Home, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/vendor", label: "Home", icon: Home, exact: true },
  { href: "/vendor/pos", label: "Purchase orders", icon: ClipboardList },
  { href: "/vendor/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/vendor/bills", label: "Bills", icon: FileInput },
  { href: "/vendor/insurance", label: "Insurance", icon: ShieldCheck },
];

/** The sub / vendor portal's tabs. */
export function VendorNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print -mb-px flex gap-1 overflow-x-auto" aria-label="Vendor portal">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            <item.icon className={cn("h-4 w-4", active ? "text-blue-700" : "text-slate-400")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
