import Link from "@/components/link";
import { systemDb } from "@/lib/db";
import { requireStation } from "@/lib/station-auth";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import { setErrorFixed, setReportDone } from "./actions";

export const metadata = { title: "Problems" };

/**
 * What broke, and what people reported (src/lib/problems.ts). Open ones first; "Show dealt with" for
 * the rest. The owners are emailed about each new one — this is where they're read and checked off.
 */
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requireStation();
  const all = (await searchParams).all === "1";
  const [reports, errors, openReports, openErrors] = await Promise.all([
    systemDb.stationProblem.findMany({
      where: all ? {} : { doneAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      // (Not the picture itself — just whether there is one.)
      select: { id: true, builderId: true, builderName: true, userName: true, userEmail: true, page: true, message: true, device: true, doneAt: true, createdAt: true, screenshot: false },
    }),
    systemDb.stationError.findMany({ where: all ? {} : { fixedAt: null }, orderBy: { lastAt: "desc" }, take: 100 }),
    systemDb.stationProblem.count({ where: { doneAt: null } }),
    systemDb.stationError.count({ where: { fixedAt: null } }),
  ]);
  const withPicture = new Set(
    (await systemDb.stationProblem.findMany({ where: { id: { in: reports.map((r) => r.id) }, NOT: { screenshot: null } }, select: { id: true } })).map((r) => r.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Problems"
        description="What broke in the program (found by itself), and what builders reported with “Report a problem”. The owners get an email for each new one."
        actions={
          <Link href={all ? "/station/problems" : "/station/problems?all=1"} className="text-sm font-medium text-blue-700 hover:underline">
            {all ? "Show open only" : "Show dealt with too"}
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Reports open" value={openReports} tone={openReports ? "warn" : "default"} />
        <Stat label="Errors open" value={openErrors} tone={openErrors ? "warn" : "default"} />
      </div>

      <Card>
        <CardHeader title="Reported by builders" description="Reply by email — they'll get it from you." />
        {reports.length ? (
          <ul className="divide-y divide-slate-100">
            {reports.map((r) => (
              <li key={r.id} className={cn("space-y-2 px-5 py-4", r.doneAt && "opacity-60")}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-slate-900">{r.userName}</span>
                  {r.builderId ? (
                    <Link href={`/station/builders/${r.builderId}`} className="text-blue-700 hover:underline">
                      {r.builderName}
                    </Link>
                  ) : (
                    <span className="text-slate-600">{r.builderName}</span>
                  )}
                  <a href={`mailto:${r.userEmail}?subject=${encodeURIComponent("The problem you reported")}`} className="text-blue-700 hover:underline">
                    {r.userEmail}
                  </a>
                  <span className="ml-auto text-xs text-slate-500" title={fmtDateTime(r.createdAt)}>
                    {timeAgo(r.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{r.message}</p>
                {withPicture.has(r.id) ? (
                  <a href={`/station/problems/${r.id}/picture`} target="_blank" rel="noreferrer" className="inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the Station's own picture route */}
                    <img src={`/station/problems/${r.id}/picture`} alt="The picture they added" className="max-h-40 rounded border border-slate-200" />
                  </a>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>
                    Page: <span className="font-mono">{r.page}</span>
                  </span>
                  {r.device ? <span className="min-w-0 truncate" title={r.device}>{r.device}</span> : null}
                  <form action={setReportDone} className="ml-auto">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="done" value={r.doneAt ? "0" : "1"} />
                    <SubmitButton variant="secondary" size="sm" pendingText="…">
                      {r.doneAt ? "Open again" : "Dealt with"}
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-5 text-sm text-slate-500">{all ? "No reports yet." : "Nothing open."}</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Errors found by the program" description="The same error again is counted on its line. Marked fixed and it happens again: it's back here, and you get an email." />
        {errors.length ? (
          <ul className="divide-y divide-slate-100">
            {errors.map((e) => (
              <li key={e.id} className={cn("space-y-1.5 px-5 py-4", e.fixedAt && "opacity-60")}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase", e.side === "server" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700")}>{e.side}</span>
                  <span className="min-w-0 flex-1 break-words font-medium text-slate-900">{e.message}</span>
                  <span className="text-xs font-semibold text-slate-700">×{e.count}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>
                    Page: <span className="font-mono">{e.page}</span>
                  </span>
                  <span title={fmtDateTime(e.lastAt)}>Last {timeAgo(e.lastAt)}</span>
                  <span title={fmtDateTime(e.firstAt)}>First {timeAgo(e.firstAt)}</span>
                  {e.lastUserName ? (
                    <span>
                      To {e.lastUserName}
                      {e.lastBuilderName ? ` (${e.lastBuilderName})` : ""}
                    </span>
                  ) : (
                    <span>Nobody signed in</span>
                  )}
                  <form action={setErrorFixed} className="ml-auto">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="fixed" value={e.fixedAt ? "0" : "1"} />
                    <SubmitButton variant="secondary" size="sm" pendingText="…">
                      {e.fixedAt ? "Open again" : "Fixed"}
                    </SubmitButton>
                  </form>
                </div>
                {e.stack ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Details for fixing it</summary>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700">{e.stack}</pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-5 text-sm text-slate-500">{all ? "Nothing has broken yet." : "Nothing open."}</p>
        )}
      </Card>
    </div>
  );
}
