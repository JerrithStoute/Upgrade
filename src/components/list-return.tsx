"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/link";

/**
 * Remembers (for this browser tab) the filter Invoices or Bills in the menu was on, so an invoice's or bill's
 * "All invoices" / "All bills" link returns to it.
 */
export function RememberList({ kind }: { kind: "invoices" | "bills" }) {
  const path = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(`list-return:${kind}`, path + (query ? `?${query}` : ""));
    } catch {
      // No storage (private window): "All invoices" opens the plain list.
    }
  }, [kind, path, query]);
  return null;
}

// sessionStorage doesn't tell anyone when it changes; the remembered list is read once per render.
const noChanges = () => () => {};
const read = (kind: string) => {
  try {
    return sessionStorage.getItem(`list-return:${kind}`);
  } catch {
    return null;
  }
};

/**
 * The back links on one invoice or bill: to the menu's list (with the filter it was opened from, if any) and to the job.
 */
export function BackToList({ kind, href, label, listLabel }: { kind: "invoices" | "bills"; href: string; label: string; listLabel: string }) {
  const list = useSyncExternalStore(
    noChanges,
    () => read(kind),
    () => null,
  );
  return (
    <span className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
      <Link href={list ?? `/${kind}`} className="hover:text-slate-800">
        ← {listLabel}
      </Link>
      <Link href={href} className="hover:text-slate-800">
        ← {label}
      </Link>
    </span>
  );
}
