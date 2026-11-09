import Link from "@/components/link";
import { notFound } from "next/navigation";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { loadTemplateSheet } from "@/lib/estimate-lines";
import { divisionCategories, loadEstimateCategories } from "@/lib/estimate-categories";
import { codeDivisions } from "@/lib/cost-code-divisions";
import { loadParameters, templateValues } from "@/lib/estimate-parameters";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { EstimateSheet } from "@/components/estimate/estimate-sheet";
import { deleteTemplate, duplicateTemplate, saveTemplate, saveTemplateValues, updateTemplateDetails } from "../actions";
import { saveMarkupDefault } from "@/app/(app)/projects/[id]/estimate/actions";
import { parseMarkupTable } from "@/lib/markup";

const link = "text-xs font-medium text-blue-700 hover:underline";

export default async function EstimateTemplatePage({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireView("lists");
  const { templateId } = await params;
  const { edit } = await searchParams;
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

  const base = `/catalog/estimate-templates/${template.id}`;
  const small = "!h-7 !px-2.5 !text-xs";

  return (
    <div className="space-y-3">
      {edit === "name" ? (
        <form action={updateTemplateDetails} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-blue-50/40 px-4 py-2.5">
          <input type="hidden" name="templateId" value={template.id} />
          <input name="name" required autoFocus aria-label="Template name" className="input !h-7 !w-56 !py-0 text-xs" defaultValue={template.name} />
          <input
            name="description"
            aria-label="Description (internal)"
            className="input !h-7 !w-auto min-w-0 flex-1 !py-0 text-xs"
            defaultValue={template.description ?? ""}
            placeholder="What it's for (only your team sees it)"
          />
          <SubmitButton size="sm" className={small}>
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
            <Link href={`${base}?edit=name`} scroll={false} className={link}>
              Edit
            </Link>
          </div>
          <span className="flex items-center gap-3">
            <form action={duplicateTemplate}>
              <input type="hidden" name="templateId" value={template.id} />
              <button type="submit" className={link}>
                Duplicate
              </button>
            </form>
            <ConfirmForm
              action={deleteTemplate}
              hidden={{ templateId: template.id }}
              message={`Delete template "${template.name}"? Estimates already created from it are not affected.`}
              variant="ghost"
            >
              <span className="text-xs text-rose-600">Delete template…</span>
            </ConfirmForm>
          </span>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">Copied into each new estimate</span>
          {edit === "details" ? (
            <Link href={base} scroll={false} className={link}>
              Cancel
            </Link>
          ) : (
            <Link href={`${base}?edit=details`} scroll={false} className={link}>
              Edit
            </Link>
          )}
        </header>
        {edit === "details" ? (
          <form action={updateTemplateDetails} className="space-y-2 bg-blue-50/40 px-4 py-3">
            <input type="hidden" name="templateId" value={template.id} />
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <span className="w-28 shrink-0 pt-1.5">Introduction</span>
              <textarea name="notes" rows={2} className="input min-w-0 flex-1 text-xs" defaultValue={template.notes ?? ""} />
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <span className="w-28 shrink-0 pt-1.5">Terms</span>
              <textarea name="terms" rows={2} className="input min-w-0 flex-1 text-xs" defaultValue={template.terms ?? ""} />
            </label>
            <p className="pl-[7.5rem] text-xs text-slate-500">The proposal&apos;s opening paragraph and terms for jobs started from this template. Leave one empty to use your standard one (Settings → Proposals).</p>
            <SubmitButton size="sm" className={small}>
              Save
            </SubmitButton>
          </form>
        ) : (
          <dl className="px-4 py-2 text-sm">
            {(
              [
                ["Introduction", template.notes],
                ["Terms", template.terms],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-2 py-1">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="whitespace-pre-line text-slate-900">{value || <span className="text-xs text-slate-400">None yet</span>}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Copied into a job when the template is picked; later changes here don&apos;t change jobs already made.</p>
      </section>

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
    </div>
  );
}
