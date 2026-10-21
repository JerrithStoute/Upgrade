"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/station/builders", label: "Builders" },
  { href: "/station/invites", label: "Invites" },
  { href: "/station/find-area", label: "Find area score" },
  { href: "/station/team", label: "Team", owner: true },
  { href: "/station/log", label: "Log", owner: true },
];

export function StationTabs({ owner }: { owner: boolean }) {
  const path = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.filter((t) => owner || !t.owner).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            path.startsWith(t.href) ? "border-blue-700 text-blue-800" : "border-transparent text-slate-600 hover:text-slate-900",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
