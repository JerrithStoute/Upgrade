"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { areaOf } from "@/lib/usage-areas";

/**
 * Tells the program which page was opened, for the Station's "How they use it" (src/lib/usage.ts) —
 * only pages that are part of using it (not sign-in pages or the website), only the address.
 */
export function UsageBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path || !areaOf(path)) return;
    void fetch("/api/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }), keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
