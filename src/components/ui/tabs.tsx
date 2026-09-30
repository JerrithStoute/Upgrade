"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Tabs({ items, className }: { items: { href: string; label: string; exact?: boolean; count?: number }[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("no-print -mb-px flex gap-1 overflow-x-auto border-b border-slate-200", className)}>
      {items.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-blue-700 text-blue-800"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
