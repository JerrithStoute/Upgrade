import { Pencil, Plus, X, Hash } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Collapsible,
  ConfirmForm,
  EmptyState,
  Field,
  FormGrid,
  SubmitButton,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
} from "@/components/ui";
import { createCostCode, updateCostCode, toggleCostCodeActive, deleteCostCode } from "./actions";

export const metadata = { title: "Cost codes" };

export default async function CostCodesSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const { edit } = await searchParams;

  const codes = await db.costCode.findMany({
    orderBy: [{ division: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    include: { _count: { select: { estimateItems: true, changeOrderItems: true, expenses: true, selections: true } } },
  });
  const divisions = [...new Set(codes.map((c) => c.division))];
  const groups = divisions.map((d) => ({ division: d, codes: codes.filter((c) => c.division === d) }));
  const EDIT_FORM = "edit-cost-code";

  return (
    <div className="space-y-6">
      <Collapsible
        summary={
          <span className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4 text-slate-500" /> Add cost code
          </span>
        }
      >
        <form action={createCostCode} className="space-y-4">
          <FormGrid className="md:grid-cols-4">
            <Field label="Code" htmlFor="new-code" hint='e.g. "06-100"'>
              <input id="new-code" name="code" className="input font-mono" required />
            </Field>
            <Field label="Name" htmlFor="new-name">
              <input id="new-name" name="name" className="input" required />
            </Field>
            <Field label="Division" htmlFor="new-division" hint="Pick an existing division or type a new one.">
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
          <CardHeader title="Cost code library" description={`${codes.filter((c) => c.active).length} active · ${codes.length} total across ${divisions.length} divisions`} />
          <Table className="rounded-t-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Division</Th>
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
  code: string;
  name: string;
  division: string;
  sortOrder: number;
  active: boolean;
  _count: { estimateItems: number; changeOrderItems: number; expenses: number; selections: number };
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
        const refs = c._count.estimateItems + c._count.changeOrderItems + c._count.expenses + c._count.selections;
        if (edit === c.id) {
          return (
            <Tr key={c.id} className="bg-blue-50/40">
              <Td>
                <input type="hidden" name="id" value={c.id} form={formId} />
                <input name="code" defaultValue={c.code} className="input font-mono" required form={formId} aria-label="Code" />
              </Td>
              <Td>
                <input name="name" defaultValue={c.name} className="input" required form={formId} aria-label="Name" />
              </Td>
              <Td>
                <input name="division" defaultValue={c.division} className="input" list="division-options" required form={formId} aria-label="Division" />
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
            <Td className="font-mono text-slate-900">{c.code}</Td>
            <Td className={cn("font-medium", c.active ? "text-slate-900" : "text-slate-400")}>{c.name}</Td>
            <Td>{c.division}</Td>
            <Td right>{c.sortOrder}</Td>
            <Td right title={`${c._count.estimateItems} estimate items · ${c._count.changeOrderItems} change order items · ${c._count.expenses} expenses · ${c._count.selections} selections`}>
              {refs || "—"}
            </Td>
            <Td>
              <form action={toggleCostCodeActive}>
                <input type="hidden" name="id" value={c.id} />
                <button
                  type="submit"
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    c.active
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200",
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
                      ? `${c.code} is referenced by ${refs} record${refs === 1 ? "" : "s"} and cannot be deleted. Deactivate it instead?`
                      : `Delete cost code ${c.code} ${c.name}?`
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
