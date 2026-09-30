"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Home,
  ListChecks,
  FileDiff,
  CalendarDays,
  Receipt,
  Images,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/portal", label: "Home", icon: Home, exact: true },
  { href: "/portal/selections", label: "Selections", icon: ListChecks },
  { href: "/portal/change-orders", label: "Change Orders", icon: FileDiff },
  { href: "/portal/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/portal/invoices", label: "Invoices", icon: Receipt },
  { href: "/portal/files", label: "Photos & Files", icon: Images },
  { href: "/portal/messages", label: "Messages", icon: MessageSquare },
];

/** Horizontal portal nav. Preserves the `?project=` switcher param across pages. */
export function PortalNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const project = params.get("project");
  return (
    <nav className="no-print -mb-px flex gap-1 overflow-x-auto" aria-label="Portal">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
        const href = project ? `${item.href}?project=${project}` : item.href;
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-blue-700 text-blue-800"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
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
