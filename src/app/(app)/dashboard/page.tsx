import Link from "next/link";
import { addDays } from "date-fns";
import { AlertTriangle, CalendarDays, CheckSquare, ClipboardList, FileInput, FolderKanban, LayoutGrid, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { contractValue } from "@/lib/projects";
import { scheduleProgressByProject } from "@/lib/project-progress";
import { cn, fmtDate, money, timeAgo } from "@/lib/utils";
import { billTotal, coverageWarning, vendorsCoverage } from "@/lib/purchasing";
import { ACTIVE, agingRows, canSeeReports, cashFlow, jobRows, sumRows } from "@/lib/reports";
import { AGING_BUCKETS } from "@/lib/report-math";
import { availableCards, DASHBOARD_CARDS, pickedCards } from "@/lib/dashboard-cards";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Progress, Stat } from "@/components/ui";
import { Signed, pctText } from "../reports/_parts";
import { completeTodo } from "./actions";
import { CustomizeDashboard } from "./customize";

const SPAN: Record<string, string> = { full: "lg:col-span-3", wide: "lg:col-span-2", narrow: "" };

const seeAll = (href: string, label: string) => (
  <Link href={href} className="text-sm font-medium text-blue-700 hover:underline">
    {label}
  </Link>
);

export default async function DashboardPage() {
  const user = await requireStaff();
  const reports = canSeeReports(user);
  const me = await db.user.findUnique({ where: { id: user.id }, select: { dashboardCards: true } });
  const cards = pickedCards(me?.dashboardCards, reports);
  const want = (k: string) => cards.includes(k);
  const now = new Date();

  // Only what the picked cards need is loaded.
  const [cardStats, cardProjects, cardVendors, cardAttention, cardTodos, cardSchedule, cardActivity, cardProfit, cardCash, cardAging] = await Promise.all([
    want("stats") ? statsData(user.id, now) : null,
    want("projects") ? projectsData() : null,
    want("vendors") ? vendorsData() : null,
    want("attention") ? attentionData(now) : null,
    want("todos")
      ? db.todo.findMany({
          where: { assigneeId: user.id, status: "OPEN" },
          include: { project: { select: { id: true, name: true } } },
          orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
        })
      : null,
    want("schedule")
      ? db.scheduleTask.findMany({
          where: { startDate: { gte: now, lte: addDays(now, 7) } },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { startDate: "asc" },
          take: 12,
        })
      : null,
    want("activity")
      ? db.activity.findMany({ include: { user: { select: { name: true } }, project: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 12 })
      : null,
    want("profit") || want("wip") ? jobRows(ACTIVE) : null,
    want("cash") ? cashFlow("week", now) : null,
    want("aging") ? agingRows(now) : null,
  ]);

  const render: Record<string, () => React.ReactNode> = {
    stats: () => {
      const s = cardStats!;
      return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Active projects" value={s.activeCount} hint="Contracted, in progress or on hold" />
          <Stat label="Active contract value" value={money(s.activeContractTotal, true)} hint="Approved estimates + change orders" />
          <Stat label="Outstanding receivables" value={money(s.receivables, true)} tone={s.receivables > 0 ? "warn" : "default"} hint="Invoiced, not yet paid" />
          <Stat label="My open to-dos" value={s.myOpen} hint={`${s.myOverdue} overdue`} />
          <Stat
            label="Pending client approvals"
            value={s.pendingSelections + s.pendingCOs}
            tone={s.pendingSelections + s.pendingCOs > 0 ? "warn" : "default"}
            hint={`${s.pendingSelections} selections · ${s.pendingCOs} change orders`}
          />
        </div>
      );
    },
    projects: () => {
      const { activeProjects, contractValues, progressMap } = cardProjects!;
      return (
        <Card>
          <CardHeader title="Active projects" description={`${activeProjects.length} in flight`} actions={seeAll("/projects", "All projects")} />
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
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      );
    },
    vendors: () => {
      const { insuranceWarnings, billsWaiting } = cardVendors!;
      return (
        <Card>
          <CardHeader title="Subs & vendors" description="Bills to approve and insurance running out" />
          {!insuranceWarnings.length && !billsWaiting.length ? (
            <CardBody>
              <p className="flex items-center gap-2 text-sm text-emerald-800">
                <ShieldCheck className="h-4 w-4" /> All clear — no bills waiting, insurance up to date.
              </p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {billsWaiting.length ? (
                <li className="px-5 py-2.5">
                  <Link href="/bills" className="flex items-center gap-2 font-medium text-slate-900 hover:text-blue-700">
                    <FileInput className="h-4 w-4 text-amber-600" />
                    {billsWaiting.length} bill{billsWaiting.length === 1 ? "" : "s"} waiting for approval · {money(billsWaiting.reduce((n, b) => n + billTotal(b.lines), 0))}
                  </Link>
                </li>
              ) : null}
              {insuranceWarnings.map((w) => (
                <li key={w.vendor.id} className="px-5 py-2.5">
                  <Link href={`/settings/vendors/${w.vendor.id}`} className="flex items-start gap-2 hover:text-blue-700">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      <span className="font-medium text-slate-900">{w.vendor.name}</span>
                      <span className="block text-xs text-slate-600">{w.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      );
    },
    attention: () => (
      <Card>
        <CardHeader title="Needs attention" description="Overdue selections, pending change orders, late to-dos and past-due invoices" />
        {cardAttention!.length === 0 ? (
          <CardBody>
            <EmptyState icon={AlertTriangle} title="All clear" description="Nothing is overdue or waiting on a decision." />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cardAttention!.map((a) => (
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
    ),
    todos: () => {
      const todos = cardTodos!;
      return (
        <Card>
          <CardHeader title="My to-dos" description={`${todos.length} open`} actions={seeAll("/todos", "All to-dos")} />
          {todos.length === 0 ? (
            <CardBody>
              <EmptyState icon={CheckSquare} title="You're all caught up" />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todos.slice(0, 8).map((t) => {
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
                        {t.dueDate ? <span className={overdue ? "ml-2 text-rose-600" : "ml-2"}>Due {fmtDate(t.dueDate, "MMM d")}</span> : null}
                      </p>
                    </div>
                    {t.priority === "HIGH" ? <Badge status="HIGH" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      );
    },
    schedule: () => (
      <Card>
        <CardHeader title="Upcoming schedule" description="Tasks starting in the next 7 days" actions={seeAll("/schedule", "Look-ahead")} />
        {cardSchedule!.length === 0 ? (
          <CardBody>
            <EmptyState icon={CalendarDays} title="Nothing starting this week" />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cardSchedule!.map((t) => (
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
    ),
    activity: () => (
      <Card>
        <CardHeader title="Recent activity" />
        {cardActivity!.length === 0 ? (
          <CardBody>
            <EmptyState icon={ClipboardList} title="No activity yet" />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cardActivity!.map((a) => (
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
    ),
    profit: () => {
      const rows = cardProfit!;
      const t = sumRows(rows);
      return (
        <Card>
          <CardHeader
            title="Job profit"
            description={`Active jobs heading for ${money(t.projectedProfit, true)} (${pctText(t.projectedMargin)})`}
            actions={seeAll("/reports", "Report")}
          />
          {rows.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">No active jobs.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Job</th>
                    <th className="hidden px-3 py-2 text-right font-medium xl:table-cell">Contract</th>
                    <th className="px-3 py-2 text-right font-medium">Heading for</th>
                    <th className="px-5 py-2 text-right font-medium">vs. bid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="max-w-[12rem] truncate px-5 py-2">
                        <Link href={`/projects/${r.id}/budget`} className="font-medium text-slate-900 hover:text-blue-700">
                          {r.name}
                        </Link>
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums xl:table-cell">{money(r.contract, true)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Signed value={r.projectedProfit} /> <span className="text-xs text-slate-500">{pctText(r.projectedMargin)}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2 text-right">
                        {r.fade < -0.5 ? <Signed value={r.fade} className="font-semibold" /> : <span className="text-xs text-emerald-700">on bid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      );
    },
    wip: () => {
      const rows = cardProfit!;
      const t = sumRows(rows);
      const under = rows.filter((r) => r.overUnder < -0.5).sort((a, b) => a.overUnder - b.overUnder);
      return (
        <Card>
          <CardHeader title="Over / under billing" actions={seeAll("/reports/wip", "WIP")} />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Over-billed</p>
                <p className="text-lg font-semibold tabular-nums text-amber-700">{money(t.overBilled, true)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Under-billed</p>
                <p className="text-lg font-semibold tabular-nums text-rose-700">{money(Math.abs(t.underBilled), true)}</p>
              </div>
            </div>
            {under.length ? (
              <ul className="space-y-1 text-sm">
                {under.slice(0, 4).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="tabular-nums text-rose-700">{money(-r.overUnder, true)}</span>
                    <Link href={`/projects/${r.id}/invoices/new`} className="text-xs font-medium text-blue-700 hover:underline">
                      Bill it
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No job is behind on billing.</p>
            )}
          </CardBody>
        </Card>
      );
    },
    cash: () => {
      const ahead = cardCash!.filter((r) => !r.past).slice(0, 5);
      const inn = ahead.reduce((n, r) => n + r.in + r.expectedIn, 0);
      const out = ahead.reduce((n, r) => n + r.out + r.expectedOut, 0);
      const scale = Math.max(1, inn, out);
      return (
        <Card>
          <CardHeader title="Cash next 30 days" description="This week and the next four" actions={seeAll("/reports/cash-flow?by=week", "Cash flow")} />
          <CardBody className="space-y-3 text-sm">
            {[
              { label: "Coming in", value: inn, bar: "bg-emerald-500" },
              { label: "Going out", value: out, bar: "bg-rose-500" },
            ].map((x) => (
              <div key={x.label}>
                <div className="flex justify-between">
                  <span className="text-slate-600">{x.label}</span>
                  <span className="font-medium tabular-nums">{money(x.value, true)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
                  <div className={cn("h-full", x.bar)} style={{ width: `${(x.value / scale) * 100}%` }} />
                </div>
              </div>
            ))}
            <p className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
              <span>Net</span>
              <Signed value={inn - out} />
            </p>
          </CardBody>
        </Card>
      );
    },
    aging: () => {
      const rows = cardAging!;
      const total = rows.reduce((n, r) => n + r.balance, 0);
      return (
        <Card>
          <CardHeader
            title="What clients owe"
            description={`${money(total, true)} on ${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
            actions={seeAll("/reports/aging", "Aging")}
          />
          <CardBody>
            <ul className="space-y-1.5 text-sm">
              {AGING_BUCKETS.map((b) => {
                const v = rows.filter((r) => r.bucket === b.key).reduce((n, r) => n + r.balance, 0);
                return (
                  <li key={b.key} className="flex justify-between">
                    <span className="text-slate-600">{b.label}</span>
                    <span className={cn("tabular-nums", v > 0.5 && b.key !== "current" && (b.key === "d30" ? "text-amber-700" : "font-semibold text-rose-700"))}>
                      {money(v, true)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      );
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name.split(" ")[0]}. Here's what's happening across your jobs.`}
        actions={<CustomizeDashboard cards={availableCards(reports)} picked={cards} />}
      />
      {cards.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="Your dashboard is empty" description="Use Customize to pick the cards you want." />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-flow-dense lg:grid-cols-3">
          {cards.map((k) => (
            <div key={k} className={SPAN[DASHBOARD_CARDS.find((c) => c.key === k)?.size ?? "narrow"]}>
              {render[k]?.()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- What each card loads ---------------------------------------------------------------------

async function statsData(userId: string, now: Date) {
  const [active, invoices, myOpen, myOverdue, pendingSelections, pendingCOs] = await Promise.all([
    db.project.findMany({ where: { status: { in: ACTIVE } }, select: { id: true, contractAmount: true } }),
    db.invoice.findMany({ where: { status: { not: "VOID" } }, include: { items: true, payments: true } }),
    db.todo.count({ where: { assigneeId: userId, status: "OPEN" } }),
    db.todo.count({ where: { assigneeId: userId, status: "OPEN", dueDate: { lt: now } } }),
    db.selection.count({ where: { status: { in: ["PENDING", "CHOSEN"] } } }),
    db.changeOrder.count({ where: { status: "PENDING_APPROVAL" } }),
  ]);
  const values = await Promise.all(active.map((p) => contractValue(p.id, p.contractAmount)));
  const receivables = invoices.reduce((s, inv) => s + inv.items.reduce((t, i) => t + i.quantity * i.unitPrice, 0) - inv.payments.reduce((t, p) => t + p.amount, 0), 0);
  return { activeCount: active.length, activeContractTotal: values.reduce((s, v) => s + v, 0), receivables, myOpen, myOverdue, pendingSelections, pendingCOs };
}

async function projectsData() {
  const activeProjects = await db.project.findMany({
    where: { status: { in: ACTIVE } },
    include: { client: { select: { firstName: true, lastName: true } } },
    orderBy: [{ status: "asc" }, { startDate: "asc" }],
  });
  const [contractValues, progressMap] = await Promise.all([
    Promise.all(activeProjects.map((p) => contractValue(p.id, p.contractAmount))),
    scheduleProgressByProject(activeProjects.map((p) => p.id)),
  ]);
  return { activeProjects, contractValues, progressMap };
}

async function vendorsData() {
  const [coverage, billsWaiting] = await Promise.all([vendorsCoverage(), db.vendorBill.findMany({ where: { status: "PENDING" }, include: { lines: true } })]);
  const insuranceWarnings = coverage
    .filter((c) => c.state && (!c.state.ok || c.state.unconfirmed))
    .map((c) => ({
      vendor: c.vendor,
      text: [c.state && !c.state.ok ? coverageWarning(c.state, (d) => fmtDate(d, "MMM d")) : "", c.state?.unconfirmed ? "they uploaded a certificate to confirm" : ""]
        .filter(Boolean)
        .join(" · "),
    }));
  return { insuranceWarnings, billsWaiting };
}

async function attentionData(now: Date) {
  const [pendingChangeOrders, overdueSelections, overdueTodos, overdueInvoices] = await Promise.all([
    db.changeOrder.findMany({ where: { status: "PENDING_APPROVAL" }, include: { project: { select: { id: true, name: true } } }, orderBy: { sentAt: "asc" } }),
    db.selection.findMany({ where: { status: "PENDING", dueDate: { lt: now } }, include: { project: { select: { id: true, name: true } } }, orderBy: { dueDate: "asc" } }),
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
  ]);
  type Attention = { key: string; label: string; detail: string; href: string; tone: string; date: Date | null };
  const list: Attention[] = [
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
      const balance = inv.items.reduce((t, i) => t + i.quantity * i.unitPrice, 0) - inv.payments.reduce((t, p) => t + p.amount, 0);
      return {
        key: `inv-${inv.id}`,
        label: `Invoice #${inv.number} past due · ${money(balance)}`,
        detail: inv.project.name,
        href: `/projects/${inv.projectId}/invoices`,
        tone: "Invoice",
        date: inv.dueDate,
      };
    }),
  ];
  return list.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
}
