import Link from "@/components/link";
import { Plus, ClipboardList, CloudSun, AlertTriangle } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate, num } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { ListFind } from "@/components/list-find";

export default async function DailyLogsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireView("field");
  const { id } = await params;
  const project = await getProject(id);
  const logs = await db.dailyLog.findMany({
    where: { projectId: project.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { name: true } }, files: { orderBy: { createdAt: "asc" } } },
  });
  const base = `/projects/${project.id}/daily-logs`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        {logs.length ? <ListFind listId="log-list" placeholder="Find a log…" /> : null}
        <span className="text-xs text-slate-500">
          {logs.length} log{logs.length === 1 ? "" : "s"}
        </span>
        <Link
          href={`${base}/new`}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-3.5 w-3.5" /> New log
        </Link>
      </header>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        Each day on site: weather, crew, hours, work done, issues and photos. The client sees them in their portal unless a log is internal. Need a photo you can&apos;t find
        here? Check the{" "}
        <Link href={`/projects/${project.id}/files?folder=Photos`} className="font-medium text-blue-700 hover:underline">
          Photos folder
        </Link>
        .
      </p>

      {logs.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No daily logs yet" description="Record weather, crew, work completed and photos each day on site." />
      ) : (
        <div id="log-list">
          <ul data-find-group>
            {logs.map((log) => (
              <li
                key={log.id}
                data-find={[fmtDate(log.date, "EEEE MMM d yyyy"), log.weather, log.weatherNotes, log.workCompleted, log.issues, log.notes, log.author?.name]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase()}
                className="space-y-1.5 border-t border-slate-100 px-4 py-3 first:border-t-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-slate-900">{fmtDate(log.date, "EEEE, MMM d, yyyy")}</span>
                  <span className="text-xs text-slate-500">
                    {[
                      [log.weather, log.tempHigh !== null || log.tempLow !== null ? `${log.tempHigh ?? "—"}° / ${log.tempLow ?? "—"}°` : null].filter(Boolean).join(", ") || null,
                      `${log.crewCount} crew`,
                      `${num(log.hoursWorked, 1)} hrs`,
                      log.author?.name,
                      log.clientVisible ? null : "Internal",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <Link href={`${base}/${log.id}/edit`} className="ml-auto text-xs font-medium text-blue-700 hover:underline" aria-label={`Edit the log for ${fmtDate(log.date)}`}>
                    Edit
                  </Link>
                </div>
                {log.weatherNotes ? (
                  <p className="flex gap-1.5 text-xs text-slate-600">
                    <CloudSun className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="whitespace-pre-line">{log.weatherNotes}</span>
                  </p>
                ) : null}
                {log.workCompleted ? <p className="whitespace-pre-line text-sm text-slate-700">{log.workCompleted}</p> : <p className="text-sm italic text-slate-400">No work summary.</p>}
                {log.issues ? (
                  <p className="flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="whitespace-pre-line">
                      <span className="font-semibold">Issues: </span>
                      {log.issues}
                    </span>
                  </p>
                ) : null}
                {log.notes ? <p className="text-xs text-slate-500">Notes: {log.notes}</p> : null}
                {log.files.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {log.files.map((f) => (
                      <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50" title={f.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/files/${f.id}`} alt={f.name} className="h-16 w-16 object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
            None match.
          </p>
        </div>
      )}
    </section>
  );
}
