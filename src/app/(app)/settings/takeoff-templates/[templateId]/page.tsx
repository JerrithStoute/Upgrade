import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { loadCodeRules } from "@/lib/item-codes";
import { materialItemOptions } from "@/lib/material-items";
import { CONDITION_COLORS, CONDITION_TYPE_LABELS, isMemberType, metricLabel, metricUnit, type ConditionType } from "@/lib/takeoff";
import { costCodeLabel, money, num } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { ConditionForm } from "@/app/(app)/projects/[id]/takeoff/_components/condition-form";
import { AssemblyForm } from "@/app/(app)/projects/[id]/takeoff/_components/assembly-form";
import {
  createTemplateCondition,
  createTemplateItem,
  deleteTakeoffTemplate,
  deleteTemplateCondition,
  deleteTemplateItem,
  updateTakeoffTemplate,
  updateTemplateCondition,
  updateTemplateItem,
} from "../actions";

export default async function TakeoffTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ edit?: string; editItem?: string; added?: string; updated?: string; kept?: string }>;
}) {
  const { templateId } = await params;
  const { edit, editItem, added, updated, kept } = await searchParams;
  const [template, costCodes, items, memberSizes, company, codeRules, spanTables] = await Promise.all([
    db.takeoffTemplate.findUnique({
      where: { id: templateId },
      include: {
        conditions: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: {
            items: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              include: { costCode: { select: { code: true, name: true } }, materialItem: { select: { unitCost: true, unit: true } } },
            },
          },
        },
      },
    }),
    activeCostCodes(),
    materialItemOptions(),
    db.memberSize.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true, soldAs: true, stockLengths: true } }),
    db.company.findFirst({ select: { defaultMarkup: true } }),
    loadCodeRules(),
    db.spanTable.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, use: true } }),
  ]);
  if (!template) notFound();
  const base = `/settings/takeoff-templates/${template.id}`;
  const hidden = { templateId: template.id };
  const defaultMarkup = company?.defaultMarkup ?? 20;

  return (
    <div className="space-y-5">
      {added != null ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Added {added} new takeoff{added === "1" ? "" : "s"} to this template
          {Number(updated) > 0 ? `, updated ${updated}` : ""}
          {Number(kept) > 0 ? ` · ${kept} ${kept === "1" ? "was" : "were"} already here and left as ${kept === "1" ? "it was" : "they were"}` : ""}.
        </p>
      ) : null}
      <Link href="/settings/takeoff-templates" className={buttonClasses("ghost", "sm")}>
        <ArrowLeft className="h-3.5 w-3.5" /> Takeoff templates
      </Link>

      <Card>
        <CardHeader
          title={template.name}
          description={`${template.conditions.length} takeoff${template.conditions.length === 1 ? "" : "s"}. Add it to a job from the job's Takeoff tab.`}
          actions={
            <ConfirmForm action={deleteTakeoffTemplate} hidden={hidden} message={`Delete the template "${template.name}"? Jobs that used it keep their takeoffs.`}>
              Delete template
            </ConfirmForm>
          }
        />
        <CardBody>
          <form action={updateTakeoffTemplate} className="space-y-3">
            <input type="hidden" name="templateId" value={template.id} />
            <FormGrid>
              <Field label="Name" htmlFor="t-name">
                <input id="t-name" name="name" required className="input" defaultValue={template.name} />
              </Field>
              <Field label="Description" htmlFor="t-desc">
                <input id="t-desc" name="description" className="input" defaultValue={template.description ?? ""} />
              </Field>
            </FormGrid>
            <SubmitButton size="sm" variant="secondary">
              Save name
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      {template.conditions.length === 0 ? (
        <EmptyState icon={Layers} title="No takeoffs in this template" description="Add the takeoffs you measure on this kind of job below." />
      ) : (
        <div className="space-y-3">
          {template.conditions.map((c) => {
            const editing = edit === c.id;
            return (
              <div key={c.id} id={`condition-${c.id}`} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <Badge>{CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type}</Badge>
                  {c.memberSize ? <Badge>{c.memberSize}</Badge> : null}
                  {c.type === "FRAMING" ? <Badge>{num(c.spacing, 2)}&quot; o.c.</Badge> : null}
                  {c.pitch > 0 ? (
                    <Badge>
                      {num(c.pitch, 2)}/12{c.type === "HIP_VALLEY" && c.pitch2 != null && c.pitch2 !== c.pitch ? ` & ${num(c.pitch2, 2)}/12` : ""} pitch
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-xs text-slate-500">{metricLabel(c.metric)}</span>
                  <Link href={editing ? base : `${base}?edit=${c.id}#condition-${c.id}`} className={buttonClasses("ghost", "sm")}>
                    <Pencil className="h-3.5 w-3.5" /> {editing ? "Close" : "Edit"}
                  </Link>
                </div>
                {editing ? (
                  <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                    <ConditionForm
                      action={updateTemplateCondition}
                      hidden={hidden}
                      costCodes={costCodes}
                      codeRules={codeRules}
                      memberSizes={memberSizes}
                      spanTables={spanTables}
                      itemOptions={items}
                      defaultMarkup={defaultMarkup}
                      values={c}
                      cancelHref={`${base}#condition-${c.id}`}
                    />
                    <div className="flex justify-end">
                      <ConfirmForm action={deleteTemplateCondition} hidden={{ ...hidden, id: c.id }} message={`Remove "${c.name}" from this template?`}>
                        Remove condition
                      </ConfirmForm>
                    </div>
                  </div>
                ) : null}
                <div className="border-t border-slate-100 px-4 py-3">
                  {c.items.length > 0 ? (
                    <table className="mb-3 w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-1 text-left font-medium">Assembly item</th>
                          <th className="py-1 text-left font-medium">Formula</th>
                          <th className="py-1 text-right font-medium">Price</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {c.items.map((item) =>
                          editItem === item.id ? (
                            <tr key={item.id}>
                              <td colSpan={4} className="py-3">
                                <AssemblyForm
                                  action={updateTemplateItem}
                                  hidden={hidden}
                                  condition={c}
                                  costCodes={costCodes}
                                  items={items}
                                  values={item}
                                  cancelHref={`${base}#condition-${c.id}`}
                                />
                              </td>
                            </tr>
                          ) : (
                            <tr key={item.id}>
                              <td className="py-1.5 text-slate-900">
                                {item.description}
                                {item.costCode ? <span className="block text-xs text-slate-500">{costCodeLabel(item.costCode)}</span> : null}
                              </td>
                              <td className="py-1.5 text-xs text-slate-600">
                                {num(item.qty, 4)} {item.unit} per {num(item.per, 4)} {metricUnit(item.metric)} of{" "}
                                {metricLabel(item.metric)
                                  .replace(/ \(.*\)$/, "")
                                  .toLowerCase()}
                                {item.wastePct > 0 ? ` + ${num(item.wastePct, 1)}%` : ""}
                                {item.roundUp ? " · round up" : ""}
                              </td>
                              <td className="py-1.5 text-right text-xs text-slate-600">
                                {item.materialItem ? `Item List: ${money(item.materialItem.unitCost)}/${item.materialItem.unit}` : `${money(item.unitCost)}/${item.unit}`}
                              </td>
                              <td className="py-1.5 text-right">
                                <div className="flex justify-end gap-1">
                                  <Link href={`${base}?editItem=${item.id}#condition-${c.id}`} className={buttonClasses("ghost", "sm")}>
                                    Edit
                                  </Link>
                                  <ConfirmForm action={deleteTemplateItem} hidden={{ ...hidden, id: item.id }} message={`Remove "${item.description}"?`} variant="ghost">
                                    <span className="text-xs text-rose-600">Remove</span>
                                  </ConfirmForm>
                                </div>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  ) : null}
                  <details>
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-700 [&::-webkit-details-marker]:hidden">
                      <Plus className="h-3.5 w-3.5" /> {isMemberType(c.type) ? "Add an add-on item (hangers, ties, blocking, sheathing…)" : "Add assembly item"}
                    </summary>
                    <div className="mt-3">
                      <AssemblyForm action={createTemplateItem} hidden={hidden} condition={c} costCodes={costCodes} items={items} />
                    </div>
                  </details>
                  {isMemberType(c.type) ? <p className="mt-2 text-xs text-slate-500">Lumber lines are added on each job from its layout.</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Collapsible
        defaultOpen={template.conditions.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add takeoff
          </span>
        }
      >
        <ConditionForm
          action={createTemplateCondition}
          hidden={hidden}
          costCodes={costCodes}
          codeRules={codeRules}
          memberSizes={memberSizes}
          spanTables={spanTables}
          itemOptions={items}
          defaultMarkup={defaultMarkup}
          nextColor={CONDITION_COLORS[template.conditions.length % CONDITION_COLORS.length]}
        />
      </Collapsible>
    </div>
  );
}
