import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { money, pct } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import { Card, CardBody, CardHeader, Collapsible, Field, FormGrid, Stat, SubmitButton, buttonClasses } from "@/components/ui";
import { LineItemsEditor } from "../../../projects/[id]/_components/line-items";
import {
  convertTemplateItemToAllowance,
  createTemplateAllowance,
  createTemplateItem,
  deleteTemplateAllowance,
  deleteTemplateItem,
  updateTemplateAllowance,
  updateTemplateDetails,
  updateTemplateItem,
} from "../actions";

export default async function EstimateTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ edit?: string; editAllowance?: string; addTo?: string }>;
}) {
  await requireAdmin();
  const { templateId } = await params;
  const { edit, editAllowance, addTo } = await searchParams;
  const [template, costCodes] = await Promise.all([
    db.estimateTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: { include: { costCode: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        allowances: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    }),
    activeCostCodes(),
  ]);
  if (!template) notFound();

  const totals = lineTotals(template.items);
  const allowanceTotal = lineTotals(template.items.filter((i) => i.isAllowance)).price;
  const base = `/settings/estimate-templates/${template.id}`;

  return (
    <div className="space-y-6">
      <Link href="/settings/estimate-templates" className={buttonClasses("secondary", "sm")}>
        <ArrowLeft className="h-3.5 w-3.5" /> All templates
      </Link>

      <Card>
        <CardHeader
          title={
            <form action={updateTemplateDetails} className="flex flex-wrap items-center gap-1.5">
              <input type="hidden" name="templateId" value={template.id} />
              <input name="name" defaultValue={template.name} aria-label="Template name" className="input !w-72 !py-1 text-base font-semibold" />
              <SubmitButton variant="ghost" size="sm">
                Rename
              </SubmitButton>
            </form>
          }
          description={`Estimate template · default markup ${pct(template.defaultMarkup, 1)} · copied into a job when picked — later edits here don't change existing jobs.`}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Cost" value={money(totals.cost)} />
            <Stat label="Markup" value={money(totals.markup)} />
            <Stat label="Price" value={money(totals.price)} tone="good" hint="Excludes optional items" />
            <Stat label="Allowances" value={money(allowanceTotal)} hint="Included in price" />
          </div>
        </CardBody>
      </Card>

      <LineItemsEditor
        items={template.items}
        costCodes={costCodes}
        editable
        editingId={edit ?? null}
        baseHref={base}
        hidden={{ templateId: template.id }}
        actions={{ create: createTemplateItem, update: updateTemplateItem, remove: deleteTemplateItem }}
        withGroups
        withFlags
        defaultMarkup={template.defaultMarkup}
        allowances={template.allowances.map((a) => ({ ...a, selection: null }))}
        allowanceActions={{ create: createTemplateAllowance, update: updateTemplateAllowance, remove: deleteTemplateAllowance, convert: convertTemplateItemToAllowance }}
        editingAllowanceId={editAllowance ?? null}
        addToAllowanceId={addTo ?? null}
      />

      <Collapsible summary="Description, proposal notes, terms & default markup">
        <form action={updateTemplateDetails} className="space-y-4">
          <input type="hidden" name="templateId" value={template.id} />
          <FormGrid>
            <Field label="Description (internal)" htmlFor="tpl-description" className="md:col-span-2">
              <input id="tpl-description" name="description" className="input" defaultValue={template.description ?? ""} />
            </Field>
            <Field label="Notes (copied to the estimate, shown on proposal)" htmlFor="tpl-notes" className="md:col-span-2">
              <textarea id="tpl-notes" name="notes" rows={3} className="input" defaultValue={template.notes ?? ""} />
            </Field>
            <Field label="Terms (copied to the estimate, shown on proposal)" htmlFor="tpl-terms" className="md:col-span-2">
              <textarea id="tpl-terms" name="terms" rows={3} className="input" defaultValue={template.terms ?? ""} />
            </Field>
            <Field label="Default markup %" htmlFor="tpl-markup" hint="Pre-filled on new line items.">
              <input id="tpl-markup" name="defaultMarkup" type="number" step="0.1" min="0" className="input" defaultValue={template.defaultMarkup} />
            </Field>
          </FormGrid>
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
