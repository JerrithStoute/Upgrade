import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, projectFinancials } from "@/lib/projects";
import { avgTaskProgress } from "@/lib/project-progress";
import { fmtDate, linePrice, money, num, timeAgo, titleCase } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, Progress, Stat } from "@/components/ui";

function TabLink({ href, children = "View all" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-blue-700 hover:underline">
      {children}
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-sm text-slate-500">{children}</p>;
}

export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const base = `/projects/${project.id}`;
  const now = new Date();

  const [financials, tasks, pendingSelections, pendingChangeOrders, openTodos, dailyLogs, activities] = await Promise.all([
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
      take: 10,
    }),
  ]);

  const progress = avgTaskProgress(tasks);
  const upcomingTasks = tasks.filter((t) => t.percentComplete < 100).slice(0, 6);
  const daysRemaining = project.targetEndDate ? differenceInCalendarDays(project.targetEndDate, now) : null;
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", "), project.zip].filter(Boolean).join(" · ");
  const client = project.client;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="Contract value" value={money(financials.contract, true)} />
        <Stat
          label="Costs to date"
          value={money(financials.spent, true)}
          tone={financials.contract > 0 && financials.spent > financials.contract ? "bad" : "default"}
          hint={financials.contract > 0 ? `${num((financials.spent / financials.contract) * 100, 0)}% of contract` : undefined}
        />
        <Stat label="Invoiced" value={money(financials.invoiced, true)} hint={`${money(financials.remainingToInvoice, true)} left to bill`} />
        <Stat label="Paid" value={money(financials.paid, true)} tone="good" />
        <Stat label="Balance due" value={money(financials.outstanding, true)} tone={financials.outstanding > 0 ? "warn" : "default"} />
        <Stat
          label="Schedule"
          value={`${progress}%`}
          hint={
            <span className="block">
              <Progress value={progress} className="mb-1" />
              {daysRemaining === null
                ? "No target end date"
                : daysRemaining < 0
                  ? `${Math.abs(daysRemaining)} days past target`
                  : `${daysRemaining} days remaining`}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" actions={<TabLink href={`${base}/edit`}>Edit</TabLink>} />
            <CardBody>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Type</dt>
                  <dd className="text-slate-900">{titleCase(project.type)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Square feet</dt>
                  <dd className="text-slate-900">{project.squareFeet ? num(project.squareFeet, 0) : "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Address</dt>
                  <dd className="text-slate-900">{address || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Start</dt>
                  <dd className="text-slate-900">{fmtDate(project.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Target end</dt>
                  <dd className="text-slate-900">
                    {fmtDate(project.targetEndDate)}
                    {project.actualEndDate ? <span className="text-slate-500"> · actual {fmtDate(project.actualEndDate)}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Project manager</dt>
                  <dd className="text-slate-900">{project.manager?.name ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Client</dt>
                  <dd className="text-slate-900">
                    {client ? (
                      <>
                        <Link href={`/clients/${client.id}`} className="font-medium hover:text-blue-700">
                          {client.firstName} {client.lastName}
                        </Link>
                        {client.company ? <span className="text-slate-500"> · {client.company}</span> : null}
                        <span className="block text-xs text-slate-500">
                          {[client.phone, client.email].filter(Boolean).join(" · ") || "No contact info"}
                        </span>
                      </>
                    ) : (
                      "No client"
                    )}
                  </dd>
                </div>
                {project.description ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Description</dt>
                    <dd className="whitespace-pre-line text-slate-700">{project.description}</dd>
                  </div>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Upcoming tasks"
              description={`${tasks.length} tasks on the schedule`}
              actions={<TabLink href={`${base}/schedule`}>Schedule</TabLink>}
            />
            {upcomingTasks.length === 0 ? (
              <Empty>{tasks.length === 0 ? "No schedule yet." : "All tasks complete."}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">
                        {t.name}
                        {t.isMilestone ? <span className="ml-2 text-xs text-violet-700">Milestone</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.phase} · {fmtDate(t.startDate, "MMM d")} – {fmtDate(t.endDate, "MMM d")}
                      </p>
                    </div>
                    <div className="w-24">
                      <Progress value={t.percentComplete} color={t.color} />
                    </div>
                    <span className="w-8 text-right text-xs text-slate-600 tabular-nums">{t.percentComplete}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent daily logs" actions={<TabLink href={`${base}/daily-logs`}>Daily logs</TabLink>} />
            {dailyLogs.length === 0 ? (
              <Empty>No daily logs yet.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dailyLogs.map((l) => (
                  <li key={l.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">{fmtDate(l.date, "EEE, MMM d")}</p>
                      <p className="text-xs text-slate-500">
                        {[l.weather, l.crewCount ? `${l.crewCount} crew` : null, l.author?.name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{l.workCompleted || "No work notes."}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Client approvals"
              description={`${pendingSelections.length + pendingChangeOrders.length} waiting`}
            />
            {pendingSelections.length === 0 && pendingChangeOrders.length === 0 ? (
              <Empty>Nothing waiting on the client.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pendingSelections.map((s) => (
                  <li key={s.id}>
                    <Link href={`${base}/selections`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900">{s.title}</p>
                        <p className="text-xs text-slate-500">
                          Selection · {s.category}
                          {s.dueDate ? (
                            <span className={s.dueDate < now && s.status === "PENDING" ? "text-rose-600" : ""}> · due {fmtDate(s.dueDate, "MMM d")}</span>
                          ) : null}
                        </p>
                      </div>
                      <Badge status={s.status} />
                    </Link>
                  </li>
                ))}
                {pendingChangeOrders.map((co) => (
                  <li key={co.id}>
                    <Link href={`${base}/change-orders`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900">
                          CO #{co.number} · {co.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          Change order · {money(co.items.reduce((s, i) => s + linePrice(i), 0))}
                        </p>
                      </div>
                      <Badge status={co.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-4 border-t border-slate-100 px-5 py-2.5">
              <TabLink href={`${base}/selections`}>Selections</TabLink>
              <TabLink href={`${base}/change-orders`}>Change orders</TabLink>
            </div>
          </Card>

          <Card>
            <CardHeader title="Open to-dos" actions={<TabLink href={`${base}/todos`}>To-dos</TabLink>} />
            {openTodos.length === 0 ? (
              <Empty>No open to-dos.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {openTodos.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
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
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            {activities.length === 0 ? (
              <Empty>No activity yet.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activities.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <p className="text-sm text-slate-900">{a.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.user?.name ?? "System"} · {timeAgo(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
