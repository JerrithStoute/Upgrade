"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isPlanViewer } from "./sidebar";

// What the top bar shows in place of the company name (the project, on the drawing screen).
let slot: React.ReactNode = null;
const listeners = new Set<() => void>();
function setSlot(node: React.ReactNode) {
  slot = node;
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The top bar's left side: the company name, or the project while on the drawing screen. */
export function TopbarTitle({ title }: { title?: string }) {
  const node = useSyncExternalStore(
    subscribe,
    () => slot,
    () => null,
  );
  return node ? <div className="min-w-0 flex-1 pr-3">{node}</div> : <div className="text-sm font-medium text-slate-600">{title}</div>;
}

/**
 * The project header: shown as usual, except on the takeoff drawing screen, where
 * `compact` moves up into the top bar so the plan gets the room. Elsewhere it moves
 * up there too once you scroll it out of sight (the tabs stay anchored below the bar).
 */
export function ProjectHeaderSwitch({ compact, children }: { compact: React.ReactNode; children: React.ReactNode }) {
  const viewer = isPlanViewer(usePathname());
  const ref = useRef<HTMLDivElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  useEffect(() => {
    if (viewer) return;
    // Gone under the top bar (3.5rem) — its title, at least.
    const check = () => setScrolledPast(!!ref.current && ref.current.getBoundingClientRect().bottom <= 72);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const first = setTimeout(check);
    return () => {
      clearTimeout(first);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [viewer]);
  const inBar = viewer || scrolledPast;
  useEffect(() => {
    if (!inBar) return;
    setSlot(compact);
    return () => setSlot(null);
  }, [inBar, compact]);
  return viewer ? null : <div ref={ref}>{children}</div>;
}
