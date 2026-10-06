import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { loadTemplateSheet } from "@/lib/estimate-lines";
import { divisionCategories, loadEstimateCategories } from "@/lib/estimate-categories";
import { codeDivisions } from "@/lib/cost-code-divisions";
import { loadParameters, templateValues } from "@/lib/estimate-parameters";
import { pct } from "@/lib/utils";
import { Card, CardHeader, Collapsible, Field, FormGrid, SubmitButton, buttonClasses } from "@/components/ui";
import { EstimateSheet } from "@/components/estimate/estimate-sheet";
import { saveTemplate, saveTemplateValues, updateTemplateDetails } from "../actions";
import { saveMarkupDefault } from "@/app/(app)/projects/[id]/estimate/actions";
import { parseMarkupTable } from "@/lib/markup";

export default async function EstimateTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  await requireAdmin();
  const { templateId } = await params;
  const template = await db.estimateTemplate.findUnique({ where: { id: templateId } });
  if (!template) notFound();
  const [sheet, costCodes, filing, divisionList, parameters, company] = await Promise.all([
    loadTemplateSheet(template.id),
    activeCostCodes(),
    divisionCategories(),
    loadEstimateCategories(),
    loadParameters(),
    db.company.findFirst({ select: { markupTable: true } }),
  ]);

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
          description={`Estimate template · new lines start at ${pct(template.defaultMarkup, 1)} profit · copied into a job when picked — later edits here don't change existing jobs.`}
        />
      </Card>

      <EstimateSheet
        key={template.updatedAt.getTime()}
        viewKey={`template:${template.id}`}
        initial={sheet}
        costCodes={costCodes}
        defaultMarkup={template.defaultMarkup}
        save={saveTemplate.bind(null, template.id)}
        filing={filing}
        parameters={parameters}
        canEditParameters
        values={templateValues(template.paramValues)}
        saveValues={saveTemplateValues.bind(null, template.id)}
        valuesOwner="template"
        markupTable={parseMarkupTable(template.markupTable ?? company?.markupTable, template.defaultMarkup)}
        saveMarkupDefault={saveMarkupDefault}
        divisionsSetup={{
          initial: divisionList.map((d) => ({ name: d.name, divisions: d.divisions.map((x) => x.division) })),
          categories: codeDivisions(costCodes).map(([name, list]) => ({ name, codes: list.length })),
        }}
      />

      <Collapsible summary="Description, proposal notes, terms & starting profit %">
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
            <Field label="Starting profit %" htmlFor="tpl-markup" hint="What new lines start with.">
              <input id="tpl-markup" name="defaultMarkup" type="number" step="0.1" min="0" className="input" defaultValue={template.defaultMarkup} />
            </Field>
          </FormGrid>
          <SubmitButton size="sm">Save</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}
