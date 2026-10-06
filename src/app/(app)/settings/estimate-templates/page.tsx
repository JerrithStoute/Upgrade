import Link from "next/link";
import { Copy, FileStack, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, money } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import { Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, Table, TBody, THead, Td, Th, Tr } from "@/components/ui";
import { createTemplate, deleteTemplate, duplicateTemplate } from "./actions";

export const metadata = { title: "Estimate templates" };

export default async function EstimateTemplatesPage() {
  await requireAdmin();
  const templates = await db.estimateTemplate.findMany({
    orderBy: { name: "asc" },
    include: { items: true, _count: { select: { specs: { where: { isAllowance: true } } } } },
  });

  return (
    <div className="space-y-6">
      <Collapsible
        summary={
          <span className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4 text-slate-500" /> New template
          </span>
        }
        defaultOpen={templates.length === 0}
      >
        <form action={createTemplate} className="space-y-4">
          <p className="text-sm text-slate-600">
            A template is a blank estimate with all your usual line items, allowances, notes and terms. Pick it when you create a new project, or add it to a draft estimate. You
            can also turn any job&apos;s estimate into a template with <em>Save as template</em> on the estimate page.
          </p>
          <FormGrid>
            <Field label="Template name" htmlFor="tpl-name">
              <input id="tpl-name" name="name" className="input" placeholder="Kitchen Remodel" required />
            </Field>
            <Field label="Description (internal)" htmlFor="tpl-description">
              <input id="tpl-description" name="description" className="input" placeholder="Standard mid-range kitchen, ~200 sf" />
            </Field>
          </FormGrid>
          <SubmitButton size="sm">Create template</SubmitButton>
        </form>
      </Collapsible>

      {templates.length === 0 ? (
        <EmptyState icon={FileStack} title="No estimate templates yet" description="Create one above, or save an existing estimate as a template." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Template</Th>
              <Th right>Lines</Th>
              <Th right>Allowances</Th>
              <Th right>Total price</Th>
              <Th>Updated</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </THead>
          <TBody>
            {templates.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <Link href={`/settings/estimate-templates/${t.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                    {t.name}
                  </Link>
                  {t.description ? <span className="block text-xs text-slate-500">{t.description}</span> : null}
                </Td>
                <Td right>{t.items.length}</Td>
                <Td right>{t._count.specs}</Td>
                <Td right>{money(lineTotals(t.items).price)}</Td>
                <Td className="whitespace-nowrap">{fmtDate(t.updatedAt)}</Td>
                <Td>
                  <span className="flex items-center justify-end gap-1">
                    <Link href={`/settings/estimate-templates/${t.id}`} className="rounded-md px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
                      Edit
                    </Link>
                    <form action={duplicateTemplate}>
                      <input type="hidden" name="templateId" value={t.id} />
                      <SubmitButton size="sm" variant="ghost">
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </SubmitButton>
                    </form>
                    <ConfirmForm
                      action={deleteTemplate}
                      hidden={{ templateId: t.id }}
                      message={`Delete template "${t.name}"? Estimates already created from it are not affected.`}
                      variant="ghost"
                    >
                      <span className="text-rose-700">Delete</span>
                    </ConfirmForm>
                  </span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
