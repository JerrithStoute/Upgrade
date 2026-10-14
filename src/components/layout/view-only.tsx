"use client";

import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { AREAS, areaForPath, type Access } from "@/lib/access";

/** A page this person's position may only look at: says so up top (changes are refused, with the reason). */
export function ViewOnly({ access }: { access: Access }) {
  const area = areaForPath(usePathname());
  if (!area || access[area] !== 1) return null;
  const label = AREAS.find((a) => a.key === area)?.label ?? "";
  return (
    <p className="no-print mb-3 flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
      <Eye className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      View only — your position can see {label} but not change it.
    </p>
  );
}
