import { Pencil, Plus, X, Hash, FileUp, CheckCircle2, ListChecks } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, costCodeLabel } from "@/lib/utils";
import { Button, ButtonLink, Card, CardHeader, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { createCostCode, updateCostCode, toggleCostCodeActive, deleteCostCode, replaceCostCodesFromCsv, addStarterCostCodes } from "./actions";
import { STARTER_COST_CODES } from "@/lib/starter-cost-codes";
import { CostCodeCsvImport } from "./_components/csv-import";

export const metadata = { title: "Cost codes" };

export default async function CostCodesSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string; imported?: string; starter?: string }> }) {
  await requireAdmin();
  const { edit, imported, starter } = await searchParams;

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
  const EDIT_FORM = "edit-cost-code";
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </FormGrid>
          <SubmitButton>Add cost code</SubmitButton>
        </form>
      </Collapsible>

      {edit ? <form id={EDIT_FORM} action={updateCostCode} /> : null}

      {codes.length === 0 ? (
        <EmptyState icon={Hash} title="No cost codes" description="Add cost codes to organize estimates, change orders and expenses." />
      ) : (
        <Card>
          <CardHeader title="Cost code library" description={`${codes.filter((c) => c.active).length} active · ${codes.length} total across ${divisions.length} groups`} />
          <Table className="rounded-t-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Group</Th>
                <Th right>Sort</Th>
                <Th right>In use</Th>
                <Th>Active</Th>
                <Th right>Actions</Th>
              </tr>
            </THead>
            <TBody>
              {groups.map((g) => (
                <GroupRows key={g.division} division={g.division} codes={g.codes} edit={edit} formId={EDIT_FORM} />
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

type CodeRow = {
  id: string;
  code: string | null;
  name: string;
  division: string;
  sortOrder: number;
  active: boolean;
  _count: { estimateItems: number; templateItems: number; changeOrderItems: number; expenses: number; selections: number };
};

function GroupRows({ division, codes, edit, formId }: { division: string; codes: CodeRow[]; edit?: string; formId: string }) {
  return (
    <>
      <tr className="bg-slate-50/80">
        <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {division}
        </td>
      </tr>
      {codes.map((c) => {
        const refs = c._count.estimateItems + c._count.templateItems + c._count.changeOrderItems + c._count.expenses + c._count.selections;
        if (edit === c.id) {
          return (
            <Tr key={c.id} className="bg-blue-50/40">
              <Td>
                <input type="hidden" name="id" value={c.id} form={formId} />
                <input name="code" defaultValue={c.code ?? ""} className="input font-mono" form={formId} aria-label="Code" />
              </Td>
              <Td>
                <input name="name" defaultValue={c.name} className="input" required form={formId} aria-label="Name" />
              </Td>
              <Td>
                <input name="division" defaultValue={c.division} className="input" list="division-options" required form={formId} aria-label="Group" />
              </Td>
              <Td right>
                <input name="sortOrder" type="number" defaultValue={c.sortOrder} className="input !w-20" form={formId} aria-label="Sort order" />
              </Td>
              <Td right>{refs}</Td>
              <Td>{c.active ? "Yes" : "No"}</Td>
              <Td right>
                <div className="flex justify-end gap-1.5">
                  <Button type="submit" size="sm" form={formId}>
                    Save
                  </Button>
                  <ButtonLink href="/settings/cost-codes" variant="ghost" size="sm">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </ButtonLink>
                </div>
              </Td>
            </Tr>
          );
        }
        return (
          <Tr key={c.id} className={cn(!c.active && "text-slate-400")}>
            <Td className="font-mono text-slate-900">{c.code ?? <span className="text-slate-300">—</span>}</Td>
            <Td className={cn("font-medium", c.active ? "text-slate-900" : "text-slate-400")}>{c.name}</Td>
            <Td>{c.division}</Td>
            <Td right>{c.sortOrder}</Td>
            <Td right>
              <span
                title={`${c._count.estimateItems} estimate items · ${c._count.templateItems} template items · ${c._count.changeOrderItems} change order items · ${c._count.expenses} expenses · ${c._count.selections} selections`}
              >
                {refs || "—"}
              </span>
            </Td>
            <Td>
              <form action={toggleCostCodeActive}>
                <input type="hidden" name="id" value={c.id} />
                <button
                  type="submit"
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    c.active ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200",
                  )}
                  title={c.active ? "Click to deactivate" : "Click to activate"}
                >
                  {c.active ? "Active" : "Inactive"}
                </button>
              </form>
            </Td>
            <Td right>
              <div className="flex justify-end gap-1.5">
                <ButtonLink href={`/settings/cost-codes?edit=${c.id}`} variant="secondary" size="sm">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </ButtonLink>
                <ConfirmForm
                  action={deleteCostCode}
                  hidden={{ id: c.id }}
                  message={
                    refs > 0
                      ? `${costCodeLabel(c, " ")} is referenced by ${refs} record${refs === 1 ? "" : "s"} and cannot be deleted. Deactivate it instead?`
                      : `Delete cost code ${costCodeLabel(c, " ")}?`
                  }
                >
                  {refs > 0 ? "Deactivate" : "Delete"}
                </ConfirmForm>
              </div>
            </Td>
          </Tr>
        );
      })}
    </>
  );
}
