import Link from "@/components/link";
import { FolderKanban, Phone, Mail, MessageSquare, ClipboardCheck } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { changeOrderTotals } from "@/lib/change-orders";
import { db } from "@/lib/db";
import { portalContext, portalHref, scheduleProgress, invoiceTotals } from "@/lib/portal";
import { cn, fmtDate, money, timeAgo } from "@/lib/utils";
import { EmptyState, Progress } from "@/components/ui";
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
        <EmptyState icon={FolderKanban} title="No projects yet" description="Once your builder links a project to your account it will appear here." />
      </>
    );
  }

  const [tasks, selections, changeOrders, invoices, logs, messages] = await Promise.all([
    db.scheduleTask.findMany({ where: { projectId: project.id }, select: { startDate: true, endDate: true, percentComplete: true } }),
    db.selection.findMany({
      // Waiting on their pick, with something to pick from (a pick is made final by the builder).
      where: { projectId: project.id, status: "PENDING", options: { some: {} } },
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
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const openInvoices = invoices.map((inv) => ({ ...inv, totals: invoiceTotals(inv) })).filter((i) => i.totals.balance > 0.005);

  type ActionItem = { href: string; label: string; detail: string; button: string; strong: boolean };
  const actions: ActionItem[] = [
    ...changeOrders.map((co) => ({
      href: `/portal/change-orders/${co.id}`,
      label: co.title,
      detail: `Change order #${co.number} · ${money(changeOrderTotals(co, co.items).total)}`,
      button: "Review",
      strong: true,
    })),
    ...selections.map((s) => ({
      // Opened on the Selections list, where they choose.
      href: `/portal/selections?project=${project.id}&open=${s.id}`,
      label: s.title,
      detail: `Selection${s.dueDate ? ` · due ${fmtDate(s.dueDate, "MMM d")}` : ""}`,
      button: "Choose",
      strong: true,
    })),
    ...openInvoices.map((inv) => ({
      href: `/portal/invoices/${inv.id}`,
      label: `Invoice #${inv.number}`,
      detail: `${money(inv.totals.balance)} due${inv.dueDate ? ` ${fmtDate(inv.dueDate, "MMM d")}` : ""} · ${inv.title}`,
      button: "View",
      strong: false,
    })),
  ];
  const pm = project.manager;
  const contact = "grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50";
  const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
  const head = "flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
  // Daily logs and messages together, newest first.
  const updates = [
    ...logs.map((l) => ({ key: l.id, at: l.date, who: "Daily log", text: l.workCompleted ?? "—", href: null as string | null })),
    ...messages.map((m) => ({ key: m.id, at: m.createdAt, who: m.author?.name ?? "Team", text: m.body, href: `/portal/messages?project=${project.id}&thread=${m.thread.id}` })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  return (
    <>
      <PortalPageHeader title={`Hi, ${firstName}`} description={[`#${project.number} ${project.name}`, address].filter(Boolean).join(" · ")} projects={projects} project={project} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* What we need from them first: on a phone it's the top of the page. */}
        <section className={card}>
          <header className={head}>
            <h2 className="text-sm font-semibold text-slate-900">Needs you</h2>
            {actions.length ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">{actions.length}</span> : null}
          </header>
          {actions.length ? (
            <ul className="divide-y divide-slate-100">
              {actions.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{a.label}</span>
                      <span className="block truncate text-xs text-slate-500">{a.detail}</span>
                    </span>
                    <span
                      className={
                        a.strong
                          ? "shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white"
                          : "shrink-0 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700"
                      }
                    >
                      {a.button}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
              <ClipboardCheck className="h-4 w-4 text-emerald-600" /> You&apos;re all caught up.
            </p>
          )}
        </section>

        {/* Never grows: across the top on a computer, under Needs you on a phone. */}
        <section className={cn(card, "flex flex-col gap-3 px-4 py-3 lg:order-first lg:col-span-2 lg:flex-row lg:items-center lg:gap-6")}>
          <div className="min-w-0 lg:flex-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Your home</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{project.actualEndDate ? "Finished" : `${progress}% built`}</span>
            </div>
            <Progress value={project.actualEndDate ? 100 : progress} className="mt-2" />
            <p className="mt-2 text-xs text-slate-500">
              {project.actualEndDate ? `Finished ${fmtDate(project.actualEndDate)}` : project.startDate ? `Started ${fmtDate(project.startDate)}` : "Not started yet"}
              {" · "}
              <Link href={portalHref("/portal/schedule", project.id)} className="font-medium text-blue-700 hover:underline">
                See the schedule
              </Link>
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 lg:w-80 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <span className="min-w-0">
              <span className="block text-xs text-slate-500">Your project manager</span>
              <span className="block truncate text-sm text-slate-900">{pm?.name ?? "Not assigned yet"}</span>
            </span>
            {pm ? (
              <span className="flex shrink-0 gap-1.5">
                {pm.phone ? (
                  <>
                    <a href={`tel:${pm.phone}`} className={contact} title={`Call ${pm.phone}`} aria-label={`Call ${pm.name}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                    <a href={`sms:${pm.phone}`} className={contact} title={`Text ${pm.phone}`} aria-label={`Text ${pm.name}`}>
                      <MessageSquare className="h-4 w-4" />
                    </a>
                  </>
                ) : null}
                <a href={`mailto:${pm.email}`} className={contact} title={pm.email} aria-label={`Email ${pm.name}`}>
                  <Mail className="h-4 w-4" />
                </a>
              </span>
            ) : null}
          </div>
        </section>

        <section className={card}>
          <header className={head}>
            <h2 className="text-sm font-semibold text-slate-900">Latest</h2>
            <Link href={portalHref("/portal/messages", project.id)} className="text-xs font-medium text-blue-700 hover:underline">
              All messages
            </Link>
          </header>
          {updates.length ? (
            <ul className="divide-y divide-slate-100">
              {updates.map((u) => {
                const body = (
                  <>
                    <span className="block text-xs text-slate-500">
                      {timeAgo(u.at)} · {u.who}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-slate-800">{u.text}</span>
                  </>
                );
                return (
                  <li key={u.key}>
                    {u.href ? (
                      <Link href={u.href} className="block px-4 py-2.5 hover:bg-slate-50">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-slate-500">No updates yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
