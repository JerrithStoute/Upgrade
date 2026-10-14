import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireView } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { loadProposal } from "@/lib/proposal-data";
import { ensureEstimateSpecs } from "@/lib/estimate-lines";
import { buttonClasses } from "@/components/ui";
import { PrintButton } from "../../../_components/print-button";
import { ProposalView } from "./proposal-view";
import { refreshDraftFromTakeoff, takeoffPriceCheck } from "@/lib/takeoff-data";
import { refreshFormulaQuantities } from "@/lib/estimate-parameters";
import { PriceWarnings, zeroLineNames } from "@/components/estimate/price-warnings";

export default async function ProposalPage({ params }: { params: Promise<{ id: string; estimateId: string }> }) {
  const user = await requireView("estimates");
  const { id, estimateId } = await params;
  const project = await getProject(id);
  await ensureEstimateSpecs(estimateId);
  await refreshDraftFromTakeoff(project.id, estimateId).catch(() => null);
  await refreshFormulaQuantities(estimateId);
  const p = await loadProposal(project.id, estimateId);
  if (!p) notFound();
  const { estimate } = p;
  // A draft: warn about anything that would show at $0.
  const check = estimate.status === "DRAFT" ? await takeoffPriceCheck(project.id) : null;
  const zeroLines = estimate.status === "DRAFT" ? zeroLineNames(estimate.items) : [];

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${project.id}/estimate?estimate=${estimate.id}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to estimate
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>
      <PriceWarnings unpriced={check?.unpriced} zeroLines={zeroLines} materialsHref={`/projects/${project.id}/materials`} rebidHref={`/projects/${project.id}/takeoff/rebid`} />

      <ProposalView
        projectId={project.id}
        estimateId={estimate.id}
        specs={p.specs}
        basePrice={estimate.basePrice}
        extras={p.extras}
        initial={p.options}
        isCustom={p.isCustom}
        pricedOn={p.pricedOn}
        isAdmin={user.role === "ADMIN"}
        companyName={p.companyName}
        cover={p.cover}
        header={p.header}
        intro={p.intro}
        footer={p.footer}
      />
    </div>
  );
}
