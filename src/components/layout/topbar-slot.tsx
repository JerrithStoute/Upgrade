"use client";

import { useEffect, useSyncExternalStore } from "react";
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
 * `compact` moves up into the top bar so the plan gets the room.
 */
export function ProjectHeaderSwitch({ compact, children }: { compact: React.ReactNode; children: React.ReactNode }) {
  const viewer = isPlanViewer(usePathname());
  useEffect(() => {
    if (!viewer) return;
    setSlot(compact);
    return () => setSlot(null);
  }, [viewer, compact]);
  return viewer ? null : <>{children}</>;
}
