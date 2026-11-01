"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "@/components/link";

/**
 * Remembers (for this browser tab) the filter Invoices or Bills in the menu was on, so an invoice's or bill's
 * "All invoices" / "All bills" link returns to it — and, when one is opened, the rows as they showed then
 * (filter and find box both), so it can offer "Next →" through them. Rows carry `data-href`.
 */
export function RememberList({ kind, listId }: { kind: "invoices" | "bills"; listId: string }) {
  const path = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(`list-return:${kind}`, path + (query ? `?${query}` : ""));
    } catch {
      // No storage (private window): "All invoices" opens the plain list.
    }
    const list = document.getElementById(listId);
    if (!list) return;
    // Just before the click opens one: the rows still showing, in order.
    const keep = () => {
      const hrefs = [...list.querySelectorAll<HTMLElement>("[data-href]:not([hidden])")].map((r) => r.dataset.href!);
      try {
        sessionStorage.setItem(`list-order:${kind}`, JSON.stringify(hrefs));
      } catch {
        // No storage: no Next link.
      }
    };
    list.addEventListener("click", keep, true);
    return () => list.removeEventListener("click", keep, true);
  }, [kind, listId, path, query]);
  return null;
}

// sessionStorage doesn't tell anyone when it changes; what's remembered is read once per render.
const noChanges = () => () => {};
const read = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * The top line of one invoice or bill: back to the menu's list (with the filter it was opened from, if any) and to
 * the job — and, when it was opened from that list, where it sits in it and the next one.
 */
export function BackToList({ kind, href, label, listLabel }: { kind: "invoices" | "bills"; href: string; label: string; listLabel: string }) {
  const path = usePathname();
  const list = useSyncExternalStore(
    noChanges,
    () => read(`list-return:${kind}`),
    () => null,
  );
  const order = useSyncExternalStore(
    noChanges,
    () => read(`list-order:${kind}`),
    () => null,
  );
  const place = useMemo(() => {
    try {
      const hrefs: string[] = order ? JSON.parse(order) : [];
      const at = hrefs.indexOf(path);
      return at < 0 ? null : { at, of: hrefs.length, next: hrefs[at + 1] ?? null };
    } catch {
      return null;
    }
  }, [order, path]);
  return (
    <span className="flex flex-col gap-y-1 text-xs text-slate-500">
      <span className="flex flex-wrap items-center gap-x-3">
        <Link href={list ?? `/${kind}`} className="hover:text-slate-800">
          ← {listLabel}
        </Link>
        <Link href={href} className="hover:text-slate-800">
          ← {label}
        </Link>
      </span>
      {/* Under "All invoices", looking just like it. */}
      {place && place.of > 1 ? (
        <span className="flex items-center gap-x-2">
          {place.next ? (
            <Link href={place.next} className="hover:text-slate-800">
              Next →
            </Link>
          ) : (
            <span>Last one</span>
          )}
          <span className="text-slate-400">
            {place.at + 1} of {place.of}
          </span>
        </span>
      ) : null}
    </span>
  );
}
