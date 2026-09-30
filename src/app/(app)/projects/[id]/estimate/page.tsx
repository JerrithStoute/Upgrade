import Link from "next/link";
import { FileText, Plus, ExternalLink, Copy, RefreshCw, FileStack } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { templateOptions } from "@/lib/estimate-lines";
import { money, pct, fmtDate, cn, lineCost, linePrice } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import { Badge, Card, CardBody, CardHeader, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, Stat, SubmitButton, Table, TBody, THead, Td, Th, Tr, buttonClasses } from "@/components/ui";
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
  createAllowance,
  updateAllowance,
  deleteAllowance,
  convertItemToAllowance,
  syncAllowanceToSelection,
  addTemplateToEstimate,
  saveEstimateAsTemplate,
} from "./actions";

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estimate?: string; edit?: string; editAllowance?: string; addTo?: string }>;
}) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const { estimate: estimateParam, edit, editAllowance, addTo } = await searchParams;
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
  const [estimate, costCodes] = await Promise.all([
    db.estimate.findUnique({
      where: { id: selectedId },
      include: {
        items: { include: { costCode: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        allowances: {
          include: { selection: { select: { id: true, title: true, allowance: true, status: true } } },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
    }),
    activeCostCodes(),
  ]);
  if (!estimate) return null;

  const isDraft = estimate.status === "DRAFT";
  const totals = lineTotals(estimate.items);
  const allowanceTotal = lineTotals(estimate.items.filter((i) => i.isAllowance)).price;
  const base = `/projects/${project.id}/estimate?estimate=${estimate.id}`;
  const hidden = { projectId: project.id, estimateId: estimate.id };
  const selectionHref = (selectionId: string) => `/projects/${project.id}/selections/${selectionId}`;
  // Allowance summary: built-up allowances (with their cost-code lines) + single-line allowance items.
  const builtAllowances = estimate.allowances.map((a) => {
    const lines = estimate.items.filter((i) => i.allowanceId === a.id);
    return { ...a, lines, totals: lineTotals(lines) };
  });
  const singleLineAllowances = estimate.items.filter((i) => i.isAllowance && !i.allowanceId);

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
              <SubmitButton size="sm" variant="ghost">
                <Copy className="h-3.5 w-3.5" /> Save as template
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

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
        allowances={estimate.allowances}
        allowanceActions={{ create: createAllowance, update: updateAllowance, remove: deleteAllowance, convert: convertItemToAllowance }}
        editingAllowanceId={editAllowance ?? null}
        addToAllowanceId={addTo ?? null}
        selectionHref={selectionHref}
      />

      {builtAllowances.length > 0 || singleLineAllowances.length > 0 ? (
        <div id="allowance-summary" className="scroll-mt-24">
          <Card>
            <CardHeader
              title="Allowance summary"
              description="What the client sees as each allowance and the cost codes it is built from. Push an allowance to Selections so the client's choices are tracked against it."
            />
            <Table className="rounded-none border-0 border-t shadow-none">
              <THead>
                <tr>
                  <Th>Allowance</Th>
                  <Th>Built from</Th>
                  <Th right>Cost</Th>
                  <Th right>Markup</Th>
                  <Th right>Client allowance</Th>
                  <Th>Selection</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <TBody>
                {builtAllowances.map((a) => {
                  const outOfSync = a.selection ? Math.abs(a.selection.allowance - a.totals.price) >= 0.01 : false;
                  return (
                    <Tr key={a.id}>
                      <Td className="align-top">
                        <a href={`#allowance-${a.id}`} className="font-medium text-slate-900 hover:underline">
                          {a.name}
                        </a>
                        <span className="block text-xs text-slate-500">{a.group}</span>
                      </Td>
                      <Td className="min-w-[240px] align-top text-xs text-slate-600">
                        {a.lines.length === 0 ? (
                          <span className="italic text-slate-400">No lines yet</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {a.lines.map((l) => (
                              <li key={l.id} className={cn("flex justify-between gap-3", l.isOptional && "text-slate-400 line-through")}>
                                <span>
                                  {l.costCode ? <span className="font-mono text-slate-700">{l.costCode.code}</span> : null} {l.description}
                                </span>
                                <span className="tabular-nums">{money(linePrice(l))}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td right className="align-top">
                        {money(a.totals.cost)}
                      </Td>
                      <Td right className="align-top">
                        {money(a.totals.markup)}
                      </Td>
                      <Td right className="align-top font-semibold text-slate-900">
                        {money(a.totals.price)}
                      </Td>
                      <Td className="align-top text-xs">
                        {a.selection ? (
                          <span className="flex flex-col gap-1">
                            <Link href={selectionHref(a.selection.id)} className="font-medium text-blue-700 hover:underline">
                              {a.selection.title}
                            </Link>
                            <span className="text-slate-500">Allowance {money(a.selection.allowance)}</span>
                            {outOfSync ? (
                              <Badge className="w-fit bg-rose-50 text-rose-800 ring-rose-200">Out of sync</Badge>
                            ) : (
                              <Badge status={a.selection.status} className="w-fit" />
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not linked</span>
                        )}
                      </Td>
                      <Td className="align-top">
                        {a.lines.length > 0 ? (
                          <form action={syncAllowanceToSelection} className="flex justify-end">
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="estimateId" value={estimate.id} />
                            <input type="hidden" name="id" value={a.id} />
                            <SubmitButton size="sm" variant={a.selection && !outOfSync ? "ghost" : "secondary"}>
                              <RefreshCw className="h-3.5 w-3.5" /> {a.selection ? "Update selection" : "Push to selections"}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </Td>
                    </Tr>
                  );
                })}
                {singleLineAllowances.map((i) => (
                  <Tr key={i.id}>
                    <Td>
                      <span className="font-medium text-slate-900">{i.description}</span>
                      <span className="block text-xs text-slate-500">{i.group} · single line</span>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {i.costCode ? <span className="font-mono text-slate-700">{i.costCode.code}</span> : null} {i.costCode?.name ?? "—"}
                    </Td>
                    <Td right>{money(lineCost(i))}</Td>
                    <Td right>{money(linePrice(i) - lineCost(i))}</Td>
                    <Td right className="font-semibold text-slate-900">
                      {money(linePrice(i))}
                    </Td>
                    <Td className="text-xs text-slate-400">{isDraft ? "Use “Build up” to add cost codes" : "—"}</Td>
                    <Td />
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      ) : null}

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
