import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getBrand } from "@/lib/company-brand";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { ensureEstimateSpecs } from "@/lib/estimate-lines";
import { fmtDate } from "@/lib/utils";
import { parseProposalOptions, parseSpecView, type ProposalSpec } from "@/lib/proposal-options";
import { buttonClasses } from "@/components/ui";
import { PrintButton } from "../../../_components/print-button";
import { ProposalView } from "./proposal-view";
import { coverUrl } from "@/lib/project-cover";
import { allowanceExtras, parseMarkupTable, tableExtras, tableTaxLabel, tableTaxRate } from "@/lib/markup";
import { refreshDraftFromTakeoff, takeoffPriceCheck } from "@/lib/takeoff-data";
import { refreshFormulaQuantities } from "@/lib/estimate-parameters";
import { PriceWarnings, zeroLineNames } from "@/components/estimate/price-warnings";

export default async function ProposalPage({ params }: { params: Promise<{ id: string; estimateId: string }> }) {
  const user = await requireStaff();
  const brand = await getBrand();
  const { id, estimateId } = await params;
  const project = await getProject(id);
  await ensureEstimateSpecs(estimateId);
  await refreshDraftFromTakeoff(project.id, estimateId).catch(() => null);
  await refreshFormulaQuantities(estimateId);
  const [estimate, company, selections] = await Promise.all([
    db.estimate.findFirst({
      where: { id: estimateId, projectId: project.id },
      include: {
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        specs: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    }),
    db.company.findFirst(),
    db.selection.findMany({ where: { projectId: project.id }, include: { options: true } }),
  ]);
  const selById = new Map(selections.map((s) => [s.id, s]));
  /** What the client chose for a selection category: the choice, "DECLINED", or null (still TBD). */
  const choiceOf = (selectionId: string | null) => {
    const sel = selectionId ? selById.get(selectionId) : undefined;
    if (!sel) return null;
    if (sel.status === "DECLINED") return "DECLINED" as const;
    const opt = sel.chosenOptionId ? sel.options.find((o) => o.id === sel.chosenOptionId) : undefined;
    return opt ? { name: opt.name, price: opt.price } : null;
  };
  if (!estimate) notFound();

  const markup = parseMarkupTable(estimate.markupTable, estimate.defaultMarkup);
  // Spec items with their cost lines; what shows (and how it adds up) is decided by the options.
  const specs: ProposalSpec[] = estimate.specs.map((sp) => ({
    id: sp.id,
    name: sp.name,
    category: sp.category,
    specText: sp.specText,
    isAllowance: sp.isAllowance,
    kind: sp.kind,
    allowanceProfit: sp.allowanceProfit ?? company?.allowanceProfit ?? false,
    choice: choiceOf(sp.selectionId),
    allowanceExtra: allowanceExtras(
      markup,
      estimate.items.filter((i) => i.specId === sp.id),
    ),
    view: parseSpecView(sp.proposalView),
    lines: estimate.items
      .filter((i) => i.specId === sp.id)
      .map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitCost: i.unitCost,
        markupPct: i.markupPct,
        taxPct: i.taxPct,
        costType: i.costType,
        isOptional: i.isOptional,
      })),
  }));
  const options = parseProposalOptions(estimate.proposalOptions ?? company?.proposalOptions);
  // The Markup, Margin & Tax table: overhead goes into what the client pays; the sales tax is in the lines.
  const extras = tableExtras(markup, estimate.items);
  const client = project.client;
  const companyName = company?.name ?? "Your Company";
  const cityLine = (c: { city: string | null; state: string | null; zip: string | null } | null | undefined) =>
    c ? [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";
  const clientName = client ? `${client.firstName} ${client.lastName}`.trim() : null;
  const date = fmtDate(estimate.sentAt ?? estimate.updatedAt);
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
        specs={specs}
        basePrice={estimate.basePrice}
        extras={{ overhead: extras.overheadTotal, taxLabel: tableTaxLabel(markup), taxPct: tableTaxRate(markup) }}
        initial={options}
        isCustom={!!estimate.proposalOptions}
        pricedOn={fmtDate(estimate.sentAt ?? estimate.updatedAt, "yyyy-MM-dd")}
        isAdmin={user.role === "ADMIN"}
        companyName={companyName}
        cover={{
          url: coverUrl(project),
          projectName: project.name,
          address: [project.address, cityLine(project)].filter(Boolean).join(", "),
          clientName,
          date,
          logoUrl: brand.logoUrl,
        }}
        header={
          // Your logo big on the left; your address on the right with the RE: block under it.
          <header className="flex flex-wrap items-start justify-between gap-8 break-inside-avoid">
            <div className="min-w-0">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt={companyName} className="max-h-44 max-w-[22rem] object-contain" />
              ) : (
                <h1 className="text-3xl font-bold tracking-tight">{companyName}</h1>
              )}
            </div>
            <div className="text-right text-sm leading-relaxed text-slate-700">
              {brand.logoUrl ? null : <p className="font-medium text-slate-900">{companyName}</p>}
              {company?.address ? <p>{company.address}</p> : null}
              {cityLine(company) ? <p>{cityLine(company)}</p> : null}
              {company?.phone ? <p>{company.phone}</p> : null}
              {company?.email ? <p>{company.email}</p> : null}
              {company?.licenseNumber ? <p>License {company.licenseNumber}</p> : null}
              <div className="mt-6 inline-grid grid-cols-[auto_auto] gap-x-4 text-left">
                <span className="font-semibold text-slate-500">RE:</span>
                <div>
                  {clientName ? <p>{clientName}</p> : null}
                  <p>{project.address || project.name}</p>
                  {cityLine(project) ? <p>{cityLine(project)}</p> : null}
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {date} · {estimate.name} v{estimate.version}
              </p>
            </div>
          </header>
        }
        intro={estimate.notes}
        footer={
          <div>
            {estimate.terms ? (
              <section className="mt-10 break-inside-avoid">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Terms</h2>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{estimate.terms}</p>
              </section>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
