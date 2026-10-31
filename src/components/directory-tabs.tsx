"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const DIRECTORY_TABS = [
  { href: "/clients", label: "Clients" },
  { href: "/vendors", label: "Subs & vendors" },
  { href: "/team", label: "Team" },
] as const;

/** The Directory's tabs — the people you work with: clients, subs & vendors, your own team. */
export function DirectoryTabs({ tabs }: { tabs: string[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Directory" className="mb-4 flex items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 text-sm">
      <span className="mr-2 hidden pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:inline">Directory</span>
      {DIRECTORY_TABS.filter((t) => tabs.includes(t.href)).map((t) => {
        const on = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 pb-2 font-medium", on ? "border-blue-600 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-800")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
