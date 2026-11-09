import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { allows } from "@/lib/access";
import { photoCaption } from "@/lib/proposal-options";
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
  // The job's pictures your client can see: what can go under a category on the proposal.
  const jobPhotos = (
    await db.fileAsset.findMany({
      where: { projectId: project.id, clientVisible: true, mimeType: { startsWith: "image/" } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, name: true },
    })
  ).map((f) => ({ id: f.id, url: `/api/files/${f.id}`, caption: photoCaption(f.name) }));

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${project.id}/estimate?estimate=${estimate.id}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to estimate
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>
      <PriceWarnings unpriced={check?.unpriced} zeroLines={zeroLines} materialsHref={`/projects/${project.id}/materials`} />

      <ProposalView
        projectId={project.id}
        estimateId={estimate.id}
        specs={p.specs}
        basePrice={estimate.basePrice}
        extras={p.extras}
        initial={p.options}
        isCustom={p.isCustom}
        issuedOn={p.pricedOn}
        isAdmin={user.role === "ADMIN"}
        companyName={p.companyName}
        cover={p.cover}
        intro={p.intro}
        terms={p.terms}
        head={p.head}
        decision={p.decision}
        jobPhotos={jobPhotos}
        standard={p.standard}
        canEditText={user.access.costs && allows(user.access, "estimates", 2)}
      />
    </div>
  );
}
