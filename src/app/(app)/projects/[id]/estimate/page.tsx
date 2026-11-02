import { redirect } from "next/navigation";
import Link from "@/components/link";
import { FileText, Plus, ExternalLink, Copy, FileStack, Lock, LockOpen, ChevronDown } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { loadEstimateSheet, templateOptions } from "@/lib/estimate-lines";
import { divisionCategories, loadEstimateCategories } from "@/lib/estimate-categories";
import { codeDivisions } from "@/lib/cost-code-divisions";
import { estimateValues, loadParameters, refreshFormulaQuantities } from "@/lib/estimate-parameters";
import { pct, fmtDate, cn } from "@/lib/utils";
import { Badge, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { EstimateSheet } from "@/components/estimate/estimate-sheet";
import {
  createEstimate,
  updateEstimateDetails,
  markEstimateSent,
  markEstimateApproved,
  estimateAsBudget,
  markEstimateDeclined,
  createEstimateVersion,
  deleteEstimate,
  saveEstimate,
  addTemplateToEstimate,
  saveEstimateAsTemplate,
  saveMarkupDefault,
  saveParameterValues,
  lockEstimate,
  dismissAutoNote,
  lockFromAutoNote,
} from "./actions";
import { refreshDraftFromTakeoff } from "@/lib/takeoff-data";
import { parseAutoNote } from "@/lib/takeoff-changes";
import { AutoChanges } from "@/components/estimate/auto-changes";
import { parseMarkupTable } from "@/lib/markup";
import { takeoffDetail, takeoffPriceCheck } from "@/lib/takeoff-data";
import { parseProposalOptions } from "@/lib/proposal-options";
import { PriceWarnings, zeroLineNames } from "@/components/estimate/price-warnings";
import { bidComparison, overWarnings } from "@/lib/bids";
import { addDays } from "date-fns";
import { ClientEmailNote } from "@/components/client-email-note";

export default async function EstimatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ estimate?: string; rename?: string }> }) {
  const user = await requireView("estimates");
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const { estimate: estimateParam, rename } = await searchParams;
  const project = await getProject(id);

  const [estimates, templates] = await Promise.all([
    db.estimate.findMany({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: { id: true, name: true, version: true, status: true, createdAt: true },
    }),
    templateOptions(),
  ]);
  // Someone who doesn't see costs and profit gets the estimate as the client sees it: the proposal.
  if (!user.access.costs) {
    const shown = estimates.find((e) => e.status === "APPROVED") ?? estimates[0];
    redirect(shown ? `/projects/${project.id}/estimate/${shown.id}/proposal` : `/projects/${project.id}`);
  }

  if (estimates.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No estimate yet"
        description="Create an estimate to price this project — start blank or from one of your estimate templates. Line items roll up to a client-facing proposal."
        action={
          <form action={createEstimate} className="flex flex-wrap items-center justify-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            {templates.length > 0 ? (
              <select name="templateId" aria-label="Start from template" className="input !w-64" defaultValue="">
                <option value="">Blank estimate</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t._count.items} lines)
                  </option>
                ))}
              </select>
            ) : null}
            <SubmitButton>
              <Plus className="h-4 w-4" /> Create estimate
            </SubmitButton>
          </form>
        }
      />
    );
  }

  const selectedId = estimates.some((e) => e.id === estimateParam) ? estimateParam! : estimates[0].id;
  // The sheet first: it files any loose lines (older estimates) into spec items.
  // A draft with the takeoff on it updates itself: new prices and quantities ("what changed" shows how).
  // That also brings the job's lumber lines up to date — once; what follows reuses them.
  const refreshed = await refreshDraftFromTakeoff(project.id, selectedId).catch(() => null);
  // Formula quantities follow the job's parameter values and its sales price (drafts only) — after the takeoff, so they see its totals.
  await refreshFormulaQuantities(selectedId);
  const sheet = await loadEstimateSheet(selectedId);
  const [estimate, costCodes, filing, divisionList, parameters, values, company] = await Promise.all([
    db.estimate.findUnique({
      where: { id: selectedId },
      include: {
        items: { include: { costCode: true, materialItem: { select: { id: true, unitCost: true } } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    }),
    activeCostCodes(),
    divisionCategories(),
    isAdmin ? loadEstimateCategories() : null,
    loadParameters(),
    estimateValues(selectedId),
    db.company.findFirst({ select: { allowanceProfit: true, proposalOptions: true } }),
  ]);
  if (!estimate) return null;
  // The rest looked up together, not one after another.
  const [changeOrders, check, bidOver, detail] = await Promise.all([
    // Approved, with change orders against it: the Markup, Margin & Tax table stays as the contract was priced.
    estimate.status === "APPROVED" ? db.changeOrder.count({ where: { projectId: project.id } }) : 0,
    // Before it goes out: unpriced takeoff items, $0 lines, Item List prices that moved, pricing past its date.
    estimate.status === "APPROVED" ? null : takeoffPriceCheck(project.id),
    // Re-bids 10%+ over the bid taken for a cost code (only once a bid has been taken).
    db.bidAward
      .count({ where: { projectId: project.id } })
      .then(async (n) => (n ? overWarnings(await bidComparison(project.id, { synced: refreshed !== null })) : [])),
    // The takeoff items behind each takeoff line (its dropdown).
    sheet.some((sp) => sp.lines.some((l) => l.takeoffKey || l.takeoffStopped)) ? takeoffDetail(project.id) : undefined,
  ]);

  const isDraft = estimate.status === "DRAFT";
  const locked = !!estimate.lockedAt;
  const autoNote = isDraft ? parseAutoNote(estimate.autoNote) : null;
  const jobLocked = !!project.pricesLockedAt;
  const reviewHref = `/projects/${project.id}/takeoff/rebid`;
  const zeroLines = isDraft ? zeroLineNames(estimate.items) : [];
  const validDays = parseProposalOptions(estimate.proposalOptions ?? company?.proposalOptions).validDays;
  const expiresOn = estimate.status === "SENT" && estimate.sentAt && validDays > 0 ? addDays(estimate.sentAt, validDays) : null;
  const blanks = (isDraft ? (check?.unpriced.length ?? 0) : 0) + zeroLines.length;
  const nextVersion = Math.max(...estimates.map((e) => e.version)) + 1;
  const itemPrices = Object.fromEntries(estimate.items.flatMap((i) => (i.materialItem ? [[i.materialItem.id, i.materialItem.unitCost]] : [])));

  const here = `/projects/${project.id}/estimate?estimate=${estimate.id}`;

  return (
    <div className="space-y-3">
      {/* Line 1: which estimate (and its versions), and the buttons. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {rename ? (
          <form action={updateEstimateDetails} className="flex items-center gap-1.5">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="id" value={estimate.id} />
            <input name="name" defaultValue={estimate.name} aria-label="Estimate name" required autoFocus className="input !h-7 !w-64 !py-0 text-sm font-semibold" />
            <SubmitButton size="xs">Save</SubmitButton>
            <Link href={here} className="text-xs font-medium text-blue-700 hover:underline">
              Cancel
            </Link>
          </form>
        ) : (
          <h2 className="text-lg font-semibold text-slate-900">{estimate.name}</h2>
        )}
        {estimates.length > 1 ? (
          [...estimates].reverse().map((e) => (
            <Link
              key={e.id}
              href={`/projects/${project.id}/estimate?estimate=${e.id}`}
              title={`${e.name} · ${e.status.toLowerCase()}`}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                e.id === estimate.id ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              v{e.version}
            </Link>
          ))
        ) : (
          <span className="text-xs text-slate-500">v{estimate.version}</span>
        )}
        <Badge status={estimate.status} />
        {rename ? null : (
          <Link href={`${here}&rename=1`} className="text-xs font-medium text-blue-700 hover:underline">
            Rename
          </Link>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {project.isSpec && (estimate.status === "DRAFT" || estimate.status === "SENT") ? (
            // A spec house has no client to send it to: one step makes it the budget.
            <ConfirmForm
              action={estimateAsBudget}
              hidden={{ projectId: project.id, id: estimate.id }}
              variant="success"
              size="xs"
              message={`Use "${estimate.name}" as this spec house's budget? The Budget follows it and the job's prices lock.${
                blanks
                  ? `

Heads up: ${[check?.unpriced.length ? `${check.unpriced.length} takeoff item(s) have no price` : "", zeroLines.length ? `${zeroLines.length} estimate item(s) are $0` : ""].filter(Boolean).join(" and ")}.`
                  : ""
              }`}
            >
              Use as the budget
            </ConfirmForm>
          ) : null}
          {!project.isSpec && estimate.status === "DRAFT" ? (
            blanks ? (
              <ConfirmForm
                action={markEstimateSent}
                hidden={{ projectId: project.id, id: estimate.id }}
                variant="primary"
                size="xs"
                message={`Before you send: ${[
                  check?.unpriced.length ? `${check.unpriced.length} takeoff item${check.unpriced.length === 1 ? " has" : "s have"} no price` : "",
                  zeroLines.length ? `${zeroLines.length} estimate item${zeroLines.length === 1 ? " is" : "s are"} $0` : "",
                ]
                  .filter(Boolean)
                  .join(" and ")} — they'd show at $0 on the proposal.\n\nMark sent anyway?`}
              >
                Mark sent
              </ConfirmForm>
            ) : (
              <form action={markEstimateSent}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={estimate.id} />
                <SubmitButton size="xs">Mark sent</SubmitButton>
              </form>
            )
          ) : null}
          {!project.isSpec && estimate.status === "SENT" ? (
            <>
              <form action={markEstimateApproved}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={estimate.id} />
                <SubmitButton size="xs" variant="success">
                  Mark approved
                </SubmitButton>
              </form>
              <form action={markEstimateDeclined}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={estimate.id} />
                <SubmitButton size="xs" variant="danger">
                  Mark declined
                </SubmitButton>
              </form>
            </>
          ) : null}
          <Link href={`/projects/${project.id}/estimate/${estimate.id}/proposal`} className={buttonClasses("secondary", "xs")}>
            <ExternalLink className="h-3.5 w-3.5" /> View proposal
          </Link>
          {isDraft ? (
            <form action={lockEstimate}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={estimate.id} />
              <input type="hidden" name="lock" value={locked ? "0" : "1"} />
              <SubmitButton size="xs" variant="secondary">
                {locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {locked ? "Unlock" : "Lock"}
              </SubmitButton>
            </form>
          ) : null}
          {/* A new version: a copy of this one (same plans), or a fresh start (other plans). Admins: or a template from it. */}
          <details className="group relative">
            <summary className={cn(buttonClasses("secondary", "xs"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              <Plus className="h-3.5 w-3.5" /> New version <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-80 space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg">
              <form action={createEstimateVersion} className="space-y-1">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={estimate.id} />
                <SubmitButton size="xs" variant="secondary" className="w-full">
                  <Copy className="h-3.5 w-3.5" /> Copy v{estimate.version}
                </SubmitButton>
                <p className="text-xs text-slate-500">Same plans, a revision: every line, price and parameter value of v{estimate.version}.</p>
              </form>
              <form action={createEstimate} className="space-y-1.5 border-t border-slate-100 pt-3">
                <input type="hidden" name="projectId" value={project.id} />
                <select name="templateId" aria-label="Start fresh from" className="input !h-7 !py-0 text-xs" defaultValue="">
                  <option value="">Blank estimate</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t._count.items} lines)
                    </option>
                  ))}
                </select>
                <SubmitButton size="xs" variant="secondary" className="w-full">
                  <Plus className="h-3.5 w-3.5" /> Start fresh
                </SubmitButton>
                <p className="text-xs text-slate-500">Other plans: blank, or from a template. Parameters start blank (or with the template&apos;s values).</p>
              </form>
              {isAdmin ? (
                <form action={saveEstimateAsTemplate} className="space-y-1.5 border-t border-slate-100 pt-3">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <input name="name" aria-label="Template name" defaultValue={estimate.name} className="input !h-7 !py-0 text-xs" required />
                  <SubmitButton size="xs" variant="secondary" className="w-full">
                    <FileStack className="h-3.5 w-3.5" /> Save as template
                  </SubmitButton>
                  <p className="text-xs text-slate-500">Keeps your lines, formulas and typed unit costs; this job&apos;s quantities and numbers start blank.</p>
                </form>
              ) : null}
            </div>
          </details>
          {isDraft ? (
            <ConfirmForm
              action={deleteEstimate}
              hidden={{ projectId: project.id, id: estimate.id }}
              variant="ghost"
              size="xs"
              message={`Delete estimate v${estimate.version}? This cannot be undone.`}
            >
              <span className="text-rose-600">Delete</span>
            </ConfirmForm>
          ) : null}
        </div>
      </div>

      {/* Line 2: its dates and details, and where the job's prices stand. */}
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
        <span>
          Created {fmtDate(estimate.createdAt)}
          {estimate.sentAt ? ` · Sent ${fmtDate(estimate.sentAt)}` : ""}
          {estimate.approvedAt ? ` · Approved ${fmtDate(estimate.approvedAt)}${estimate.signedBy && estimate.status === "APPROVED" ? ` (signed ${estimate.signedBy})` : ""}` : ""}
          {estimate.status === "DECLINED" && estimate.decidedAt
            ? ` · Declined by ${estimate.signedBy ?? "the client"} ${fmtDate(estimate.decidedAt)}${estimate.decisionNote ? `: “${estimate.decisionNote}”` : ""}`
            : ""}
          {` · New lines start at ${pct(estimate.defaultMarkup, 1)} markup`}
          {isDraft ? "" : " · Changes save as a new version"} ·{" "}
        </span>
        {jobLocked ? (
          <span className="inline-flex items-center gap-1 font-medium text-amber-800">
            <Lock className="h-3 w-3" /> Job prices locked {fmtDate(project.pricesLockedAt)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <LockOpen className="h-3 w-3" /> Job prices follow the Item List
          </span>
        )}
        <span>·</span>
        <Link href={reviewHref} className="font-medium text-blue-700 hover:underline">
          {jobLocked ? "Price review / unlock" : "Price review / lock"}
        </Link>
        {locked ? (
          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
            · <Lock className="h-3 w-3" /> This estimate is locked: no automatic updates or edits until you unlock it
          </span>
        ) : null}
        {!project.isSpec && estimate.status === "DRAFT" ? (
          <>
            <span>·</span>
            <ClientEmailNote clientId={project.clientId} button="Mark sent" className="text-xs text-slate-500" />
          </>
        ) : null}
      </p>

      {autoNote ? (
        <AutoChanges
          note={autoNote}
          canPutBack={!!estimate.autoBase}
          onDismiss={dismissAutoNote.bind(null, project.id, estimate.id)}
          onLock={lockFromAutoNote.bind(null, project.id, estimate.id)}
        />
      ) : null}

      <PriceWarnings
        unpriced={isDraft ? check?.unpriced : undefined}
        zeroLines={zeroLines}
        stale={isDraft ? check?.stale : undefined}
        changed={check?.changed}
        expired={expiresOn && expiresOn < new Date() ? { on: expiresOn, days: validDays } : undefined}
        materialsHref={`/projects/${project.id}/materials`}
        rebidHref={reviewHref}
        bidOver={bidOver}
        bidsHref={`/projects/${project.id}/bids`}
      />

      <EstimateSheet
        locked={locked}
        key={`${estimate.id}-${estimate.updatedAt.getTime()}`}
        viewKey={estimate.id}
        initial={sheet}
        costCodes={costCodes}
        defaultMarkup={estimate.defaultMarkup}
        estimate={{
          version: estimate.version,
          nextVersion,
          isDraft,
          status: estimate.status,
          basePrice: estimate.basePrice,
          totalSqFt: estimate.totalSqFt,
          itemPrices,
          materialListHref: `/projects/${project.id}/materials`,
          takeoffDetail: detail,
        }}
        save={saveEstimate.bind(null, project.id, estimate.id)}
        newVersionHref={`/projects/${project.id}/estimate?estimate=`}
        filing={filing}
        parameters={parameters}
        values={values}
        canEditParameters={isAdmin}
        saveValues={saveParameterValues.bind(null, project.id, estimate.id)}
        allowanceProfitDefault={company?.allowanceProfit ?? false}
        markupTable={parseMarkupTable(estimate.markupTable, estimate.defaultMarkup)}
        toolbarExtra={
          isDraft && templates.length > 0 ? (
            <details className="group relative">
              <summary className={cn(buttonClasses("secondary", "xs"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                <FileStack className="h-3.5 w-3.5" /> Add from template <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <form action={addTemplateToEstimate} className="absolute right-0 z-30 mt-1 w-72 space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="estimateId" value={estimate.id} />
                <select name="templateId" aria-label="Template to add" className="input !h-7 !py-0 text-xs" required defaultValue="">
                  <option value="" disabled>
                    Choose a template…
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t._count.items} lines)
                    </option>
                  ))}
                </select>
                <SubmitButton size="xs" variant="secondary" className="w-full">
                  <Plus className="h-3.5 w-3.5" /> Add its lines
                </SubmitButton>
                <p className="text-xs text-slate-500">Adds the template&apos;s categories and items to this draft.</p>
              </form>
            </details>
          ) : null
        }
        markupLocked={
          changeOrders > 0
            ? `This estimate is approved and the job has change order${changeOrders === 1 ? "" : "s"}, so its markup, margin & tax stay as the contract was priced.`
            : null
        }
        saveMarkupDefault={isAdmin ? saveMarkupDefault : undefined}
        divisionsSetup={
          divisionList
            ? {
                initial: divisionList.map((d) => ({ name: d.name, divisions: d.divisions.map((x) => x.division) })),
                categories: codeDivisions(costCodes).map(([name, list]) => ({ name, codes: list.length })),
              }
            : undefined
        }
      />

      <Collapsible summary="Proposal introduction, terms & starting markup %">
        <form action={updateEstimateDetails} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="id" value={estimate.id} />
          <FormGrid>
            <Field
              label="Introduction (top of the proposal)"
              htmlFor="est-notes"
              className="md:col-span-2"
              hint="Opens the proposal, under your header — a thank-you and what it covers."
            >
              <textarea id="est-notes" name="notes" rows={5} className="input" defaultValue={estimate.notes ?? ""} />
            </Field>
            <Field label="Terms (end of the proposal)" htmlFor="est-terms" className="md:col-span-2">
              <textarea id="est-terms" name="terms" rows={5} className="input" defaultValue={estimate.terms ?? ""} />
            </Field>
            <Field label="Starting markup %" htmlFor="est-markup" hint="What new lines start with.">
              <input id="est-markup" name="defaultMarkup" type="number" step="0.1" min="0" className="input" defaultValue={estimate.defaultMarkup} />
            </Field>
          </FormGrid>
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
