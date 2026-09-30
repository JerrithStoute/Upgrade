"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CalendarDays,
  CheckSquare,
  Receipt,
  Settings,
  HardHat,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/todos", label: "To-Dos", icon: CheckSquare },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function Sidebar({ role, companyName }: { role: string; companyName: string }) {
  const pathname = usePathname();
  return (
    <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <Link href="/dashboard" className="flex items-center gap-2 border-b border-slate-100 px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-700 text-white">
          <HardHat className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">Upgrade</span>
          <span className="block truncate text-xs text-slate-500">{companyName}</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.filter((n) => !n.adminOnly || role === "ADMIN").map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <item.icon className={cn("h-4 w-4", active ? "text-blue-700" : "text-slate-400")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white md:hidden">
      {NAV.filter((n) => !n.adminOnly || role === "ADMIN")
        .slice(0, 5)
        .map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "text-blue-800" : "text-slate-500",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}
