import Link from "@/components/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { contractValues, staffUsers } from "@/lib/projects";
import { scheduleProgressByProject } from "@/lib/project-progress";
import { PROJECT_STATUSES } from "@/lib/constants";
import { cn, fmtDate, money, titleCase } from "@/lib/utils";
import { Badge, ButtonLink, EmptyState, Progress } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { ManagerPick } from "./_components/manager-pick";
import { PROJECTS_COOKIE, projectsView } from "@/lib/projects-view";
import { ProjectWidgets, type Widget } from "./_components/project-widgets";
import { JobsMap } from "@/components/maps/jobs-map";
import { moveJobPin } from "./actions";
import { siteAddressOf } from "@/lib/job-site";

/** Pin colors on the map, by status. */
const STATUS_COLOR: Record<string, string> = {
  LEAD: "#94a3b8",
  ESTIMATING: "#f59e0b",
  PROPOSAL_SENT: "#f97316",
  CONTRACTED: "#2563eb",
  IN_PROGRESS: "#16a34a",
  ON_HOLD: "#9333ea",
  COMPLETED: "#334155",
  CANCELLED: "#e11d48",
};

/** The three kinds of job, each its own widget (plus All projects). Additions, commercial and other jobs sit with Remodels. */
const KINDS = [
  { key: "spec", title: "Spec homes", newLabel: "New spec home", empty: "No spec homes — built to sell, no client." },
  { key: "custom", title: "Custom homes", newLabel: "New custom home", empty: "No custom homes." },
  { key: "remodel", title: "Remodels", newLabel: "New remodel", empty: "No remodels." },
] as const;
const kindOf = (p: { isSpec: boolean; type: string }) => (p.isSpec ? "spec" : p.type === "NEW_HOME" ? "custom" : "remodel");

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string; managerId?: string; templates?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const status = (PROJECT_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "";
  const managerId = (sp.managerId ?? "").trim();
  const view = projectsView((await cookies()).get(PROJECTS_COOKIE)?.value);
  // Plan templates (houses kept to copy new jobs from) show only when asked for; never with the jobs.
  const templates = sp.templates === "1";

  const where = {
    isTemplate: templates,
    ...(status ? { status } : {}),
    ...(managerId ? { managerId } : {}),
  };

  const [projects, managers, statusCounts] = await Promise.all([
    db.project.findMany({
      where,
      include: { client: { select: { firstName: true, lastName: true } }, manager: { select: { name: true } }, spec: { select: { listPrice: true, soldAt: true } } },
      orderBy: { number: "desc" },
    }),
    staffUsers(),
    db.project.groupBy({ by: ["status"], where: { isTemplate: false }, _count: { _all: true } }),
  ]);
  const templateCount = await db.project.count({ where: { isTemplate: true } });

  const [values, progressMap] = await Promise.all([contractValues(projects), scheduleProgressByProject(projects.map((p) => p.id))]);

  const countFor = (s: string) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const total = statusCounts.reduce((s, c) => s + c._count._all, 0);
  const chipHref = (s: string) => {
    const params = new URLSearchParams();
    if (managerId) params.set("managerId", managerId);
    if (s) params.set("status", s);
    if (templates) params.set("templates", "1");
    const qs = params.toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  };
  // A spec home's value is its list price once it's listed.
  const valueOf = (i: number) => {
    const p = projects[i];
    return p.isSpec && p.spec?.listPrice ? p.spec.listPrice : values[i];
  };
  const filtered = !!(status || managerId);
  const all = projects.map((p, i) => ({ p, i }));

  // What the search box finds a job by: name, number, address, client, manager.
  const findText = (p: (typeof projects)[number]) =>
    [String(p.number), p.name, p.address, p.city, p.client ? `${p.client.firstName} ${p.client.lastName}` : null, p.manager?.name].filter(Boolean).join(" ").toLowerCase();

  // A box's table: the type column only where the box mixes types (All projects).
  const table = (rows: typeof all, empty: string, showType = false) =>
    rows.length === 0 ? (
      <p className="px-4 py-3 text-sm text-slate-500">{filtered ? "None match the filters." : empty}</p>
    ) : (
      <div className="overflow-x-auto" data-find-group>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Job</th>
              <th className="px-2 py-2 font-medium">Client</th>
              {showType ? <th className="px-2 py-2 font-medium">Type</th> : null}
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Manager</th>
              <th className="px-2 py-2 font-medium">Start</th>
              <th className="px-2 py-2 text-right font-medium">Contract</th>
              <th className="w-36 px-4 py-2 font-medium">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 border-t border-slate-100">
            {rows.map(({ p, i }) => {
              const progress = progressMap.get(p.id) ?? 0;
              return (
                <tr key={p.id} data-find={findText(p)} data-find-key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 text-xs text-slate-500 tabular-nums">{p.number}</td>
                  <td className="px-2 py-2">
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                      {p.name}
                    </Link>
                    {p.city ? <span className="block text-xs text-slate-500">{[p.address, p.city].filter(Boolean).join(", ")}</span> : null}
                  </td>
                  <td className="px-2 py-2">
                    {p.client ? (
                      `${p.client.firstName} ${p.client.lastName}`
                    ) : p.isSpec ? (
                      <span className="text-xs text-slate-500">{p.spec?.soldAt ? "Sold" : p.spec?.listPrice ? "On the market" : "Not listed"}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {showType ? <td className="px-2 py-2">{p.isSpec ? "Spec home" : titleCase(p.type)}</td> : null}
                  <td className="px-2 py-2">
                    <Badge status={p.status} />
                  </td>
                  <td className="px-2 py-2">{p.manager?.name ?? <span className="text-slate-400">—</span>}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-600">{fmtDate(p.startDate)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(valueOf(i), true)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="flex-1" />
                      <span className="w-9 text-right text-xs text-slate-600 tabular-nums">{progress}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
          None match.
        </p>
      </div>
    );
  const sum = (rows: typeof all) =>
    money(
      rows.reduce((n, r) => n + valueOf(r.i), 0),
      true,
    );
  const widgets: Widget[] = [
    ...KINDS.map((k) => {
      const rows = all.filter(({ p }) => kindOf(p) === k.key);
      return { key: k.key, title: k.title, count: rows.length, total: sum(rows), newHref: `/projects/new?kind=${k.key}`, newLabel: k.newLabel, body: table(rows, k.empty) };
    }),
    { key: "all", title: "All projects", count: all.length, total: sum(all), body: table(all, "No projects yet.", true) },
    jobsMap(),
  ];

  /** Every job on one map (finished and cancelled ones only when that status is picked above). */
  function jobsMap(): Widget {
    const onMap = projects.filter((p) => status || !["COMPLETED", "CANCELLED"].includes(p.status));
    const pinned = onMap.filter((p) => p.siteLat != null && p.siteLng != null);
    const missing = onMap.filter((p) => p.siteLat == null);
    const shown = [...new Set(pinned.map((p) => p.status))];
    return {
      key: "map",
      title: "Map",
      count: pinned.length,
      total: missing.length ? `${missing.length} not on the map` : "all on the map",
      body: (
        <div className="space-y-2 p-3">
          <JobsMap
            className="h-[28rem]"
            move={moveJobPin}
            pins={pinned.map((p) => ({ id: p.id, name: `#${p.number} ${p.name}`, address: siteAddressOf(p), lat: p.siteLat!, lng: p.siteLng!, color: STATUS_COLOR[p.status], href: `/projects/${p.id}` }))}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            {shown.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                {titleCase(s)}
              </span>
            ))}
          </div>
          {missing.length ? (
            <p className="text-xs text-slate-500">
              Not on the map yet:{" "}
              {missing.map((p, i) => (
                <span key={p.id}>
                  {i ? ", " : ""}
                  <Link href={`/projects/${p.id}`} className="text-blue-700 hover:underline">
                    #{p.number} {p.name}
                  </Link>
                </span>
              ))}{" "}
              — set each one&apos;s spot under Job site on its Overview.
            </p>
          ) : null}
        </div>
      ),
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">{templates ? "Plan templates" : "Projects"}</h1>
          <p className="text-xs text-slate-500">
            {templates ? "Houses you build over and over — open one and use ⋯ Copy this job to start a new job from it." : `${total} jobs · ${sum(all)} shown`}
          </p>
        </div>
        <Link href="/projects/new" className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> New project
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={chipHref("")}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            !status ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          All <span className="opacity-70">{total}</span>
        </Link>
        {PROJECT_STATUSES.map((s) => (
          <Link
            key={s}
            href={chipHref(s)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              status === s ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {titleCase(s)} <span className="opacity-70">{countFor(s)}</span>
          </Link>
        ))}
        {templateCount || templates ? (
          <Link
            href={templates ? "/projects" : "/projects?templates=1"}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              templates ? "border-violet-700 bg-violet-700 text-white" : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
            )}
            title="Houses you build over and over, kept to copy new jobs from"
          >
            Plan templates <span className="opacity-70">{templateCount}</span>
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {projects.length ? (
          <div className="min-w-[15rem] flex-1">
            <ListFind listId="project-list" placeholder="Type a job, number, address or client" />
          </div>
        ) : null}
        <ManagerPick managers={managers} value={managerId} />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects match"
          description={status || managerId ? "Try All, or Any manager." : "Create your first project to get started."}
          action={
            <ButtonLink href="/projects/new">
              <Plus className="h-4 w-4" /> New project
            </ButtonLink>
          }
        />
      ) : (
        <div id="project-list">
          <ProjectWidgets widgets={widgets} order={view.order} collapsed={view.collapsed} />
        </div>
      )}
    </div>
  );
}
