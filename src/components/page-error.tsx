"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportBrowserError } from "@/components/error-catcher";

/**
 * A client's or sub's page that broke: no builder's or Station's name on it (they see their builder's
 * portal around it). The Station hears about it by itself (src/lib/problems.ts).
 */
export function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportBrowserError(error), [error]);
  return (
    <div className="mx-auto my-8 max-w-md rounded-xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="text-base font-semibold text-rose-800">Something went wrong</h2>
      <p className="mt-1 text-sm text-rose-700">This page couldn&apos;t be shown. It&apos;s been reported — try again in a moment.</p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
