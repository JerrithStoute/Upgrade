"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";
import { makeEscalationChangeOrder } from "@/app/(app)/projects/[id]/change-orders/actions";

/**
 * "Make escalation change order": a draft change order for the increase on the client's price
 * change sheet, with the sheet attached; it opens so you can look it over and send it.
 * `before`: anything to do first (the sheet saves settings you haven't saved yet).
 */
export function EscalationCoButton({
  projectId,
  estimateId,
  before,
  asLink,
}: {
  projectId: string;
  estimateId: string;
  before?: () => Promise<boolean>;
  asLink?: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () =>
    start(async () => {
      setError(null);
      if (before && !(await before())) return;
      const r = await makeEscalationChangeOrder(projectId, estimateId);
      if (r.ok) router.push(r.href);
      else setError(r.error);
    });
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        title="A draft change order for the increase on the client's price change sheet, with the sheet attached. Nothing is sent until you send it."
        className={asLink ? "font-medium underline underline-offset-2 hover:no-underline disabled:opacity-60" : cn(buttonClasses("primary", "sm"), "no-print")}
      >
        {asLink ? null : <FilePlus2 className="h-3.5 w-3.5" />} {busy ? "Making it…" : "Make escalation change order"}
      </button>
      {error ? <span className="mt-1 max-w-xs text-right text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}
