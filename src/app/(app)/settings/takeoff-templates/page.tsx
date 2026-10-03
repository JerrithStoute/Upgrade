import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { Collapsible, EmptyState, Field, FormGrid, SubmitButton, TBody, THead, Table, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { createTakeoffTemplate } from "./actions";

export default async function TakeoffTemplatesPage() {
  const templates = await db.takeoffTemplate.findMany({
    orderBy: { name: "asc" },
    include: { conditions: { orderBy: { sortOrder: "asc" }, select: { name: true, color: true } } },
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Sets of takeoff conditions — with their assembly items — that you add to a job from its Takeoff tab instead of building them each time. Build one here, or open a job&apos;s
        Takeoff tab and use <strong>Save as template</strong>. Items from the Item List take that day&apos;s Item List price when a template is added to a job.
      </p>
      <Collapsible
        defaultOpen={templates.length === 0}
        summary={
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New template
          </span>
        }
      >
        <form action={createTakeoffTemplate} className="space-y-4">
          <FormGrid>
            <Field label="Name" htmlFor="tt-name">
              <input id="tt-name" name="name" required className="input" placeholder="Slab Foundation" />
            </Field>
            <Field label="Description" htmlFor="tt-desc">
              <input id="tt-desc" name="description" className="input" placeholder="Monolithic slab with beams, rebar and mesh" />
            </Field>
          </FormGrid>
          <SubmitButton>Create template</SubmitButton>
        </form>
      </Collapsible>

      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No takeoff templates yet" description="Create one above, or save a job's takeoffs as a template from its Takeoff tab." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Template</Th>
              <Th>Takeoffs</Th>
              <Th>Updated</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {templates.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <Link href={`/settings/takeoff-templates/${t.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                    {t.name}
                  </Link>
                  {t.description ? <span className="block text-xs text-slate-500">{t.description}</span> : null}
                </Td>
                <Td className="text-xs text-slate-600">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {t.conditions.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                        {c.name}
                      </span>
                    ))}
                    {t.conditions.length === 0 ? "—" : null}
                  </span>
                </Td>
                <Td className="text-xs text-slate-500">{fmtDate(t.updatedAt)}</Td>
                <Td right>
                  <Link href={`/settings/takeoff-templates/${t.id}`} className={buttonClasses("ghost", "sm")}>
                    Edit
                  </Link>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
