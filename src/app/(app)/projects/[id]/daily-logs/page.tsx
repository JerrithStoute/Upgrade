import Link from "next/link";
import { Plus, ClipboardList, Pencil, CloudSun, Users, Clock, AlertTriangle, EyeOff } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate, num } from "@/lib/utils";
import { Card, CardBody, ButtonLink, EmptyState, Avatar } from "@/components/ui";

export default async function DailyLogsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const logs = await db.dailyLog.findMany({
    where: { projectId: project.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { name: true } }, files: { orderBy: { createdAt: "asc" } } },
  });
  const base = `/projects/${project.id}/daily-logs`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Daily logs <span className="ml-1 text-sm font-normal text-slate-500">{logs.length}</span>
        </h2>
        <ButtonLink href={`${base}/new`} size="sm">
          <Plus className="h-3.5 w-3.5" /> New log
        </ButtonLink>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No daily logs yet"
          description="Record weather, crew, work completed and photos each day on site."
          action={
            <ButtonLink href={`${base}/new`} size="sm">
              <Plus className="h-3.5 w-3.5" /> New log
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{fmtDate(log.date, "EEEE, MMM d, yyyy")}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <CloudSun className="h-4 w-4 text-slate-400" />
                        {log.weather ?? "—"}
                        {log.tempHigh !== null || log.tempLow !== null ? (
                          <span className="tabular-nums text-slate-500">
                            {log.tempHigh ?? "—"}° / {log.tempLow ?? "—"}°
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-slate-400" /> {log.crewCount} crew
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-slate-400" /> {num(log.hoursWorked, 1)} hrs
                      </span>
                      {!log.clientVisible ? (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <EyeOff className="h-3.5 w-3.5" /> Internal
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {log.author ? (
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Avatar name={log.author.name} className="h-6 w-6 text-[10px]" /> {log.author.name}
                      </span>
                    ) : null}
                    <ButtonLink href={`${base}/${log.id}/edit`} variant="secondary" size="sm">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </ButtonLink>
                  </div>
                </div>
                {log.workCompleted ? <p className="whitespace-pre-line text-sm text-slate-700">{log.workCompleted}</p> : <p className="text-sm italic text-slate-400">No work summary.</p>}
                {log.issues ? (
                  <div className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <span className="font-semibold">Issues: </span>
                      <span className="whitespace-pre-line">{log.issues}</span>
                    </div>
                  </div>
                ) : null}
                {log.notes ? <p className="text-xs text-slate-500">Notes: {log.notes}</p> : null}
                {log.files.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {log.files.map((f) => (
                      <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50" title={f.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/files/${f.id}`} alt={f.name} className="h-24 w-24 object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">
        Need a photo you can&apos;t find here? Check the <Link href={`/projects/${project.id}/files?folder=Photos`} className="underline">Photos folder</Link>.
      </p>
    </div>
  );
}
