import Link from "@/components/link";
import { FileWarning } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { paperworkWarning } from "@/lib/paperwork";
import { vendorPaperwork } from "@/lib/paperwork-server";
import { companyClock } from "@/lib/company-zone";

/**
 * "Smith Framing is missing: W-9 · Insurance expires Nov 18 — open their page", where you hand out work (a PO, a
 * bid you take, a schedule task, the job's subs). A note, never a stop. Nothing when all's in, or nothing's needed.
 */
export async function PaperworkNote({ vendorId, name, className }: { vendorId: string | null | undefined; name?: string; className?: string }) {
  if (!vendorId) return null;
  const today = (await companyClock()).now;
  const paper = await vendorPaperwork(vendorId, today);
  const text = paper ? paperworkWarning(paper.lines, (d) => fmtDate(d, "MMM d")) : "";
  if (!paper || !text) return null;
  return (
    <p className={className ?? "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"}>
      <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong>{name ?? paper.vendor.name}&apos;s paperwork:</strong> {text}.{" "}
        <Link href={`/vendors/${vendorId}`} className="font-medium underline">
          Open their page
        </Link>
      </span>
    </p>
  );
}
