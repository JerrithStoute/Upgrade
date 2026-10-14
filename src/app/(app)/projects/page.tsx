import Link from "@/components/link";
import { cookies } from "next/headers";
import { Plus, Search } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { contractValue, staffUsers } from "@/lib/projects";
import { scheduleProgressByProject } from "@/lib/project-progress";
import { PROJECT_STATUSES } from "@/lib/constants";
import { cn, fmtDate, money, titleCase } from "@/lib/utils";
import { Badge, Button, ButtonLink, EmptyState, PageHeader, Progress, TBody, THead, Td, Th, Tr } from "@/components/ui";
import { PROJECTS_COOKIE, projectsView } from "@/lib/projects-view";
import { ProjectWidgets, type Widget } from "./_components/project-widgets";
import { JobsMap } from "@/components/maps/jobs-map";
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

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; managerId?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (PROJECT_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "";
  const managerId = (sp.managerId ?? "").trim();
  const view = projectsView((await cookies()).get(PROJECTS_COOKIE)?.value);

  const where = {
    ...(status ? { status } : {}),
    ...(managerId ? { managerId } : {}),
    ...(q
      ? {
          OR: [{ name: { contains: q, mode: "insensitive" as const } }, { address: { contains: q, mode: "insensitive" as const } }, { city: { contains: q, mode: "insensitive" as const } }, ...(Number.isInteger(Number(q)) && q !== "" ? [{ number: Number(q) }] : [])],
        }
      : {}),
  };

  const [projects, managers, statusCounts] = await Promise.all([
    db.project.findMany({
      where,
      include: { client: { select: { firstName: true, lastName: true } }, manager: { select: { name: true } }, spec: { select: { listPrice: true, soldAt: true } } },
      orderBy: { number: "desc" },
    }),
    staffUsers(),
    db.project.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const [values, progressMap] = await Promise.all([Promise.all(projects.map((p) => contractValue(p.id, p.contractAmount))), scheduleProgressByProject(projects.map((p) => p.id))]);

  const countFor = (s: string) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  const total = statusCounts.reduce((s, c) => s + c._count._all, 0);
  const chipHref = (s: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (managerId) params.set("managerId", managerId);
    if (s) params.set("status", s);
    const qs = params.toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  };
  // A spec home's value is its list price once it's listed.
  const valueOf = (i: number) => {
    const p = projects[i];
    return p.isSpec && p.spec?.listPrice ? p.spec.listPrice : values[i];
  };
  const filtered = !!(q || status || managerId);
  const all = projects.map((p, i) => ({ p, i }));

  // The table, as it always was — every column.
  const table = (rows: typeof all, empty: string) =>
    rows.length === 0 ? (
      <p className="px-4 py-3 text-sm text-slate-500">{filtered ? "None match the filters." : empty}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <THead>
            <tr>
              <Th>#</Th>
              <Th>Project</Th>
              <Th>Client</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Manager</Th>
              <Th>Start</Th>
              <Th right>Contract</Th>
              <Th className="w-36">Progress</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ p, i }) => {
              const progress = progressMap.get(p.id) ?? 0;
              return (
                <Tr key={p.id}>
                  <Td className="text-slate-500 tabular-nums">{p.number}</Td>
                  <Td>
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                      {p.name}
                    </Link>
                    {p.city ? <span className="block text-xs text-slate-500">{[p.address, p.city].filter(Boolean).join(", ")}</span> : null}
                  </Td>
                  <Td>
                    {p.client ? (
                      `${p.client.firstName} ${p.client.lastName}`
                    ) : p.isSpec ? (
                      <span className="text-xs text-slate-500">{p.spec?.soldAt ? "Sold" : p.spec?.listPrice ? "On the market" : "Not listed"}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>{p.isSpec ? "Spec home" : titleCase(p.type)}</Td>
                  <Td>
                    <Badge status={p.status} />
                  </Td>
                  <Td>{p.manager?.name ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(p.startDate)}</Td>
                  <Td right>{money(valueOf(i), true)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="flex-1" />
                      <span className="w-9 text-right text-xs text-slate-600 tabular-nums">{progress}%</span>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </table>
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
    { key: "all", title: "All projects", count: all.length, total: sum(all), body: table(all, "No projects yet.") },
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
                  <Link href={`/projects/${p.id}/edit`} className="text-blue-700 hover:underline">
                    #{p.number} {p.name}
                  </Link>
                </span>
              ))}{" "}
              — set each one&apos;s spot on its Edit page.
            </p>
          ) : null}
        </div>
      ),
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={`${total} total · ${sum(all)} shown`}
        actions={
          <ButtonLink href="/projects/new">
            <Plus className="h-4 w-4" /> New project
          </ButtonLink>
        }
      />

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
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Search name, number or address" className="input !pl-9" />
        </div>
        <div className="w-44">
          <select name="status" defaultValue={status} className="input">
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <select name="managerId" defaultValue={managerId} className="input">
            <option value="">Any manager</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {q || status || managerId ? (
          <ButtonLink href="/projects" variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </form>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects match"
          description={q || status || managerId ? "Try clearing the filters." : "Create your first project to get started."}
          action={
            <ButtonLink href="/projects/new">
              <Plus className="h-4 w-4" /> New project
            </ButtonLink>
          }
        />
      ) : (
        <ProjectWidgets widgets={widgets} order={view.order} collapsed={view.collapsed} />
      )}
    </div>
  );
}
