import Link from "@/components/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { EmptyState, SubmitButton } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { createTakeoffTemplate } from "./actions";
import { requireView } from "@/lib/auth";

const PATH = "/catalog/takeoff-templates";
// A template's takeoffs shown in its row before "+N more".
const FIRST = 4;

export default async function TakeoffTemplatesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  await requireView("lists");
  const { add } = await searchParams;
  const templates = await db.takeoffTemplate.findMany({
    orderBy: { name: "asc" },
    include: { conditions: { orderBy: { sortOrder: "asc" }, select: { name: true, color: true } } },
  });
  // Nothing made yet: the New box is open to start.
  const adding = add === "1" || templates.length === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <ListFind listId="template-list" placeholder="Find a template…" />
        <Link
          href={`${PATH}?add=1`}
          scroll={false}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-3.5 w-3.5" /> New template
        </Link>
      </header>
      {adding ? (
        // One line; Create opens the new template to add its takeoffs.
        <form action={createTakeoffTemplate} className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-blue-50/40 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">New template</span>
          <input name="name" required autoFocus aria-label="Name" className="input !h-7 !w-56 !py-0 text-xs" placeholder="Slab foundation" />
          <input name="description" aria-label="Description" className="input !h-7 !w-auto min-w-0 flex-1 !py-0 text-xs" placeholder="Monolithic slab with beams, rebar and mesh" />
          <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
            Create
          </SubmitButton>
          <Link href={PATH} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
            Cancel
          </Link>
        </form>
      ) : null}
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        Sets of takeoffs, with their items, you add to a job from its Takeoff tab. Build one here, or use <strong className="font-medium text-slate-700">Save as template</strong> on a
        job&apos;s Takeoff tab. Item List items take that day&apos;s price when a template is added to a job.
      </p>

      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No takeoff templates yet" description="Create one above, or save a job's takeoffs as a template from its Takeoff tab." />
      ) : (
        <div id="template-list">
          <div className="overflow-x-auto" data-find-group>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 pl-4 font-normal">Template</th>
                  <th className="px-3 py-2 font-normal">Takeoffs</th>
                  <th className="px-3 py-2 pr-4 font-normal">Updated</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    data-find={[t.name, t.description, ...t.conditions.map((c) => c.name)].filter(Boolean).join(" ").toLowerCase()}
                    className="border-t border-slate-100 align-top first:border-t-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 pl-4">
                      <Link href={`${PATH}/${t.id}`} className="font-medium text-blue-700 hover:underline">
                        {t.name}
                      </Link>
                      {t.description ? <span className="block text-xs text-slate-500">{t.description}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {t.conditions.slice(0, FIRST).map((c, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                            {c.name}
                          </span>
                        ))}
                        {t.conditions.length > FIRST ? <span className="text-slate-400">+{t.conditions.length - FIRST} more</span> : null}
                        {t.conditions.length === 0 ? "—" : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 pr-4 text-xs text-slate-500">{fmtDate(t.updatedAt)}</td>
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
