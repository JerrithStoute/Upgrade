import Link from "@/components/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { EmptyState, SubmitButton } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { addSampleScheduleTemplate, createScheduleTemplate } from "./actions";

export const metadata = { title: "Schedule templates" };

const PATH = "/catalog/schedule-templates";

/** Schedules you start jobs from: tasks with lengths in workdays and what each waits on. */
export default async function ScheduleTemplatesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  await requireView("lists");
  const { add } = await searchParams;
  const templates = await db.scheduleTemplate.findMany({
    orderBy: { name: "asc" },
    include: { tasks: { select: { duration: true, isMilestone: true } } },
  });
  // Nothing made yet: the New box is open to start.
  const adding = add === "1" || templates.length === 0;
  const num = "px-3 py-2 text-right text-xs tabular-nums text-slate-600";

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <ListFind listId="schedule-template-list" placeholder="Find a template…" />
        <Link
          href={`${PATH}?add=1`}
          scroll={false}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-3.5 w-3.5" /> New template
        </Link>
      </header>
      {adding ? (
        // One line; Create opens the new template to add its tasks.
        <form action={createScheduleTemplate} className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-blue-50/40 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-900">New template</span>
          <input name="name" required autoFocus aria-label="Template name" className="input !h-7 !w-72 !py-0 text-xs" placeholder="2,400 sq ft one-story slab" />
          <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
            Create
          </SubmitButton>
          <Link href={PATH} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
            Cancel
          </Link>
        </form>
      ) : null}
      <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        Tasks with lengths in workdays and what each waits on. Start a job&apos;s schedule from one, or use{" "}
        <strong className="font-medium text-slate-700">Save as template</strong> on a job&apos;s Schedule tab.{" "}
        <form action={addSampleScheduleTemplate} className="inline">
          <button type="submit" className="font-medium text-blue-700 hover:underline" title="About 50 tasks from plans to the client walkthrough, about 6 months. Edit it to fit how you build.">
            Add the sample: New home, slab on grade
          </button>
        </form>
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No schedule templates yet" description="Create one above, add the sample, or save a job's schedule as a template." />
      ) : (
        <div id="schedule-template-list">
          <div className="overflow-x-auto" data-find-group>
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 pl-4 font-normal">Template</th>
                  <th className="px-3 py-2 text-right font-normal">Tasks</th>
                  <th className="px-3 py-2 text-right font-normal">Workdays of work</th>
                  <th className="px-3 py-2 pr-4 font-normal">Updated</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} data-find={t.name.toLowerCase()} className="border-t border-slate-100 first:border-t-0 hover:bg-slate-50">
                    <td className="px-3 py-2 pl-4">
                      <Link href={`${PATH}/${t.id}`} className="font-medium text-blue-700 hover:underline">
                        {t.name}
                      </Link>
                    </td>
                    <td className={num}>{t.tasks.length}</td>
                    <td className={num}>{t.tasks.reduce((n, x) => n + (x.isMilestone ? 0 : x.duration), 0)}</td>
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
