"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="text-base font-semibold text-rose-800">Something went wrong</h2>
      <p className="mt-1 text-sm text-rose-700">{error.message || "An unexpected error occurred."}</p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
