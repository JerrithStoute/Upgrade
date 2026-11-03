import { Images, FileText, Download, Sun, Users, Clock } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { cn, fmtDate } from "@/lib/utils";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";
import Link from "@/components/link";
import { FileTypesNote } from "@/components/selections/extras";

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
  const photos = shown.filter((f) => f.mimeType.startsWith("image/"));
  const docs = shown.filter((f) => !f.mimeType.startsWith("image/"));

  return (
    <>
      <PortalPageHeader title="Photos & Files" description="Progress photos, plans and documents your team has shared with you." projects={projects} project={project} />
      <div className="space-y-4">
        {folders.length ? (
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={base}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", !folder ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}
            >
              All · {files.length}
            </Link>
            {folders.map((f) => (
              <Link
                key={f}
                href={`${base}&folder=${encodeURIComponent(f)}`}
                className={cn("rounded-full px-3 py-1 text-xs font-medium", folder === f ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}
              >
                {f} · {files.filter((x) => x.folder === f).length}
              </Link>
            ))}
          </div>
        ) : null}

        {shown.length === 0 ? (
          <EmptyState icon={Images} title="No files yet" description="Photos and documents will show up here as your team uploads them." />
        ) : null}

        {photos.length ? (
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Photos</h2>
              <span className="text-xs text-slate-500">{photos.length}</span>
            </header>
            <div className="grid grid-cols-3 gap-1 p-2 sm:grid-cols-4 lg:grid-cols-6">
              {photos.map((f) => (
                <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" title={`${f.name} · ${fmtDate(f.createdAt)}`} className="block overflow-hidden rounded-md hover:opacity-90">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${f.id}`} alt={f.name} className="aspect-square w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
            <p className="px-4 pb-2.5 text-xs text-slate-500">Newest first · tap a photo to open it full size</p>
          </section>
        ) : null}

        {docs.length ? (
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
              <span className="text-xs text-slate-500">{docs.length}</span>
            </header>
            <ul className="divide-y divide-slate-100">
              {docs.map((f) => (
                <li key={f.id}>
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                    <FileText className="h-4 w-4 shrink-0 text-rose-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900">{f.name}</span>
                      <span className="block text-xs text-slate-500">
                        {f.folder} · {fmtSize(f.size)} · {fmtDate(f.createdAt, "MMM d")}
                      </span>
                    </span>
                    <Download className="h-4 w-4 shrink-0 text-slate-400" />
                  </a>
                </li>
              ))}
            </ul>
            <FileTypesNote viewOnly className="px-4 pb-2.5" />
          </section>
        ) : null}

        <Card>
          <CardHeader title="Daily logs" />
          {logs.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">No daily logs shared yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {logs.map((log) => (
                <li key={log.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{fmtDate(log.date, "EEE, MMM d, yyyy")}</p>
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
                  {log.weatherNotes ? <p className="mt-1 whitespace-pre-line text-xs text-slate-500">Weather: {log.weatherNotes}</p> : null}
                  {log.issues ? (
                    <p className="mt-1.5 text-sm text-amber-800">
                      <span className="font-medium">Issues:</span> {log.issues}
                    </p>
                  ) : null}
                  {log.files.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {log.files.map((f) =>
                        f.mimeType.startsWith("image/") ? (
                          <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" title={f.name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/files/${f.id}`} alt={f.name} className="h-16 w-20 rounded-md border border-slate-200 object-cover" loading="lazy" />
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
