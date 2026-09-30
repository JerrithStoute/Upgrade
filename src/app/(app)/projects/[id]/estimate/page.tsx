import Link from "next/link";
import { FileText, Plus, ExternalLink, Copy } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { money, pct, fmtDate, cn } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import { Badge, Card, CardBody, CardHeader, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, Stat, SubmitButton, buttonClasses } from "@/components/ui";
import { LineItemsEditor } from "../_components/line-items";
import {
  createEstimate,
  updateEstimateDetails,
  markEstimateSent,
  markEstimateApproved,
  markEstimateDeclined,
  createEstimateVersion,
  deleteEstimate,
  createEstimateItem,
  updateEstimateItem,
  deleteEstimateItem,
} from "./actions";

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estimate?: string; edit?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const { estimate: estimateParam, edit } = await searchParams;
  const project = await getProject(id);

  const estimates = await db.estimate.findMany({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
    select: { id: true, name: true, version: true, status: true, createdAt: true },
  });

  if (estimates.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No estimate yet"
        description="Create an estimate to price this project. Line items roll up to a client-facing proposal."
        action={
          <form action={createEstimate}>
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitButton>
              <Plus className="h-4 w-4" /> Create estimate
            </SubmitButton>
          </form>
        }
      />
    );
  }

  const selectedId = estimates.some((e) => e.id === estimateParam) ? estimateParam! : estimates[0].id;
  const [estimate, costCodes] = await Promise.all([
    db.estimate.findUnique({
      where: { id: selectedId },
      include: { items: { include: { costCode: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    }),
    activeCostCodes(),
  ]);
  if (!estimate) return null;

  const isDraft = estimate.status === "DRAFT";
  const totals = lineTotals(estimate.items);
  const allowanceTotal = lineTotals(estimate.items.filter((i) => i.isAllowance)).price;
  const base = `/projects/${project.id}/estimate?estimate=${estimate.id}`;
  const hidden = { projectId: project.id, estimateId: estimate.id };

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
                <input
                  name="name"
                  defaultValue={estimate.name}
                  aria-label="Estimate name"
                  className="input !w-64 !py-1 text-base font-semibold"
                />
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
              {` · Default markup ${pct(estimate.defaultMarkup, 1)}`}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {estimate.status === "DRAFT" ? (
                <form action={markEstimateSent}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="id" value={estimate.id} />
                  <SubmitButton size="sm">Mark sent</SubmitButton>
                </form>
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
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Cost" value={money(totals.cost)} />
            <Stat label="Markup" value={money(totals.markup)} hint={totals.cost > 0 ? pct((totals.markup / totals.cost) * 100, 1) + " of cost" : undefined} />
            <Stat label="Price" value={money(totals.price)} tone="good" hint="Excludes optional items" />
            <Stat label="Allowances" value={money(allowanceTotal)} hint="Included in price" />
          </div>
        </CardBody>
      </Card>

      <LineItemsEditor
        items={estimate.items}
        costCodes={costCodes}
        editable={isDraft}
        readOnlyHint={`This estimate is ${estimate.status.toLowerCase()} and read-only. Create a new version to make changes.`}
        editingId={edit ?? null}
        baseHref={base}
        hidden={hidden}
        actions={{ create: createEstimateItem, update: updateEstimateItem, remove: deleteEstimateItem }}
        withGroups
        withFlags
        defaultMarkup={estimate.defaultMarkup}
      />

      <Collapsible summary="Proposal notes, terms & default markup">
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
            <Field label="Default markup %" htmlFor="est-markup" hint="Pre-filled on new line items.">
              <input id="est-markup" name="defaultMarkup" type="number" step="0.1" min="0" className="input" defaultValue={estimate.defaultMarkup} />
            </Field>
          </FormGrid>
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
