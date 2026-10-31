import Link from "@/components/link";
import { Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { allows, type AreaKey } from "@/lib/access";
import { changeOrderTotals } from "@/lib/change-orders";
import { db } from "@/lib/db";
import { getProject, projectFinancials, staffUsers } from "@/lib/projects";
import { avgTaskProgress } from "@/lib/project-progress";
import { cn, fmtDate, money, num, timeAgo } from "@/lib/utils";
import { Badge, ConfirmForm, Progress } from "@/components/ui";
import { companyClock } from "@/lib/company-zone";
import { siteAddressOf } from "@/lib/job-site";
import { vendorChoices } from "@/lib/paperwork-server";
import { Directions } from "@/components/maps/directions";
import { JobDetails } from "@/components/projects/job-details";
import { deleteProject, moveJobPin, setJobSite } from "../actions";
import { JobSite } from "../_components/job-site";
import { JobVendors } from "../_components/job-vendors";

const card = "rounded-xl border border-slate-200 bg-white shadow-sm";

/** One box on the Overview: a small header with a link to its tab, then its list. */
function Box({ title, note, href, link, children }: { title: string; note?: string; href?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">
          {title} {note ? <span className="text-xs font-normal text-slate-500">{note}</span> : null}
        </h2>
        {href ? (
          <Link href={href} className="shrink-0 text-xs font-medium text-blue-700 hover:underline">
            {link}
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-2.5 text-sm text-slate-500">{children}</p>;
}

/** A number across the top: small, like the rest of the page. */
function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-slate-900")}>{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/**
 * A job's Overview, laid out like a client's or sub's page: its numbers, its Details (edited right here) beside
 * the job site and the subs who see it, then what's coming up and what's waiting.
 */
export default async function ProjectOverviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireStaff();
  // Each part of the overview shows when the person's position shows that area.
  const sees = (area: AreaKey) => allows(user.access, area, 1);
  const { id } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);
  const base = `/projects/${project.id}`;
  const now = (await companyClock()).now; // now, on the company's clock (for due / overdue)

  const [financials, tasks, pendingSelections, pendingChangeOrders, openTodos, dailyLogs, activities, clients, managers, team, vendors, picked, choices] = await Promise.all([
    projectFinancials(project.id, project.contractAmount),
    db.scheduleTask.findMany({ where: { projectId: project.id }, orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }] }),
    db.selection.findMany({
      where: { projectId: project.id, status: { in: ["PENDING", "CHOSEN"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    db.changeOrder.findMany({
      where: { projectId: project.id, status: "PENDING_APPROVAL" },
      include: { items: true },
      orderBy: { number: "asc" },
    }),
    db.todo.findMany({
      where: { projectId: project.id, status: "OPEN" },
      include: { assignee: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 6,
    }),
    db.dailyLog.findMany({
      where: { projectId: project.id },
      include: { author: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 3,
    }),
    db.activity.findMany({
      where: { projectId: project.id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.client.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, company: true } }),
    staffUsers(),
    db.projectMember.findMany({ where: { projectId: project.id }, select: { userId: true } }),
    db.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { logins: true } } } }),
    db.projectVendor.findMany({ where: { projectId: project.id }, select: { vendorId: true } }),
    vendorChoices(),
  ]);

  // A job not on the map yet: the map starts near another job (in the same city if there is one).
  const near =
    project.siteLat == null
      ? ((project.city ? await db.project.findFirst({ where: { city: project.city, siteLat: { not: null } }, select: { siteLat: true, siteLng: true } }) : null) ??
        (await db.project.findFirst({ where: { siteLat: { not: null } }, orderBy: { updatedAt: "desc" }, select: { siteLat: true, siteLng: true } })))
      : null;
  const warnOf = new Map(choices.map((v) => [v.id, v.warn]));

  const progress = avgTaskProgress(tasks);
  const upcomingTasks = tasks.filter((t) => t.percentComplete < 100).slice(0, 6);
  const client = project.client;
  const waiting = pendingSelections.length + pendingChangeOrders.length;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {sees("budget") ? (
          <>
            <Tile label="Contract" value={money(financials.contract, true)} />
            <Tile
              label="Costs to date"
              value={money(financials.spent, true)}
              tone={financials.contract > 0 && financials.spent > financials.contract ? "bad" : undefined}
              hint={financials.contract > 0 ? `${num((financials.spent / financials.contract) * 100, 0)}% of contract` : undefined}
            />
          </>
        ) : null}
        {sees("invoices") ? (
          <>
            <Tile label="Invoiced" value={money(financials.invoiced, true)} hint={`${money(financials.remainingToInvoice, true)} left to bill`} />
            <Tile label="Paid" value={money(financials.paid, true)} tone="good" />
            <Tile label="Balance due" value={money(financials.outstanding, true)} tone={financials.outstanding > 0 ? "warn" : undefined} />
          </>
        ) : null}
        {sees("field") ? <Tile label="Schedule" value={`${progress}%`} hint={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`} /> : null}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <JobDetails
          job={{
            id: project.id,
            name: project.name,
            type: project.type,
            isSpec: project.isSpec,
            status: project.status,
            clientId: project.clientId,
            managerId: project.managerId,
            address: project.address,
            city: project.city,
            state: project.state,
            zip: project.zip,
            startDate: project.startDate,
            actualEndDate: project.actualEndDate,
            description: project.description,
          }}
          client={client ? { id: client.id, name: `${client.firstName} ${client.lastName}`, company: client.company, phone: client.phone, email: client.email } : null}
          clients={clients.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ""}` }))}
          managers={managers}
          teamIds={team.map((t) => t.userId)}
          startEditing={edit === "1"}
        />
        <div className="space-y-4">
          <JobSite
            site={project.siteLat != null && project.siteLng != null ? { lat: project.siteLat, lng: project.siteLng, from: project.siteFrom } : null}
            hasAddress={!!project.address?.trim()}
            set={setJobSite.bind(null, project.id)}
            pin={{ id: project.id, name: project.name, address: siteAddressOf(project) }}
            move={moveJobPin}
            near={near ? { lat: near.siteLat!, lng: near.siteLng! } : undefined}
            extra={<Directions to={{ lat: project.siteLat, lng: project.siteLng, address: siteAddressOf(project) }} small />}
          />
          <JobVendors
            projectId={project.id}
            vendors={vendors
              .map((v) => ({ id: v.id, name: v.name, hasLogin: v._count.logins > 0, warn: warnOf.get(v.id) || undefined }))
              .sort((a, b) => Number(b.hasLogin) - Number(a.hasLogin) || a.name.localeCompare(b.name))}
            picked={picked.map((p) => p.vendorId)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {sees("field") ? (
          <Box title="Upcoming tasks" note={`${tasks.length} on the schedule`} href={`${base}/schedule`} link="Schedule">
            {upcomingTasks.length === 0 ? (
              <Empty>{tasks.length === 0 ? "No schedule yet." : "All tasks complete."}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 px-4 py-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">
                        {t.name}
                        {t.isMilestone ? <span className="ml-2 text-xs text-violet-700">Milestone</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.phase} · {fmtDate(t.startDate, "MMM d")} – {fmtDate(t.endDate, "MMM d")}
                      </p>
                    </div>
                    <div className="w-20">
                      <Progress value={t.percentComplete} color={t.color} />
                    </div>
                    <span className="w-8 text-right text-xs text-slate-600 tabular-nums">{t.percentComplete}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        ) : null}

        {sees("selections") ? (
          <Box title="Waiting on the client" note={waiting ? `${waiting}` : undefined}>
            {waiting === 0 ? (
              <Empty>Nothing waiting on the client.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingSelections.map((s) => (
                  <li key={s.id}>
                    <Link href={`${base}/selections`} className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900">{s.title}</p>
                        <p className="text-xs text-slate-500">
                          Selection · {s.category}
                          {s.dueDate ? <span className={s.dueDate < now && s.status === "PENDING" ? "text-rose-600" : ""}> · due {fmtDate(s.dueDate, "MMM d")}</span> : null}
                        </p>
                      </div>
                      <Badge status={s.status} />
                    </Link>
                  </li>
                ))}
                {pendingChangeOrders.map((co) => (
                  <li key={co.id}>
                    <Link href={`${base}/change-orders`} className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900">
                          CO #{co.number} · {co.title}
                        </p>
                        <p className="text-xs text-slate-500">Change order · {money(changeOrderTotals(co, co.items).total)}</p>
                      </div>
                      <Badge status={co.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-4 border-t border-slate-100 px-4 py-2">
              <Link href={`${base}/selections`} className="text-xs font-medium text-blue-700 hover:underline">
                Selections
              </Link>
              <Link href={`${base}/change-orders`} className="text-xs font-medium text-blue-700 hover:underline">
                Change orders
              </Link>
            </div>
          </Box>
        ) : null}

        {sees("field") ? (
          <Box title="Open to-dos" href={`${base}/todos`} link="To-dos">
            {openTodos.length === 0 ? (
              <Empty>No open to-dos.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {openTodos.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 px-4 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{t.title}</p>
                      <p className="text-xs text-slate-500">
                        {t.assignee?.name ?? "Unassigned"}
                        {t.dueDate ? <span className={t.dueDate < now ? "text-rose-600" : ""}> · due {fmtDate(t.dueDate, "MMM d")}</span> : null}
                      </p>
                    </div>
                    {t.priority === "HIGH" ? <Badge status="HIGH" /> : null}
                  </li>
                ))}
              </ul>
            )}
          </Box>
        ) : null}

        {sees("field") ? (
          <Box title="Recent daily logs" href={`${base}/daily-logs`} link="Daily logs">
            {dailyLogs.length === 0 ? (
              <Empty>No daily logs yet.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dailyLogs.map((l) => (
                  <li key={l.id} className="px-4 py-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">{fmtDate(l.date, "EEE, MMM d")}</p>
                      <p className="text-xs text-slate-500">{[l.weather, l.crewCount ? `${l.crewCount} crew` : null, l.author?.name].filter(Boolean).join(" · ")}</p>
                    </div>
                    <p className="line-clamp-2 text-sm text-slate-600">{l.workCompleted || "No work notes."}</p>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        ) : null}

        <Box title="Recent activity">
          {activities.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.map((a) => (
                <li key={a.id} className="px-4 py-1.5">
                  <p className="text-sm text-slate-900">{a.description}</p>
                  <p className="text-xs text-slate-500">
                    {a.user?.name ?? "System"} · {timeAgo(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>

      {user.role === "ADMIN" ? (
        <div className="flex justify-end">
          <ConfirmForm
            action={deleteProject}
            hidden={{ id: project.id }}
            variant="ghost"
            message={`Delete job #${project.number} "${project.name}" and everything in it — estimates, selections, change orders, schedule, invoices, logs, files and messages? This can't be undone.`}
          >
            <span className="inline-flex items-center gap-1 text-xs text-rose-600">
              <Trash2 className="h-3.5 w-3.5" /> Delete job
            </span>
          </ConfirmForm>
        </div>
      ) : null}
    </div>
  );
}
