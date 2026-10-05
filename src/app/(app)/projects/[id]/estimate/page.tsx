import Link from "next/link";
import { FileText, Plus, ExternalLink, Copy, FileStack, Lock, LockOpen } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { loadEstimateSheet, templateOptions } from "@/lib/estimate-lines";
import { divisionCategories, loadEstimateCategories } from "@/lib/estimate-categories";
import { codeDivisions } from "@/lib/cost-code-divisions";
import { loadParameters, projectValues, refreshFormulaQuantities } from "@/lib/estimate-parameters";
import { pct, fmtDate, cn } from "@/lib/utils";
import { Badge, Card, CardHeader, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { EstimateSheet } from "@/components/estimate/estimate-sheet";
import {
  createEstimate,
  updateEstimateDetails,
  markEstimateSent,
  markEstimateApproved,
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

export default async function EstimatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ estimate?: string }> }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const { estimate: estimateParam } = await searchParams;
  const project = await getProject(id);

  const [estimates, templates] = await Promise.all([
    db.estimate.findMany({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
      select: { id: true, name: true, version: true, status: true, createdAt: true },
    }),
    templateOptions(),
  ]);

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
  await refreshDraftFromTakeoff(project.id, selectedId).catch(() => null);
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
    projectValues(project.id),
    db.company.findFirst({ select: { allowanceProfit: true, proposalOptions: true } }),
  ]);
  // Approved, with change orders against it: the Markup, Margin & Tax table stays as the contract was priced.
  const changeOrders = estimate?.status === "APPROVED" ? await db.changeOrder.count({ where: { projectId: project.id } }) : 0;
  if (!estimate) return null;

  const isDraft = estimate.status === "DRAFT";
  const locked = !!estimate.lockedAt;
  const autoNote = isDraft ? parseAutoNote(estimate.autoNote) : null;
  const jobLocked = !!project.pricesLockedAt;
  const reviewHref = `/projects/${project.id}/takeoff/rebid`;
  // Before it goes out: unpriced takeoff items, $0 lines, Item List prices that moved, pricing past its date.
  const check = estimate.status === "APPROVED" ? null : await takeoffPriceCheck(project.id);
  // Re-bids 10%+ over the bid taken for a cost code (only once a bid has been taken).
  const bidOver = (await db.bidAward.count({ where: { projectId: project.id } })) ? overWarnings(await bidComparison(project.id)) : [];
  const zeroLines = isDraft ? zeroLineNames(estimate.items) : [];
  const validDays = parseProposalOptions(estimate.proposalOptions ?? company?.proposalOptions).validDays;
  const expiresOn = estimate.status === "SENT" && estimate.sentAt && validDays > 0 ? addDays(estimate.sentAt, validDays) : null;
  const blanks = (isDraft ? (check?.unpriced.length ?? 0) : 0) + zeroLines.length;
  // The takeoff items behind each takeoff line (its dropdown).
  const detail = sheet.some((sp) => sp.lines.some((l) => l.takeoffKey)) ? await takeoffDetail(project.id) : undefined;
  const nextVersion = Math.max(...estimates.map((e) => e.version)) + 1;
  const itemPrices = Object.fromEntries(estimate.items.flatMap((i) => (i.materialItem ? [[i.materialItem.id, i.materialItem.unitCost]] : [])));

  return (
    <div className="space-y-6">
      {estimates.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Versions</span>
          {estimates.map((e) => (
            <Link
              key={e.id}
              href={`/projects/${project.id}/estimate?estimate=${e.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                e.id === estimate.id ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              v{e.version}
              <Badge status={e.status} className="!px-1.5 !py-0 text-[10px]" />
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <form action={updateEstimateDetails} className="flex items-center gap-1.5">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={estimate.id} />
                <input name="name" defaultValue={estimate.name} aria-label="Estimate name" className="input !w-64 !py-1 text-base font-semibold" />
                <SubmitButton variant="ghost" size="sm">
                  Rename
                </SubmitButton>
              </form>
              <span className="text-sm font-normal text-slate-500">v{estimate.version}</span>
              <Badge status={estimate.status} />
            </span>
          }
          description={
            <>
              Created {fmtDate(estimate.createdAt)}
              {estimate.sentAt ? ` · Sent ${fmtDate(estimate.sentAt)}` : ""}
              {estimate.approvedAt ? ` · Approved ${fmtDate(estimate.approvedAt)}` : ""}
              {` · New lines start at ${pct(estimate.defaultMarkup, 1)} profit`}
              {isDraft ? "" : " · Changes save as a new version"}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {estimate.status === "DRAFT" ? (
                blanks ? (
                  <ConfirmForm
                    action={markEstimateSent}
                    hidden={{ projectId: project.id, id: estimate.id }}
                    variant="primary"
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
                    <SubmitButton size="sm">Mark sent</SubmitButton>
                  </form>
                )
              ) : null}
              {estimate.status === "SENT" ? (
                <>
                  <form action={markEstimateApproved}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="id" value={estimate.id} />
                    <SubmitButton size="sm" variant="success">
                      Mark approved
                    </SubmitButton>
                  </form>
                  <form action={markEstimateDeclined}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="id" value={estimate.id} />
                    <SubmitButton size="sm" variant="danger">
                      Mark declined
                    </SubmitButton>
                  </form>
                </>
              ) : null}
              <Link href={`/projects/${project.id}/estimate/${estimate.id}/proposal`} className={buttonClasses("secondary", "sm")}>
                <ExternalLink className="h-3.5 w-3.5" /> View proposal
              </Link>
              {isDraft ? (
                <form action={lockEstimate}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={estimate.id} />
                  <input type="hidden" name="lock" value={locked ? "0" : "1"} />
                  <SubmitButton size="sm" variant="secondary">
                    {locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {locked ? "Unlock" : "Lock"}
                  </SubmitButton>
                </form>
              ) : null}
              <form action={createEstimateVersion}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={estimate.id} />
                <SubmitButton size="sm" variant="secondary">
                  <Copy className="h-3.5 w-3.5" /> New version
                </SubmitButton>
              </form>
              {isDraft ? (
                <ConfirmForm action={deleteEstimate} hidden={{ projectId: project.id, id: estimate.id }} message={`Delete estimate v${estimate.version}? This cannot be undone.`}>
                  Delete
                </ConfirmForm>
              ) : null}
            </div>
          }
        />
      </Card>

      {(isDraft && templates.length > 0) || isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          {isDraft && templates.length > 0 ? (
            <form action={addTemplateToEstimate} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="estimateId" value={estimate.id} />
              <FileStack className="h-4 w-4 text-slate-400" />
              <label htmlFor="add-template" className="text-sm font-medium text-slate-700">
                Add from template
              </label>
              <select id="add-template" name="templateId" className="input !w-60 !py-1" required defaultValue="">
                <option value="" disabled>
                  Choose a template…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t._count.items} lines)
                  </option>
                ))}
              </select>
              <SubmitButton size="sm" variant="secondary">
                <Plus className="h-3.5 w-3.5" /> Add lines
              </SubmitButton>
            </form>
          ) : (
            <span />
          )}
          {isAdmin ? (
            <form action={saveEstimateAsTemplate} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="estimateId" value={estimate.id} />
              <input name="name" aria-label="Template name" defaultValue={estimate.name} className="input !w-56 !py-1" required />
              <label
                className="flex items-center gap-1.5 text-xs text-slate-600"
                title="Keeps your formulas and typed unit costs. Quantities, allowances and the takeoff's totals start at 0."
              >
                <input type="checkbox" name="clear" value="1" defaultChecked className="h-3.5 w-3.5 rounded border-slate-300" />
                Clear this job&apos;s numbers
              </label>
              <SubmitButton size="sm" variant="ghost">
                <Copy className="h-3.5 w-3.5" /> Save as template
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* The job's prices: following the Item List, or locked. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {jobLocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
            <Lock className="h-3.5 w-3.5" /> Job prices locked {fmtDate(project.pricesLockedAt)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
            <LockOpen className="h-3.5 w-3.5" /> Job prices follow the Item List
          </span>
        )}
        <Link href={reviewHref} className="text-xs font-medium text-blue-700 hover:underline">
          {jobLocked ? "Price review / unlock" : "Price review / lock"}
        </Link>
        {locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
            <Lock className="h-3.5 w-3.5" /> This estimate is locked — no automatic updates or edits until you unlock it
          </span>
        ) : null}
      </div>

      {autoNote ? <AutoChanges note={autoNote} onDismiss={dismissAutoNote.bind(null, project.id, estimate.id)} /> : null}

      <PriceWarnings
        unpriced={isDraft ? check?.unpriced : undefined}
        zeroLines={zeroLines}
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
        saveValues={saveParameterValues.bind(null, project.id)}
        allowanceProfitDefault={company?.allowanceProfit ?? false}
        markupTable={parseMarkupTable(estimate.markupTable, estimate.defaultMarkup)}
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

      <Collapsible summary="Proposal notes, terms & starting profit %">
        <form action={updateEstimateDetails} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="id" value={estimate.id} />
          <FormGrid>
            <Field label="Notes (shown on proposal)" htmlFor="est-notes" className="md:col-span-2">
              <textarea id="est-notes" name="notes" rows={3} className="input" defaultValue={estimate.notes ?? ""} />
            </Field>
            <Field label="Terms (shown on proposal)" htmlFor="est-terms" className="md:col-span-2">
              <textarea id="est-terms" name="terms" rows={3} className="input" defaultValue={estimate.terms ?? ""} />
            </Field>
            <Field label="Starting profit %" htmlFor="est-markup" hint="What new lines start with.">
              <input id="est-markup" name="defaultMarkup" type="number" step="0.1" min="0" className="input" defaultValue={estimate.defaultMarkup} />
            </Field>
          </FormGrid>
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
