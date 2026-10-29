import { Plus, Hash, FileUp, CheckCircle2, ListChecks } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { costCodeLabel } from "@/lib/utils";
import { Card, CardHeader, Collapsible, EmptyState, Field, FormGrid, SubmitButton } from "@/components/ui";
import { createCostCode, replaceCostCodesFromCsv, addStarterCostCodes } from "./actions";
import { STARTER_COST_CODES } from "@/lib/starter-cost-codes";
import { CostCodeCsvImport } from "./_components/csv-import";
import { CostCodeTable } from "./_components/cost-code-table";
import { RECHECK_UNITS } from "@/lib/price-recheck";

/** "Recheck prices every [3] [weeks]" — blank = this code's prices never go stale. */
function RecheckInputs({ every, unit, form, id }: { every?: number | null; unit?: string | null; form?: string; id?: string }) {
  return (
    <span className="flex items-center gap-1">
      <input
        id={id}
        name="priceRecheckEvery"
        type="number"
        min="1"
        defaultValue={every ?? ""}
        className="input !w-16"
        form={form}
        aria-label="Recheck prices every"
        placeholder="—"
      />
      <select name="priceRecheckUnit" defaultValue={unit ?? "weeks"} className="input !w-24" form={form} aria-label="Days, weeks or months">
        {RECHECK_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </span>
  );
}

export const metadata = { title: "Cost codes" };

export default async function CostCodesSettingsPage({ searchParams }: { searchParams: Promise<{ imported?: string; starter?: string }> }) {
  await requireView("lists");
  const { imported, starter } = await searchParams;

  const codes = await db.costCode.findMany({
    // Sort order first so groups appear in the order they were entered / imported.
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { name: "asc" }],
    include: { _count: { select: { estimateItems: true, templateItems: true, changeOrderItems: true, expenses: true, selections: true } } },
  });
  const divisions = [...new Set(codes.map((c) => c.division))];
  const existingForImport = codes.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    division: c.division,
    refs: Object.values(c._count).reduce((a, b) => a + b, 0),
  }));
  const groups = divisions.map((d) => ({ division: d, codes: codes.filter((c) => c.division === d) }));
  // The NAHB-style starter codes you don't have yet (matched by code number), by group.
  const haveCodes = new Set(codes.map((c) => c.code).filter(Boolean));
  const missing = STARTER_COST_CODES.filter((c) => !haveCodes.has(c.code));
  const missingGroups = [...new Set(missing.map((c) => c.division))].map((d) => ({ division: d, codes: missing.filter((c) => c.division === d) }));

  return (
    <div className="space-y-6">
      {imported ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Cost codes replaced from your CSV file.
        </p>
      ) : null}

      {starter ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Added {starter} cost code{starter === "1" ? "" : "s"} from the starter list — rename or switch off any you don&apos;t use.
        </p>
      ) : null}

      {missing.length ? (
        <Collapsible
          defaultOpen={codes.length === 0}
          summary={
            <span className="inline-flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-slate-500" />
              {codes.length ? `NAHB-style starter list — ${missing.length} code${missing.length === 1 ? "" : "s"} you don't have yet` : "Start with the NAHB-style cost codes"}
            </span>
          }
        >
          <form action={addStarterCostCodes} className="space-y-4">
            <p className="text-sm text-slate-600">
              Laid out the way NAHB&apos;s chart of accounts groups construction costs — 1000 Preparation, 2000 Excavation &amp; Foundation, 3000 Rough Structure, 4000 Full
              Enclosure, 5000 Finishing Trades, 6000 Completion &amp; Inspection. Common residential codes to start from (not NAHB&apos;s own list): rename, add to or switch off
              any of them. Codes you already have, by number, are left alone.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {missingGroups.map((g) => (
                <fieldset key={g.division} className="space-y-1">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.division}</legend>
                  {g.codes.map((c) => (
                    <label key={c.code} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" name="code" value={c.code} defaultChecked={codes.length === 0} className="h-4 w-4 rounded border-slate-300" />
                      <span className="font-mono text-xs text-slate-500">{c.code}</span> {c.name}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton>Add the ticked codes</SubmitButton>
              <SubmitButton variant="secondary" name="all" value="1">
                Add all {missing.length}
              </SubmitButton>
            </div>
          </form>
        </Collapsible>
      ) : null}

      <Collapsible
        summary={
          <span className="inline-flex items-center gap-2">
            <FileUp className="h-4 w-4 text-slate-500" /> Import from CSV (replaces all cost codes)
          </span>
        }
      >
        <CostCodeCsvImport existing={existingForImport} action={replaceCostCodesFromCsv} />
      </Collapsible>

      <Collapsible
        summary={
          <span className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4 text-slate-500" /> Add cost code
          </span>
        }
      >
        <form action={createCostCode} className="space-y-4">
          <FormGrid className="md:grid-cols-4">
            <Field label="Code (optional)" htmlFor="new-code" hint='e.g. "06-100"'>
              <input id="new-code" name="code" className="input font-mono" />
            </Field>
            <Field label="Name" htmlFor="new-name">
              <input id="new-name" name="name" className="input" required />
            </Field>
            <Field label="Group" htmlFor="new-division" hint="Pick an existing group or type a new one.">
              <input id="new-division" name="division" className="input" list="division-options" required />
              <datalist id="division-options">
                {divisions.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            <Field label="Sort order" htmlFor="new-sort">
              <input id="new-sort" name="sortOrder" type="number" className="input" defaultValue={(codes.length + 1) * 10} />
            </Field>
            <Field label="Recheck prices every" htmlFor="new-recheck" hint="Blank = never. Lumber 3 weeks, windows 6 months…">
              <RecheckInputs id="new-recheck" />
            </Field>
          </FormGrid>
          <SubmitButton>Add cost code</SubmitButton>
        </form>
      </Collapsible>

      {codes.length === 0 ? (
        <EmptyState icon={Hash} title="No cost codes" description="Add cost codes to organize estimates, change orders and expenses." />
      ) : (
        <Card>
          <CardHeader title="Cost code library" description={`${codes.filter((c) => c.active).length} active · ${codes.length} total across ${divisions.length} groups`} />
          <CostCodeTable
            divisions={divisions}
            groups={groups.map((g) => ({
              division: g.division,
              codes: g.codes.map((c) => ({
                id: c.id,
                code: c.code,
                name: c.name,
                division: c.division,
                sortOrder: c.sortOrder,
                active: c.active,
                priceRecheckEvery: c.priceRecheckEvery,
                priceRecheckUnit: c.priceRecheckUnit,
                refs: Object.values(c._count).reduce((a, b) => a + b, 0),
                refsTitle: `${c._count.estimateItems} estimate items · ${c._count.templateItems} template items · ${c._count.changeOrderItems} change order items · ${c._count.expenses} expenses · ${c._count.selections} selections`,
                label: costCodeLabel(c, " "),
              })),
            }))}
          />
        </Card>
      )}
    </div>
  );
}
