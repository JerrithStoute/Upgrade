import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { staffUsers } from "@/lib/projects";
import { parseTemplateLinks } from "@/lib/schedule-templates";
import { fmtDate } from "@/lib/utils";
import { ButtonLink, Card, CardBody, CardHeader, ConfirmForm, EmptyState, SubmitButton, Table, TBody, THead, Td, Th, Tr } from "@/components/ui";
import { addSampleScheduleTemplate, createScheduleTemplate, deleteScheduleTemplate } from "./actions";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "Schedule templates" };

/** Schedules you start jobs from: tasks with lengths in workdays and what each waits on. */
export default async function ScheduleTemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const { edit } = await searchParams;
  const [templates, staff] = await Promise.all([db.scheduleTemplate.findMany({ orderBy: { name: "asc" }, include: { tasks: { orderBy: { sortOrder: "asc" } } } }), staffUsers()]);
  const editing = edit ? templates.find((t) => t.id === edit) : undefined;

  if (editing)
    return (
      <div className="space-y-4">
        <Link href="/settings/schedule-templates" className="text-sm text-blue-700 hover:underline">
          ← All schedule templates
        </Link>
        <TemplateEditor
          key={`${editing.id}:${editing.updatedAt.getTime()}`}
          id={editing.id}
          name={editing.name}
          staff={staff}
          tasks={editing.tasks.map((t) => ({
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
        <p className="text-xs text-slate-500">
          On a job: Schedule → Schedule templates → Start from a template. Each task goes as early as what it waits on allows, on your workdays (Settings → Schedule), holidays
          skipped.
        </p>
      </div>
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="New schedule template" description="Or save a job's schedule as one from its Schedule tab." />
        <CardBody>
          <form action={createScheduleTemplate} className="flex items-center gap-2">
            <input name="name" required placeholder="e.g. 2,400 sq ft one-story slab" className="input max-w-sm" aria-label="Template name" />
            <SubmitButton size="sm">Create</SubmitButton>
          </form>
          <form action={addSampleScheduleTemplate} className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <SubmitButton size="sm" variant="secondary" pendingText="Adding…">
              Add the sample: New home, slab on grade
            </SubmitButton>
            <span className="text-xs text-slate-500">
              About 50 tasks from plans to the client walkthrough, with lengths in workdays and what waits on what — about 6 months on a Monday–Friday week. Edit it to fit how you
              build.
            </span>
          </form>
        </CardBody>
      </Card>
      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No schedule templates yet" description="Build one here, or save a job's schedule as a template from its Schedule tab." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Template</Th>
              <Th right>Tasks</Th>
              <Th right>Workdays of work</Th>
              <Th>Updated</Th>
              <Th right />
            </tr>
          </THead>
          <TBody>
            {templates.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <Link href={`?edit=${t.id}`} className="font-medium text-slate-900 hover:underline">
                    {t.name}
                  </Link>
                </Td>
                <Td right>{t.tasks.length}</Td>
                <Td right>{t.tasks.reduce((n, x) => n + (x.isMilestone ? 0 : x.duration), 0)}</Td>
                <Td className="text-slate-500">{fmtDate(t.updatedAt)}</Td>
                <Td right>
                  <span className="inline-flex gap-1.5">
                    <ButtonLink href={`?edit=${t.id}`} size="sm" variant="secondary">
                      Edit
                    </ButtonLink>
                    <ConfirmForm
                      action={deleteScheduleTemplate}
                      hidden={{ id: t.id }}
                      message={`Delete the schedule template "${t.name}"? Jobs already built from it keep their schedules.`}
                      variant="ghost"
                    >
                      Delete
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
