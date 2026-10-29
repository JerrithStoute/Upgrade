"use client";

import { useEffect } from "react";

/**
 * Tells the Station when something breaks in this browser (src/lib/problems.ts): each different error
 * once per page visit, at most 10. Errors from the server (with a `digest`) were kept there already.
 */
const sent = new Set<string>();

export function reportBrowserError(error: unknown) {
  if (typeof window === "undefined" || sent.size >= 10) return;
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  if ((e as Error & { digest?: string }).digest) return;
  const message = `${e.name && e.name !== "Error" ? `${e.name}: ` : ""}${e.message}`;
  if (sent.has(message)) return;
  sent.add(message);
  void fetch("/api/problems/error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, stack: e.stack ?? "", page: window.location.pathname }),
    keepalive: true,
  }).catch(() => {});
}

/** In the root layout: catches what nothing else did. */
export function ErrorCatcher() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportBrowserError(ev.error ?? ev.message);
    const onRejection = (ev: PromiseRejectionEvent) => reportBrowserError(ev.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
