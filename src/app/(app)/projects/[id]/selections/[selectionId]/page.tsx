import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Plus, Star, Pencil, RotateCcw, Package, Wrench, ThumbsUp } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { money, fmtDate, cn, costCodeLabel } from "@/lib/utils";
import { Card, CardHeader, CardBody, Badge, Button, ButtonLink, SubmitButton, ConfirmForm, Collapsible, Field, FormGrid } from "@/components/ui";
import { SelectionFields } from "../_components/selection-fields";
import { chosenOption, isSelectionOverdue } from "../_helpers";
import { updateSelection, deleteSelection, addOption, updateOption, deleteOption, chooseOption, setSelectionStatus } from "../actions";

function OptionFields({
  values,
  prefix,
}: {
  values: { name?: string; vendor?: string | null; modelNumber?: string | null; price?: number; description?: string | null; imageUrl?: string | null; isRecommended?: boolean };
  prefix: string;
}) {
  return (
    <FormGrid className="md:grid-cols-3">
      <Field label="Name" htmlFor={`${prefix}-name`}>
        <input id={`${prefix}-name`} name="name" className="input" required defaultValue={values.name ?? ""} />
      </Field>
      <Field label="Vendor" htmlFor={`${prefix}-vendor`}>
        <input id={`${prefix}-vendor`} name="vendor" className="input" defaultValue={values.vendor ?? ""} />
      </Field>
      <Field label="Model #" htmlFor={`${prefix}-model`}>
        <input id={`${prefix}-model`} name="modelNumber" className="input" defaultValue={values.modelNumber ?? ""} />
      </Field>
      <Field label="Price" htmlFor={`${prefix}-price`}>
        <input id={`${prefix}-price`} name="price" type="number" step="0.01" min={0} className="input" defaultValue={values.price ?? 0} />
      </Field>
      <Field label="Image URL" htmlFor={`${prefix}-image`} className="md:col-span-2">
        <input id={`${prefix}-image`} name="imageUrl" type="url" className="input" defaultValue={values.imageUrl ?? ""} placeholder="https://…" />
      </Field>
      <Field label="Description" htmlFor={`${prefix}-desc`} className="md:col-span-3">
        <textarea id={`${prefix}-desc`} name="description" className="input" rows={2} defaultValue={values.description ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-3">
        <input type="checkbox" name="isRecommended" defaultChecked={values.isRecommended ?? false} className="h-4 w-4 rounded border-slate-300" />
        Recommended option
      </label>
    </FormGrid>
  );
}

export default async function SelectionDetailPage({ params, searchParams }: { params: Promise<{ id: string; selectionId: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireStaff();
  const { id, selectionId } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);
  const sel = await db.selection.findFirst({
    where: { id: selectionId, projectId: project.id },
    include: { options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, costCode: true },
  });
  if (!sel) notFound();
  const [costCodes, existing] = await Promise.all([
    activeCostCodes(),
    db.selection.findMany({ where: { projectId: project.id }, select: { category: true }, distinct: ["category"] }),
  ]);
  const categories = existing.map((e) => e.category).sort();
  const base = `/projects/${project.id}/selections`;
  const here = `${base}/${sel.id}`;
  const chosen = chosenOption(sel);
  const overdue = isSelectionOverdue(sel);
  const hidden = { projectId: project.id, id: sel.id };

  const statusAction = (status: string, label: string, Icon: typeof Check, variant: "primary" | "secondary" | "success" = "secondary") => (
    <form action={setSelectionStatus} key={status}>
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="id" value={sel.id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> All selections
      </Link>

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {sel.title} <Badge status={sel.status} />
            </span>
          }
          description={
            <span>
              {sel.category}
              {sel.location ? ` · ${sel.location}` : ""}
              {sel.costCode ? ` · ${costCodeLabel(sel.costCode, " ")}` : ""}
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {sel.status === "CHOSEN" ? statusAction("APPROVED", "Approve", ThumbsUp, "success") : null}
              {sel.status === "APPROVED" ? statusAction("ORDERED", "Mark ordered", Package, "primary") : null}
              {sel.status === "ORDERED" ? statusAction("INSTALLED", "Mark installed", Wrench, "primary") : null}
              {sel.status !== "PENDING" ? statusAction("PENDING", "Reset to pending", RotateCcw) : null}
            </div>
          }
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Allowance</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{money(sel.allowance)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Chosen</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{chosen ? money(chosen.price) : "—"}</dd>
              {chosen ? <p className="text-xs text-slate-500">{chosen.name}</p> : null}
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Variance</dt>
              <dd className={cn("mt-0.5 text-lg font-semibold tabular-nums", !chosen ? "text-slate-400" : chosen.price - sel.allowance > 0 ? "text-rose-600" : "text-emerald-700")}>
                {chosen ? `${chosen.price - sel.allowance > 0 ? "+" : ""}${money(chosen.price - sel.allowance)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Due</dt>
              <dd className={cn("mt-0.5 text-lg font-semibold", overdue ? "text-rose-600" : "text-slate-900")}>{fmtDate(sel.dueDate)}</dd>
              {overdue ? <p className="text-xs text-rose-600">Overdue</p> : sel.chosenAt ? <p className="text-xs text-slate-500">Chosen {fmtDate(sel.chosenAt)}</p> : null}
            </div>
          </dl>
          {sel.description ? <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{sel.description}</p> : null}
          {sel.notes ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
              <span className="font-semibold">Internal notes:</span> {sel.notes}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Options <span className="ml-1 text-sm font-normal text-slate-500">{sel.options.length}</span>
        </h2>
        {sel.options.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
            No options yet — add the products the client can choose from below.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sel.options.map((o) => {
              const isChosen = o.id === sel.chosenOptionId;
              const v = o.price - sel.allowance;
              if (edit === o.id) {
                return (
                  <Card key={o.id} className="border-blue-200 md:col-span-2 xl:col-span-3">
                    <CardHeader title={`Edit option — ${o.name}`} />
                    <CardBody>
                      <form action={updateOption} className="space-y-4">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="selectionId" value={sel.id} />
                        <input type="hidden" name="id" value={o.id} />
                        <OptionFields values={o} prefix={`opt-${o.id}`} />
                        <div className="flex items-center gap-2">
                          <SubmitButton>Save option</SubmitButton>
                          <ButtonLink href={here} variant="secondary">
                            Cancel
                          </ButtonLink>
                        </div>
                      </form>
                    </CardBody>
                  </Card>
                );
              }
              return (
                <Card key={o.id} className={cn("flex flex-col overflow-hidden", isChosen && "ring-2 ring-emerald-500")}>
                  {o.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.imageUrl} alt={o.name} className="h-40 w-full object-cover" />
                  ) : null}
                  <CardBody className="flex flex-1 flex-col gap-2">
                    {isChosen || o.isRecommended ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isChosen ? (
                          <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">
                            <Check className="mr-1 h-3 w-3" /> Chosen
                          </Badge>
                        ) : null}
                        {o.isRecommended ? (
                          <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
                            <Star className="mr-1 h-3 w-3" /> Recommended
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-snug text-slate-900">{o.name}</h3>
                      <p className="text-xs text-slate-500">{[o.vendor, o.modelNumber ? `#${o.modelNumber}` : null].filter(Boolean).join(" · ") || "\u00a0"}</p>
                    </div>
                    {o.description ? <p className="text-sm text-slate-600">{o.description}</p> : null}
                    <div className="mt-auto flex items-baseline justify-between pt-2">
                      <span className="text-lg font-semibold tabular-nums text-slate-900">{money(o.price)}</span>
                      <span className={cn("text-xs font-medium tabular-nums", v > 0 ? "text-rose-600" : v < 0 ? "text-emerald-700" : "text-slate-500")}>
                        {v === 0 ? "at allowance" : `${v > 0 ? "+" : ""}${money(v)} ${v > 0 ? "over" : "under"}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                      {!isChosen ? (
                        <form action={chooseOption}>
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="selectionId" value={sel.id} />
                          <input type="hidden" name="id" value={o.id} />
                          <Button type="submit" size="sm" variant="success">
                            <Check className="h-3.5 w-3.5" /> Choose
                          </Button>
                        </form>
                      ) : null}
                      <ButtonLink href={`${here}?edit=${o.id}`} size="sm" variant="secondary">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </ButtonLink>
                      <div className="ml-auto">
                        <ConfirmForm action={deleteOption} hidden={{ projectId: project.id, selectionId: sel.id, id: o.id }} message={`Delete option "${o.name}"?`} variant="ghost">
                          Delete
                        </ConfirmForm>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Collapsible
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add option
          </span>
        }
      >
        <form action={addOption} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="selectionId" value={sel.id} />
          <OptionFields values={{}} prefix="new-opt" />
          <SubmitButton>Add option</SubmitButton>
        </form>
      </Collapsible>

      <Collapsible
        summary={
          <span className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit selection
          </span>
        }
      >
        <form action={updateSelection} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="id" value={sel.id} />
          <SelectionFields values={sel} categories={categories} costCodes={costCodes} />
          <SubmitButton>Save selection</SubmitButton>
        </form>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">Deleting removes the selection and all of its options.</p>
          <ConfirmForm action={deleteSelection} hidden={hidden} message={`Delete selection "${sel.title}" and all of its options?`}>
            Delete selection
          </ConfirmForm>
        </div>
      </Collapsible>
    </div>
  );
}
