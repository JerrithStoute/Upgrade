import Link from "next/link";
import { ArrowRight, CalendarDays, FolderKanban, MapPin, Phone, Mail, ClipboardCheck } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext, portalHref, scheduleProgress, invoiceTotals } from "@/lib/portal";
import { fmtDate, money, timeAgo, linePrice, sum } from "@/lib/utils";
import { Badge, Card, CardHeader, CardBody, EmptyState, Progress } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Home" };

export default async function PortalHomePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);
  const firstName = user.name.split(/[\s&]+/)[0] ?? user.name;

  if (!project) {
    return (
      <>
        <PortalPageHeader title={`Welcome, ${firstName}`} projects={projects} project={null} />
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Once your builder links a project to your account it will appear here."
        />
      </>
    );
  }

  const [tasks, selections, changeOrders, invoices, logs, messages] = await Promise.all([
    db.scheduleTask.findMany({ where: { projectId: project.id }, select: { startDate: true, endDate: true, percentComplete: true } }),
    db.selection.findMany({
      where: { projectId: project.id, status: { in: ["PENDING", "CHOSEN"] } },
      orderBy: [{ dueDate: "asc" }, { title: "asc" }],
      select: { id: true, title: true, status: true, dueDate: true, category: true },
    }),
    db.changeOrder.findMany({
      where: { projectId: project.id, status: "PENDING_APPROVAL" },
      orderBy: { number: "asc" },
      include: { items: true },
    }),
    db.invoice.findMany({
      where: { projectId: project.id, status: { in: ["SENT", "PARTIAL"] } },
      orderBy: { issueDate: "asc" },
      include: { items: true, payments: true },
    }),
    db.dailyLog.findMany({
      where: { projectId: project.id, clientVisible: true },
      orderBy: { date: "desc" },
      take: 5,
      select: { id: true, date: true, workCompleted: true, weather: true },
    }),
    db.message.findMany({
      where: { thread: { projectId: project.id, clientVisible: true } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { author: { select: { name: true } }, thread: { select: { id: true, subject: true } } },
    }),
  ]);

  const progress = scheduleProgress(tasks);
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", "), project.zip]
    .filter(Boolean)
    .join(" · ");
  const openInvoices = invoices.map((inv) => ({ ...inv, totals: invoiceTotals(inv) })).filter((i) => i.totals.balance > 0.005);

  type ActionItem = { href: string; label: string; detail: string; status: string };
  const actions: ActionItem[] = [
    ...selections.map((s) => ({
      href: `/portal/selections/${s.id}`,
      label: s.title,
      detail:
        s.status === "PENDING"
          ? `Selection needed${s.dueDate ? ` · due ${fmtDate(s.dueDate)}` : ""}`
          : "Your choice is waiting for your approval",
      status: s.status,
    })),
    ...changeOrders.map((co) => ({
      href: `/portal/change-orders/${co.id}`,
      label: `Change order #${co.number}: ${co.title}`,
      detail: `${money(sum(co.items.map(linePrice)))} · awaiting your approval`,
      status: co.status,
    })),
    ...openInvoices.map((inv) => ({
      href: `/portal/invoices/${inv.id}`,
      label: `Invoice #${inv.number}: ${inv.title}`,
      detail: `${money(inv.totals.balance)} due${inv.dueDate ? ` by ${fmtDate(inv.dueDate)}` : ""}`,
      status: inv.status,
    })),
  ];

  return (
    <>
      <PortalPageHeader
        title={`Welcome, ${firstName}`}
        description="Here's where your project stands and what we need from you."
        projects={projects}
        project={project}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                #{project.number} · {project.name} <Badge status={project.status} />
              </span>
            }
            description={
              address ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {address}
                </span>
              ) : undefined
            }
          />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Project manager</p>
                {project.manager ? (
                  <div className="mt-1 text-sm text-slate-800">
                    <p className="font-medium">{project.manager.name}</p>
                    {project.manager.phone ? (
                      <a href={`tel:${project.manager.phone}`} className="mt-0.5 flex items-center gap-1.5 text-slate-600 hover:text-blue-700">
                        <Phone className="h-3.5 w-3.5" /> {project.manager.phone}
                      </a>
                    ) : null}
                    <a href={`mailto:${project.manager.email}`} className="mt-0.5 flex items-center gap-1.5 text-slate-600 hover:text-blue-700">
                      <Mail className="h-3.5 w-3.5" /> {project.manager.email}
                    </a>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Not assigned yet</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Dates</p>
                <div className="mt-1 space-y-0.5 text-sm text-slate-800">
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> Start: {fmtDate(project.startDate)}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> Target completion: {fmtDate(project.targetEndDate)}
                  </p>
                  {project.actualEndDate ? <p className="text-emerald-700">Completed {fmtDate(project.actualEndDate)}</p> : null}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Schedule progress</p>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{progress}%</span>
                </div>
                <Progress value={progress} className="mt-2" />
                <Link href={portalHref("/portal/schedule", project.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                  View schedule <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Action needed" description={actions.length ? `${actions.length} item${actions.length === 1 ? "" : "s"} waiting on you` : "Nothing waiting on you right now"} />
            {actions.length ? (
              <ul className="divide-y divide-slate-100">
                {actions.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{a.label}</p>
                        <p className="text-xs text-slate-500">{a.detail}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge status={a.status} />
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                    <ClipboardCheck className="h-5 w-5" />
                  </span>
                  You&apos;re all caught up. We&apos;ll let you know when there&apos;s something to review.
                </div>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent updates" description="Daily progress notes and messages from your team" />
            {logs.length === 0 && messages.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No updates yet.</p>
              </CardBody>
            ) : (
              <div className="divide-y divide-slate-100">
                {logs.length ? (
                  <ul className="divide-y divide-slate-100">
                    {logs.map((log) => (
                      <li key={log.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Daily log · {fmtDate(log.date, "EEE, MMM d")}
                          </p>
                          {log.weather ? <span className="text-xs text-slate-400">{log.weather}</span> : null}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-800">{log.workCompleted ?? "—"}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {messages.length ? (
                  <ul className="divide-y divide-slate-100">
                    {messages.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/portal/messages?project=${project.id}&thread=${m.thread.id}`}
                          className="block px-5 py-3 hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">
                              Message · {m.thread.subject}
                            </p>
                            <span className="shrink-0 text-xs text-slate-400">{timeAgo(m.createdAt)}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm text-slate-800">
                            <span className="font-medium">{m.author?.name ?? "Team"}:</span> {m.body}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="px-5 py-2.5 text-right">
                  <Link href={portalHref("/portal/messages", project.id)} className="text-xs font-medium text-blue-700 hover:underline">
                    All messages →
                  </Link>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
