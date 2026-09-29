import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate } from "@/lib/utils";
import { Card, CardHeader, CardBody, SubmitButton, ButtonLink, ConfirmForm } from "@/components/ui";
import { LogFields } from "../../_components/log-form";
import { updateLog, deleteLog, deleteLogPhoto } from "../../actions";

export default async function EditDailyLogPage({ params }: { params: Promise<{ id: string; logId: string }> }) {
  await requireStaff();
  const { id, logId } = await params;
  const project = await getProject(id);
  const log = await db.dailyLog.findFirst({ where: { id: logId, projectId: project.id }, include: { files: { orderBy: { createdAt: "asc" } } } });
  if (!log) notFound();
  const base = `/projects/${project.id}/daily-logs`;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`Edit log — ${fmtDate(log.date, "EEEE, MMM d, yyyy")}`} />
        <CardBody>
          <form action={updateLog} className="space-y-4">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="id" value={log.id} />
            <LogFields values={log} />
            <div className="flex items-center gap-2">
              <SubmitButton pendingText="Saving log…">Save changes</SubmitButton>
              <ButtonLink href={base} variant="secondary">
                Cancel
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Photos" description={log.files.length ? `${log.files.length} attached` : "No photos attached yet — add some with the form above."} />
        {log.files.length ? (
          <CardBody>
            <div className="flex flex-wrap gap-3">
              {log.files.map((f) => (
                <div key={f.id} className="w-32 space-y-1.5">
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${f.id}`} alt={f.name} className="h-32 w-32 object-cover" />
                  </a>
                  <p className="truncate text-[11px] text-slate-500" title={f.name}>
                    {f.name}
                  </p>
                  <ConfirmForm action={deleteLogPhoto} hidden={{ projectId: project.id, logId: log.id, id: f.id }} message={`Delete photo "${f.name}"?`} variant="ghost">
                    Remove
                  </ConfirmForm>
                </div>
              ))}
            </div>
          </CardBody>
        ) : null}
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/40 px-5 py-3">
        <p className="text-sm text-rose-800">Deleting this log also removes its {log.files.length} photo{log.files.length === 1 ? "" : "s"}.</p>
        <ConfirmForm action={deleteLog} hidden={{ projectId: project.id, id: log.id }} message="Delete this daily log and its photos? This cannot be undone.">
          Delete log
        </ConfirmForm>
      </div>
    </div>
  );
}
