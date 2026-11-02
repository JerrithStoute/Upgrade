import Link from "@/components/link";
import { notFound } from "next/navigation";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { staffUsers } from "@/lib/projects";
import { parseTemplateLinks } from "@/lib/schedule-templates";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { deleteScheduleTemplate, renameScheduleTemplate } from "../actions";
import { TemplateEditor } from "../template-editor";

const link = "text-xs font-medium text-blue-700 hover:underline";

/** One schedule template: its name, then its tasks to edit in place. */
export default async function ScheduleTemplatePage({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireView("lists");
  const { templateId } = await params;
  const { edit } = await searchParams;
  const [template, staff] = await Promise.all([
    db.scheduleTemplate.findUnique({ where: { id: templateId }, include: { tasks: { orderBy: { sortOrder: "asc" } } } }),
    staffUsers(),
  ]);
  if (!template) notFound();
  const base = `/catalog/schedule-templates/${template.id}`;

  return (
    <div className="space-y-3">
      {edit === "name" ? (
        <form action={renameScheduleTemplate} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-blue-50/40 px-4 py-2.5">
          <input type="hidden" name="id" value={template.id} />
          <input name="name" required autoFocus aria-label="Template name" className="input !h-7 !w-72 !py-0 text-xs" defaultValue={template.name} />
          <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
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
            <Link href={`${base}?edit=name`} scroll={false} className={link}>
              Edit
            </Link>
          </div>
          <ConfirmForm
            action={deleteScheduleTemplate}
            hidden={{ id: template.id }}
            message={`Delete the schedule template "${template.name}"? Jobs already built from it keep their schedules.`}
            variant="ghost"
          >
            <span className="text-xs text-rose-600">Delete template…</span>
          </ConfirmForm>
        </div>
      )}

      <TemplateEditor
        key={`${template.id}:${template.updatedAt.getTime()}`}
        id={template.id}
        staff={staff}
        tasks={template.tasks.map((t) => ({
          key: t.id,
          name: t.name,
          phase: t.phase,
          duration: t.duration,
          isMilestone: t.isMilestone,
          color: t.color,
          assigneeId: t.assigneeId,
          links: parseTemplateLinks(t.links).map((l) => ({ key: l.id, lag: l.lag })),
        }))}
      />
    </div>
  );
}
