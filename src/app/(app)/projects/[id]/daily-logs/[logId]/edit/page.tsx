import { notFound } from "next/navigation";
import Link from "@/components/link";
import { MarkUpPhoto } from "@/components/photos/mark-up-photo";
import { fileSrc, markable } from "@/lib/file-src";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { ConfirmForm } from "@/components/ui";
import { LogForm } from "../../_components/log-form";
import { updateLog, deleteLog, deleteLogPhoto } from "../../actions";

export default async function EditDailyLogPage({ params }: { params: Promise<{ id: string; logId: string }> }) {
  await requireView("field");
  const { id, logId } = await params;
  const project = await getProject(id);
  const log = await db.dailyLog.findFirst({ where: { id: logId, projectId: project.id }, include: { files: { orderBy: { createdAt: "asc" } } } });
  if (!log) notFound();
  const base = `/projects/${project.id}/daily-logs`;
  return (
    <div className="space-y-2">
      <Link href={base} className="text-xs font-medium text-blue-700 hover:underline">
        ← Daily logs
      </Link>
      <LogForm
        title="Edit log"
        action={updateLog}
        hidden={{ projectId: project.id, id: log.id }}
        values={log}
        cancelHref={base}
        note="Photos added here go with the ones below. Leave weather, high or low blank and it's filled in for the job's ZIP code when you save."
      />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Saved photos</h2>
          <span className="text-xs text-slate-500">
            {log.files.length ? `${log.files.length} on this log · the pencil marks one up` : "None yet — add some above."}
          </span>
        </header>
        {log.files.length ? (
          <div className="flex flex-wrap gap-3 px-4 py-3">
            {log.files.map((f) => (
              <div key={f.id} className="w-28 space-y-1">
                <div className="relative">
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileSrc(f)} alt={f.name} className="h-28 w-28 object-cover" />
                  </a>
                  {markable(f.mimeType) ? <MarkUpPhoto id={f.id} name={f.name} chip /> : null}
                </div>
                <p className="truncate text-[11px] text-slate-500" title={f.name}>
                  {f.name}
                </p>
                <ConfirmForm action={deleteLogPhoto} hidden={{ projectId: project.id, logId: log.id, id: f.id }} message={`Delete photo "${f.name}"?`} variant="ghost" size="xs">
                  <span className="text-rose-600">Remove…</span>
                </ConfirmForm>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <p className="text-xs text-slate-500">
          Deleting this log also removes its {log.files.length} photo{log.files.length === 1 ? "" : "s"}.
        </p>
        <ConfirmForm action={deleteLog} hidden={{ projectId: project.id, id: log.id }} message="Delete this daily log and its photos? This cannot be undone." variant="ghost" size="xs">
          <span className="text-rose-600">Delete log…</span>
        </ConfirmForm>
      </div>
    </div>
  );
}
