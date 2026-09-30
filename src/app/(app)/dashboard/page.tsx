import Link from "next/link";
import { addDays } from "date-fns";
import { AlertTriangle, CalendarDays, CheckSquare, ClipboardList, FolderKanban } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { contractValue } from "@/lib/projects";
import { scheduleProgressByProject } from "@/lib/project-progress";
import { fmtDate, money, timeAgo } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  Stat,
} from "@/components/ui";
import { completeTodo } from "./actions";

const ACTIVE_STATUSES = ["CONTRACTED", "IN_PROGRESS", "ON_HOLD"];

export default async function DashboardPage() {
  const user = await requireStaff();
  const now = new Date();
  const weekOut = addDays(now, 7);

  const [
    activeProjects,
    invoices,
    myOpenTodos,
    pendingSelectionsCount,
    pendingChangeOrders,
    overdueSelections,
    overdueTodos,
    overdueInvoices,
    upcomingTasks,
    activities,
  ] = await Promise.all([
    db.project.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: [{ status: "asc" }, { targetEndDate: "asc" }],
    }),
    db.invoice.findMany({
      where: { status: { not: "VOID" } },
      include: { items: true, payments: true },
    }),
    db.todo.findMany({
      where: { assigneeId: user.id, status: "OPEN" },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    }),
    db.selection.count({ where: { status: { in: ["PENDING", "CHOSEN"] } } }),
    db.changeOrder.findMany({
      where: { status: "PENDING_APPROVAL" },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { sentAt: "asc" },
    }),
    db.selection.findMany({
      where: { status: "PENDING", dueDate: { lt: now } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.todo.findMany({
      where: { status: "OPEN", dueDate: { lt: now } },
      include: { project: { select: { id: true, name: true } }, assignee: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.invoice.findMany({
      where: { status: "SENT", dueDate: { lt: now } },
      include: { project: { select: { id: true, name: true } }, items: true, payments: true },
      orderBy: { dueDate: "asc" },
    }),
    db.scheduleTask.findMany({
      where: { startDate: { gte: now, lte: weekOut } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
      take: 12,
    }),
    db.activity.findMany({
      include: { user: { select: { name: true } }, project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const [contractValues, progressMap] = await Promise.all([
    Promise.all(activeProjects.map((p) => contractValue(p.id, p.contractAmount))),
    scheduleProgressByProject(activeProjects.map((p) => p.id)),
  ]);
  const activeContractTotal = contractValues.reduce((s, v) => s + v, 0);

  const receivables = invoices.reduce((s, inv) => {
    const billed = inv.items.reduce((t, i) => t + i.quantity * i.unitPrice, 0);
    const paid = inv.payments.reduce((t, p) => t + p.amount, 0);
    return s + (billed - paid);
  }, 0);

  const pendingApprovals = pendingSelectionsCount + pendingChangeOrders.length;

  type Attention = { key: string; label: string; detail: string; href: string; tone: string; date: Date | null };
  const attention: Attention[] = [
    ...overdueSelections.map((s) => ({
      key: `sel-${s.id}`,
      label: `Selection overdue: ${s.title}`,
      detail: s.project.name,
      href: `/projects/${s.projectId}/selections`,
      tone: "Selection",
      date: s.dueDate,
    })),
    ...pendingChangeOrders.map((co) => ({
      key: `co-${co.id}`,
      label: `CO #${co.number} awaiting approval: ${co.title}`,
      detail: co.project.name,
      href: `/projects/${co.projectId}/change-orders`,
      tone: "Change order",
      date: co.sentAt,
    })),
    ...overdueTodos.map((t) => ({
      key: `todo-${t.id}`,
      label: `To-do overdue: ${t.title}`,
      detail: [t.project?.name, t.assignee?.name].filter(Boolean).join(" · ") || "Unassigned",
      href: t.projectId ? `/projects/${t.projectId}/todos` : "/todos",
      tone: "To-do",
      date: t.dueDate,
    })),
    ...overdueInvoices.map((inv) => {
      const balance =
        inv.items.reduce((t, i) => t + i.quantity * i.unitPrice, 0) -
        inv.payments.reduce((t, p) => t + p.amount, 0);
      return {
        key: `inv-${inv.id}`,
        label: `Invoice #${inv.number} past due · ${money(balance)}`,
        detail: inv.project.name,
        href: `/projects/${inv.projectId}/invoices`,
        tone: "Invoice",
        date: inv.dueDate,
      };
    }),
  ].sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const myNextTodos = myOpenTodos.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Welcome back, ${user.name.split(" ")[0]}. Here's what's happening across your jobs.`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Active projects" value={activeProjects.length} hint="Contracted, in progress or on hold" />
        <Stat label="Active contract value" value={money(activeContractTotal, true)} hint="Approved estimates + change orders" />
        <Stat
          label="Outstanding receivables"
          value={money(receivables, true)}
          tone={receivables > 0 ? "warn" : "default"}
          hint="Invoiced, not yet paid"
        />
        <Stat label="My open to-dos" value={myOpenTodos.length} hint={`${overdueTodos.filter((t) => t.assigneeId === user.id).length} overdue`} />
        <Stat
          label="Pending client approvals"
          value={pendingApprovals}
          tone={pendingApprovals > 0 ? "warn" : "default"}
          hint={`${pendingSelectionsCount} selections · ${pendingChangeOrders.length} change orders`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Active projects"
              description={`${activeProjects.length} in flight`}
              actions={
                <Link href="/projects" className="text-sm font-medium text-blue-700 hover:underline">
                  All projects
                </Link>
              }
            />
            {activeProjects.length === 0 ? (
              <CardBody>
                <EmptyState icon={FolderKanban} title="No active projects" description="Projects show here once they are contracted." />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activeProjects.map((p, i) => {
                  const progress = progressMap.get(p.id) ?? 0;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/projects/${p.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-blue-700">
                          <span className="text-slate-400">#{p.number}</span> {p.name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {p.client ? `${p.client.firstName} ${p.client.lastName}` : "No client"} · {money(contractValues[i], true)}
                        </p>
                      </div>
                      <Badge status={p.status} />
                      <div className="w-32">
                        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                          <span>Schedule</span>
                          <span className="tabular-nums">{progress}%</span>
                        </div>
                        <Progress value={progress} />
                      </div>
                      <div className="w-28 text-right text-xs text-slate-500">
                        <span className="block text-[11px] uppercase tracking-wide">Target end</span>
                        <span className="text-slate-700">{fmtDate(p.targetEndDate)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Needs attention"
              description="Overdue selections, pending change orders, late to-dos and past-due invoices"
            />
            {attention.length === 0 ? (
              <CardBody>
                <EmptyState icon={AlertTriangle} title="All clear" description="Nothing is overdue or waiting on a decision." />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900">{a.label}</p>
                        <p className="truncate text-xs text-slate-500">{a.detail}</p>
                      </div>
                      <Badge>{a.tone}</Badge>
                      <span className="w-24 text-right text-xs text-slate-500">{a.date ? fmtDate(a.date) : "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Upcoming schedule" description="Tasks starting in the next 7 days" />
            {upcomingTasks.length === 0 ? (
              <CardBody>
                <EmptyState icon={CalendarDays} title="Nothing starting this week" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcomingTasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/projects/${t.projectId}/schedule`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900">
                          {t.name}
                          {t.isMilestone ? <span className="ml-2 text-xs text-violet-700">Milestone</span> : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {t.project.name} · {t.phase}
                        </p>
                      </div>
                      <span className="text-xs text-slate-600 tabular-nums">
                        {fmtDate(t.startDate, "MMM d")} – {fmtDate(t.endDate, "MMM d")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="My to-dos"
              description={`${myOpenTodos.length} open`}
              actions={
                <Link href="/todos" className="text-sm font-medium text-blue-700 hover:underline">
                  All to-dos
                </Link>
              }
            />
            {myNextTodos.length === 0 ? (
              <CardBody>
                <EmptyState icon={CheckSquare} title="You're all caught up" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {myNextTodos.map((t) => {
                  const overdue = t.dueDate ? t.dueDate < now : false;
                  return (
                    <li key={t.id} className="flex items-start gap-3 px-5 py-2.5">
                      <form action={completeTodo} className="pt-0.5">
                        <input type="hidden" name="id" value={t.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 rounded-full border border-slate-300 p-0 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                          title="Mark complete"
                          aria-label={`Complete ${t.title}`}
                        >
                          <span className="sr-only">Complete</span>
                        </Button>
                      </form>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-900">{t.title}</p>
                        <p className="text-xs text-slate-500">
                          {t.project ? (
                            <Link href={`/projects/${t.project.id}/todos`} className="hover:underline">
                              {t.project.name}
                            </Link>
                          ) : (
                            "General"
                          )}
                          {t.dueDate ? (
                            <span className={overdue ? "ml-2 text-rose-600" : "ml-2"}>
                              Due {fmtDate(t.dueDate, "MMM d")}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {t.priority === "HIGH" ? <Badge status="HIGH" /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            {activities.length === 0 ? (
              <CardBody>
                <EmptyState icon={ClipboardList} title="No activity yet" />
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activities.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <p className="text-sm text-slate-900">{a.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.user?.name ?? "System"}
                      {a.project ? (
                        <>
                          {" · "}
                          <Link href={`/projects/${a.project.id}`} className="hover:underline">
                            {a.project.name}
                          </Link>
                        </>
                      ) : null}
                      {" · "}
                      {timeAgo(a.createdAt)}
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
