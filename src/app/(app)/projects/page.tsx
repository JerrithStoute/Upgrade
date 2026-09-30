import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { contractValue, staffUsers } from "@/lib/projects";
import { scheduleProgressByProject } from "@/lib/project-progress";
import { PROJECT_STATUSES } from "@/lib/constants";
import { cn, fmtDate, money, titleCase } from "@/lib/utils";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  PageHeader,
  Progress,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; managerId?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (PROJECT_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : "";
  const managerId = (sp.managerId ?? "").trim();

  const where = {
    ...(status ? { status } : {}),
    ...(managerId ? { managerId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { address: { contains: q } },
            { city: { contains: q } },
            ...(Number.isInteger(Number(q)) && q !== "" ? [{ number: Number(q) }] : []),
          ],
        }
      : {}),
  };

  const [projects, managers, statusCounts] = await Promise.all([
    db.project.findMany({
      where,
      include: { client: { select: { firstName: true, lastName: true } }, manager: { select: { name: true } } },
      orderBy: { number: "desc" },
    }),
    staffUsers(),
    db.project.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const [values, progressMap] = await Promise.all([
    Promise.all(projects.map((p) => contractValue(p.id, p.contractAmount))),
    scheduleProgressByProject(projects.map((p) => p.id)),
  ]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={`${total} total · ${money(values.reduce((s, v) => s + v, 0), true)} shown`}
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
          <input name="q" defaultValue={q} placeholder="Search name, number or address" className="input pl-9" />
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
        <Table>
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
            {projects.map((p, i) => {
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
                  <Td>{p.client ? `${p.client.firstName} ${p.client.lastName}` : <span className="text-slate-400">—</span>}</Td>
                  <Td>{titleCase(p.type)}</Td>
                  <Td>
                    <Badge status={p.status} />
                  </Td>
                  <Td>{p.manager?.name ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(p.startDate)}</Td>
                  <Td right>{money(values[i], true)}</Td>
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
        </Table>
      )}
    </div>
  );
}
