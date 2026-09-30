import { Images, FileText, Download, Sun, Users, Clock } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { cn, fmtDate } from "@/lib/utils";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";
import Link from "next/link";

export const metadata = { title: "Photos & Files" };

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PortalFilesPage({ searchParams }: { searchParams: Promise<{ project?: string; folder?: string }> }) {
  const user = await requireClient();
  const { project: projectParam, folder } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Photos & Files" projects={projects} project={null} />
        <EmptyState icon={Images} title="No projects yet" description="Photos and documents will appear here once your project is set up." />
      </>
    );
  }

  const [files, logs] = await Promise.all([
    db.fileAsset.findMany({
      where: { projectId: project.id, clientVisible: true },
      orderBy: { createdAt: "desc" },
    }),
    db.dailyLog.findMany({
      where: { projectId: project.id, clientVisible: true },
      orderBy: { date: "desc" },
      include: { files: { where: { clientVisible: true }, orderBy: { createdAt: "asc" } }, author: { select: { name: true } } },
    }),
  ]);

  const folders = [...new Set(files.map((f) => f.folder))].sort();
  const shown = folder ? files.filter((f) => f.folder === folder) : files;
  const base = `/portal/files?project=${project.id}`;

  return (
    <>
      <PortalPageHeader title="Photos & Files" description="Progress photos, plans and documents your team has shared with you." projects={projects} project={project} />
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Files"
            description={`${files.length} file${files.length === 1 ? "" : "s"} shared`}
            actions={
              folders.length ? (
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={base}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                      !folder ? "bg-blue-700 text-white ring-blue-700" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                    )}
                  >
                    All
                  </Link>
                  {folders.map((f) => (
                    <Link
                      key={f}
                      href={`${base}&folder=${encodeURIComponent(f)}`}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                        folder === f ? "bg-blue-700 text-white ring-blue-700" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {f} <span className="opacity-70">{files.filter((x) => x.folder === f).length}</span>
                    </Link>
                  ))}
                </div>
              ) : undefined
            }
          />
          <CardBody>
            {shown.length === 0 ? (
              <EmptyState icon={Images} title="No files yet" description="Photos and documents will show up here as your team uploads them." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((f) => {
                  const isImage = f.mimeType.startsWith("image/");
                  const href = `/api/files/${f.id}`;
                  return (
                    <a
                      key={f.id}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={href} alt={f.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="grid aspect-[4/3] w-full place-items-center bg-slate-50 text-slate-400">
                          <FileText className="h-8 w-8" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <p className="truncate text-sm font-medium text-slate-900" title={f.name}>
                          {f.name}
                        </p>
                        <p className="flex items-center justify-between text-xs text-slate-500">
                          <span>
                            {f.folder} · {fmtSize(f.size)}
                          </span>
                          <Download className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                        </p>
                        <p className="text-xs text-slate-400">{fmtDate(f.createdAt)}</p>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Daily logs" description="Progress notes from the job site" />
          {logs.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">No daily logs shared yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {logs.map((log) => (
                <li key={log.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{fmtDate(log.date, "EEEE, MMM d, yyyy")}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {log.weather ? (
                        <span className="inline-flex items-center gap-1">
                          <Sun className="h-3.5 w-3.5" /> {log.weather}
                          {log.tempHigh != null ? ` ${log.tempHigh}°` : ""}
                          {log.tempLow != null ? `/${log.tempLow}°` : ""}
                        </span>
                      ) : null}
                      {log.crewCount ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {log.crewCount} crew
                        </span>
                      ) : null}
                      {log.hoursWorked ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {log.hoursWorked} hrs
                        </span>
                      ) : null}
                      {log.author ? <span>by {log.author.name}</span> : null}
                    </div>
                  </div>
                  {log.workCompleted ? <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{log.workCompleted}</p> : null}
                  {log.issues ? (
                    <p className="mt-1.5 text-sm text-amber-800">
                      <span className="font-medium">Issues:</span> {log.issues}
                    </p>
                  ) : null}
                  {log.files.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {log.files.map((f) =>
                        f.mimeType.startsWith("image/") ? (
                          <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" title={f.name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/files/${f.id}`} alt={f.name} className="h-24 w-32 rounded-lg border border-slate-200 object-cover" loading="lazy" />
                          </a>
                        ) : (
                          <a
                            key={f.id}
                            href={`/api/files/${f.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <FileText className="h-3.5 w-3.5" /> {f.name}
                          </a>
                        ),
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
