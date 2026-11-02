import Link from "@/components/link";
import { FileStack, Plus } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, money } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import { EmptyState, SubmitButton } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { createTemplate, duplicateTemplate } from "./actions";

export const metadata = { title: "Estimate templates" };

const PATH = "/catalog/estimate-templates";

export default async function EstimateTemplatesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  await requireView("lists");
  const { add } = await searchParams;
  const templates = await db.estimateTemplate.findMany({
    orderBy: { name: "asc" },
    include: { items: true, _count: { select: { specs: { where: { isAllowance: true } } } } },
  });
  // Nothing made yet: the New box is open to start.
  const adding = add === "1" || templates.length === 0;
  const num = "px-3 py-2 text-right tabular-nums";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <ListFind listId="estimate-template-list" placeholder="Find a template…" />
        <Link
          href={`${PATH}?add=1`}
          scroll={false}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-3.5 w-3.5" /> New template
        </Link>
      </header>
      {adding ? (
        // One line; Create opens the new template to fill in.
        <form action={createTemplate} className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-blue-50/40 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">New template</span>
          <input name="name" required autoFocus aria-label="Template name" className="input !h-7 !w-56 !py-0 text-xs" placeholder="Kitchen remodel" />
          <input
            name="description"
            aria-label="Description (internal)"
            className="input !h-7 !w-auto min-w-0 flex-1 !py-0 text-xs"
            placeholder="Standard mid-range kitchen, ~200 sf"
          />
          <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
            Create
          </SubmitButton>
          <Link href={PATH} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
            Cancel
          </Link>
        </form>
      ) : null}
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        A blank estimate with your usual lines, allowances, notes and terms. Pick it when you start a project, or add it to a draft estimate.{" "}
        <strong className="font-medium text-slate-700">Save as template</strong> on any job&apos;s estimate makes one too.
      </p>

      {templates.length === 0 ? (
        <EmptyState icon={FileStack} title="No estimate templates yet" description="Create one above, or save an existing estimate as a template." />
      ) : (
        <div id="estimate-template-list">
          <div className="overflow-x-auto" data-find-group>
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 pl-4 font-normal">Template</th>
                  <th className="px-3 py-2 text-right font-normal">Lines</th>
                  <th className="px-3 py-2 text-right font-normal">Allowances</th>
                  <th className="px-3 py-2 text-right font-normal">Total price</th>
                  <th className="px-3 py-2 font-normal">Updated</th>
                  <th className="px-3 py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} data-find={[t.name, t.description].filter(Boolean).join(" ").toLowerCase()} className="border-t border-slate-100 align-top first:border-t-0 hover:bg-slate-50">
                    <td className="px-3 py-2 pl-4">
                      <Link href={`${PATH}/${t.id}`} className="font-medium text-blue-700 hover:underline">
                        {t.name}
                      </Link>
                      {t.description ? <span className="block text-xs text-slate-500">{t.description}</span> : null}
                    </td>
                    <td className={`${num} text-xs text-slate-600`}>{t.items.length}</td>
                    <td className={`${num} text-xs text-slate-600`}>{t._count.specs}</td>
                    <td className={num}>{money(lineTotals(t.items).price)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{fmtDate(t.updatedAt)}</td>
                    <td className="px-3 py-2 pr-4 text-right">
                      <form action={duplicateTemplate}>
                        <input type="hidden" name="templateId" value={t.id} />
                        <button type="submit" className="text-xs font-medium text-blue-700 hover:underline" aria-label={`Duplicate ${t.name}`}>
                          Duplicate
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
              None match.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
