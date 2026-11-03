import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { estimateEscalation, releaseOldPriceLock } from "@/lib/bid-snapshots";
import { stalePrices } from "@/lib/stale-prices";
import { jobLetterhead } from "@/lib/proposal-data";
import { companyClock } from "@/lib/company-zone";
import { parsePriceSheet } from "@/lib/price-sheet";
import { fmtDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { TrendingUp } from "lucide-react";
import { PriceChangeView } from "./price-change-view";

export const metadata = { title: "Material price change" };

/**
 * A sent or approved estimate's material price change, item by item: for you (vendors, when each
 * price was last checked) or for the client (your words, what you choose to show, your letterhead).
 */
export default async function PriceChangePage({ params, searchParams }: { params: Promise<{ id: string; estimateId: string }>; searchParams: Promise<{ view?: string }> }) {
  const user = await requireView("estimates");
  const { id, estimateId } = await params;
  const { view } = await searchParams;
  const project = await getProject(id);
  if (!user.access.costs) redirect(`/projects/${project.id}/estimate`);
  const estimate = await db.estimate.findFirst({ where: { id: estimateId, projectId: project.id }, select: { id: true, name: true, version: true, priceSheetOptions: true } });
  if (!estimate) notFound();
  await releaseOldPriceLock(project.id);
  const back = `/projects/${project.id}/estimate?estimate=${estimate.id}`;
  const [e, company, clock] = await Promise.all([
    estimateEscalation(project.id, estimate.id),
    db.company.findFirst({ select: { priceSheetOptions: true, name: true } }),
    companyClock(),
  ]);
  if (!e)
    return (
      <div className="space-y-4">
        <Link href={back} className="text-sm font-medium text-blue-700 hover:underline">
          ← Estimate
        </Link>
        <EmptyState
          icon={TrendingUp}
          title="No bid snapshot for this version yet"
          description="The Material list is saved the day the proposal is marked sent (and again when it's signed). The price change is measured from it."
        />
      </div>
    );

  const stale = await stalePrices(e.lines.map((l) => l.materialItemId));
  const today = fmtDate(clock.now);
  const { clientName, header } = await jobLetterhead(project.id, `${today} · ${estimate.name} v${estimate.version}`);
  return (
    <PriceChangeView
      projectId={project.id}
      estimateId={estimate.id}
      backHref={back}
      initialView={view === "client" ? "client" : "you"}
      e={{
        kind: e.kind,
        since: fmtDate(clock.wall(e.takenAt)),
        today,
        triggerPct: e.triggerPct,
        past: e.past,
        lines: e.lines,
        fileId: e.fileId,
      }}
      job={`#${project.number} ${project.name}`}
      version={`${estimate.name} v${estimate.version}`}
      checked={Object.fromEntries(Object.entries(e.checkedAt).map(([k, d]) => [k, fmtDate(d)]))}
      stale={Object.fromEntries(stale)}
      initial={parsePriceSheet(estimate.priceSheetOptions ?? company?.priceSheetOptions)}
      isCustom={!!estimate.priceSheetOptions}
      isAdmin={user.role === "ADMIN"}
      canMakeCo={user.role === "ADMIN" || allows(user.access, "selections", 2)}
      clientName={clientName}
      header={header}
    />
  );
}
