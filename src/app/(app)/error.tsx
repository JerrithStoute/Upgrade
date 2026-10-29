"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportBrowserError } from "@/components/error-catcher";
import { openReportProblem } from "@/components/report-problem";

/**
 * A page that broke. The Station hears about it by itself (server errors on the server, browser ones
 * from here — src/lib/problems.ts); "Tell us what you were doing" adds their side of it.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportBrowserError(error), [error]);
  // Online, the server's own wording is kept from the page (it reads "An error occurred in the Server Components render…").
  const said = !error.message || error.digest ? "This page couldn't be shown." : error.message;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="text-base font-semibold text-rose-800">Something went wrong</h2>
      <p className="mt-1 text-sm text-rose-700">{said}</p>
      <p className="mt-1 text-sm text-rose-700">We were told about it automatically.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openReportProblem(said)}>
          Tell us what you were doing
        </Button>
      </div>
    </div>
  );
}
