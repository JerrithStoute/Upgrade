"use client";

import { useEffect } from "react";
import { reportBrowserError } from "@/components/error-catcher";

/** When even the page's frame broke: a plain page of its own (no layout around it), reported like any other. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportBrowserError(error), [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
        <main style={{ maxWidth: "22rem", padding: "2rem 1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 .5rem" }}>Something went wrong</h1>
          <p style={{ color: "#475569", margin: "0 0 1.5rem" }}>This page couldn&apos;t be shown. It&apos;s been reported — try again in a moment.</p>
          <button type="button" onClick={() => reset()} style={{ font: "inherit", fontWeight: 600, padding: ".75rem 1.5rem", border: 0, borderRadius: ".5rem", background: "#0f172a", color: "#fff" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
