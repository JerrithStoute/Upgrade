import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Layers, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { loadCodeRules } from "@/lib/item-codes";
import { materialItemOptions } from "@/lib/material-items";
import { CONDITION_COLORS, CONDITION_TYPE_LABELS, isMemberType, metricLabel, metricUnit, type ConditionType } from "@/lib/takeoff";
import { costCodeLabel, money, num } from "@/lib/utils";
import { ConfirmForm, EmptyState, SubmitButton } from "@/components/ui";
import { ConditionForm } from "@/app/(app)/projects/[id]/takeoff/_components/condition-form";
import { AssemblyForm } from "@/app/(app)/projects/[id]/takeoff/_components/assembly-form";
import { requireView } from "@/lib/auth";
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

const link = "text-xs font-medium text-blue-700 hover:underline";

export default async function TakeoffTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ edit?: string; editItem?: string; addItem?: string; add?: string; details?: string; added?: string; updated?: string; kept?: string }>;
}) {
  await requireView("lists");
  const { templateId } = await params;
  const { edit, editItem, addItem, add, details, added, updated, kept } = await searchParams;
  const [template, costCodes, items, memberSizes, codeRules, spanTables] = await Promise.all([
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
    loadCodeRules(),
    db.spanTable.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, use: true } }),
  ]);
  if (!template) notFound();
  const base = `/catalog/takeoff-templates/${template.id}`;
  const hidden = { templateId: template.id };
  // Nothing in it yet: the Add takeoff box is open to start.
  const addingTakeoff = add === "1" || template.conditions.length === 0;

  // The top of an open box: what it is, then (when it can be) Remove…, and Cancel.
  const boxHead = (title: string, cancel: string, remove?: React.ReactNode) => (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <span className="flex items-center gap-3">
        {remove}
        <Link href={cancel} scroll={false} className={link}>
          Cancel
        </Link>
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      {details === "1" ? (
        <form action={updateTakeoffTemplate} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-blue-50/40 px-4 py-2.5">
          <input type="hidden" name="templateId" value={template.id} />
          <input name="name" required autoFocus aria-label="Name" className="input !h-7 !w-56 !py-0 text-xs" defaultValue={template.name} />
          <input
            name="description"
            aria-label="Description"
            className="input !h-7 !w-auto min-w-0 flex-1 !py-0 text-xs"
            defaultValue={template.description ?? ""}
            placeholder="What it's for"
          />
          <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
            Save
          </SubmitButton>
          <Link href={base} scroll={false} className={link}>
            Cancel
          </Link>
        </form>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold text-slate-900">{template.name}</h1>
            {template.description ? <span className="text-xs text-slate-500">{template.description}</span> : null}
            <Link href={`${base}?details=1`} scroll={false} className={link}>
              Edit
            </Link>
          </div>
          <ConfirmForm action={deleteTakeoffTemplate} hidden={hidden} message={`Delete the template "${template.name}"? Jobs that used it keep their takeoffs.`} variant="ghost">
            <span className="text-xs text-rose-600">Delete template…</span>
          </ConfirmForm>
        </div>
      )}

      {added != null ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Added {added} new takeoff{added === "1" ? "" : "s"} to this template
          {Number(updated) > 0 ? `, updated ${updated}` : ""}
          {Number(kept) > 0 ? ` · ${kept} ${kept === "1" ? "was" : "were"} already here and left as ${kept === "1" ? "it was" : "they were"}` : ""}.
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs text-slate-500">
            {template.conditions.length} takeoff{template.conditions.length === 1 ? "" : "s"} · add it to a job from the job&apos;s Takeoff tab
          </span>
          <Link
            href={`${base}?add=1`}
            scroll={false}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add takeoff
          </Link>
        </header>
        {addingTakeoff ? (
          <div className="border-b border-slate-100 bg-blue-50/40 px-4 py-3">
            {boxHead("Add a takeoff", base)}
            <ConditionForm
              action={createTemplateCondition}
              hidden={hidden}
              costCodes={costCodes}
              codeRules={codeRules}
              memberSizes={memberSizes}
              spanTables={spanTables}
              itemOptions={items}
              nextColor={CONDITION_COLORS[template.conditions.length % CONDITION_COLORS.length]}
            />
          </div>
        ) : null}

        {template.conditions.length === 0 ? (
          <EmptyState icon={Layers} title="No takeoffs in this template" description="Add the takeoffs you measure on this kind of job." />
        ) : (
          template.conditions.map((c) => {
            const facts = [
              CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type,
              c.memberSize,
              c.type === "FRAMING" ? `${num(c.spacing, 2)}" o.c.` : null,
              c.pitch > 0 ? `${num(c.pitch, 2)}/12${c.type === "HIP_VALLEY" && c.pitch2 != null && c.pitch2 !== c.pitch ? ` & ${num(c.pitch2, 2)}/12` : ""} pitch` : null,
              metricLabel(c.metric),
            ].filter(Boolean);
            return (
              <div key={c.id} id={`condition-${c.id}`} className="scroll-mt-24 border-b border-slate-100 last:border-b-0">
                {edit === c.id ? (
                  <div className="bg-blue-50/40 px-4 py-3">
                    {boxHead(
                      `Edit ${c.name}`,
                      `${base}#condition-${c.id}`,
                      <ConfirmForm action={deleteTemplateCondition} hidden={{ ...hidden, id: c.id }} message={`Remove "${c.name}" from this template?`} variant="ghost">
                        <span className="text-xs text-rose-600">Remove takeoff…</span>
                      </ConfirmForm>,
                    )}
                    <ConditionForm
                      action={updateTemplateCondition}
                      hidden={hidden}
                      costCodes={costCodes}
                      codeRules={codeRules}
                      memberSizes={memberSizes}
                      spanTables={spanTables}
                      itemOptions={items}
                      values={c}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-50/70 px-4 py-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                    <span className="text-sm font-medium text-slate-900">{c.name}</span>
                    <span className="text-xs text-slate-500">{facts.join(" · ")}</span>
                    <Link href={`${base}?edit=${c.id}#condition-${c.id}`} scroll={false} className={`${link} ml-auto`} aria-label={`Edit ${c.name}`}>
                      Edit
                    </Link>
                  </div>
                )}
                <div className="px-4 py-2 pl-8">
                  {c.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="text-xs text-slate-500">
                          <tr>
                            <th className="py-1 pr-3 text-left font-normal">Item</th>
                            <th className="py-1 pr-3 text-left font-normal">Formula</th>
                            <th className="py-1 pr-3 text-right font-normal">Price</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((item) =>
                            editItem === item.id ? (
                              <tr key={item.id} className="border-t border-slate-100">
                                <td colSpan={4} className="bg-blue-50/40 px-3 py-3">
                                  {boxHead(
                                    `Edit ${item.description}`,
                                    `${base}#condition-${c.id}`,
                                    <ConfirmForm action={deleteTemplateItem} hidden={{ ...hidden, id: item.id }} message={`Remove "${item.description}"?`} variant="ghost">
                                      <span className="text-xs text-rose-600">Remove item…</span>
                                    </ConfirmForm>,
                                  )}
                                  <AssemblyForm action={updateTemplateItem} hidden={hidden} condition={c} costCodes={costCodes} items={items} values={item} />
                                </td>
                              </tr>
                            ) : (
                              <tr key={item.id} className="border-t border-slate-100 align-top">
                                <td className="py-1.5 pr-3 text-slate-900">
                                  {item.description}
                                  {item.costCode ? <span className="block text-xs text-slate-500">{costCodeLabel(item.costCode)}</span> : null}
                                </td>
                                <td className="py-1.5 pr-3 text-xs text-slate-600">
                                  {num(item.qty, 4)} {item.unit} per {num(item.per, 4)} {metricUnit(item.metric)} of{" "}
                                  {metricLabel(item.metric)
                                    .replace(/ \(.*\)$/, "")
                                    .toLowerCase()}
                                  {item.wastePct > 0 ? ` + ${num(item.wastePct, 1)}%` : ""}
                                  {item.roundUp ? " · round up" : ""}
                                </td>
                                <td className="whitespace-nowrap py-1.5 pr-3 text-right text-xs text-slate-600">
                                  {item.materialItem ? `Item List ${money(item.materialItem.unitCost)}/${item.materialItem.unit}` : `${money(item.unitCost)}/${item.unit}`}
                                </td>
                                <td className="py-1.5 text-right">
                                  <Link href={`${base}?editItem=${item.id}#condition-${c.id}`} scroll={false} className={link} aria-label={`Edit ${item.description}`}>
                                    Edit
                                  </Link>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {addItem === c.id ? (
                    <div className="mt-1 rounded-lg bg-blue-50/40 px-3 py-3">
                      {boxHead(isMemberType(c.type) ? "Add an add-on item" : "Add an item", `${base}#condition-${c.id}`)}
                      <AssemblyForm action={createTemplateItem} hidden={hidden} condition={c} costCodes={costCodes} items={items} />
                    </div>
                  ) : (
                    <p className="py-1 text-xs text-slate-500">
                      {c.items.length === 0 ? "No items yet · " : null}
                      <Link href={`${base}?addItem=${c.id}#condition-${c.id}`} scroll={false} className={link}>
                        {isMemberType(c.type) ? "+ Add an add-on item (hangers, ties, blocking, sheathing…)" : "+ Add an item"}
                      </Link>
                      {isMemberType(c.type) ? <span className="ml-2">Lumber lines are added on each job from its layout.</span> : null}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
