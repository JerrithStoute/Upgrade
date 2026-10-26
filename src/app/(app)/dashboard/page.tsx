import Link from "@/components/link";
import { addDays } from "date-fns";
import { AlertTriangle, FileInput, LayoutGrid, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { contractValue } from "@/lib/projects";
import { scheduleProgressByProject } from "@/lib/project-progress";
import { cn, fmtDate, money, timeAgo } from "@/lib/utils";
import { billTotal, coverageWarning, vendorsCoverage } from "@/lib/purchasing";
import { ACTIVE, agingRows, canSeeReports, cashFlow, jobRows, sumRows } from "@/lib/reports";
import { AGING_BUCKETS } from "@/lib/report-math";
import { availableCards, dashboardLayout, DASHBOARD_CARDS, layoutKeys } from "@/lib/dashboard-cards";
import { Badge, Button, EmptyState, PageHeader, Progress } from "@/components/ui";
import { GettingStarted } from "./getting-started";
import { Signed, pctText } from "../reports/_parts";
import { completeTodo } from "./actions";
import { syncLeadStages } from "@/lib/leads";
import { LEAD_STAGES, OPEN_STAGES, winRate } from "@/lib/leads-math";
import { CustomizeDashboard } from "./customize";
import { DashboardBoard } from "./board";
import { MoreList } from "@/components/more-list";
import { companyClock } from "@/lib/company-zone";

/** A compact dashboard card: title, a short note and a link in one line, then its content. */
function Panel({ title, note, href, link, children }: { title: string; note?: React.ReactNode; href?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 py-2 pl-4 pr-10">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
          {href ? (
            <Link href={href} className="shrink-0 text-xs font-medium text-blue-700 hover:underline">
              {link}
            </Link>
          ) : null}
        </div>
        {note ? <p className="truncate text-xs text-slate-500">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** One line when a card has nothing to show. */
const Quiet = ({ children, good }: { children: React.ReactNode; good?: boolean }) => (
  <p className={cn("flex items-center gap-2 px-4 py-3 text-sm", good ? "text-emerald-800" : "text-slate-500")}>{children}</p>
);

/** A small number tile for Key numbers. */
function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "warn" }) {
  return (
    <div className="min-w-0 flex-1 basis-36 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "warn" ? "text-amber-600" : "text-slate-900")}>{value}</p>
      {hint ? <p className="truncate text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const row = "px-4 py-2";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  // Just signed up (or just joined): a first hello instead of "welcome back".
  const first = (await searchParams).welcome === "1";
  const user = await requireStaff();
  const reports = canSeeReports(user);
  const me = await db.user.findUnique({ where: { id: user.id }, select: { dashboardCards: true } });
  const layout = dashboardLayout(me?.dashboardCards, reports);
  const cards = layoutKeys(layout);
  // Bills and insurance are purchasing: only for a position that shows it.
  const want = (k: string) => cards.includes(k) && (k !== "vendors" || allows(user.access, "purchasing", 1));
  const now = (await companyClock()).now; // now, on the company's clock (for due / overdue)

  // Only what the picked cards need is loaded.
  const [cardStats, cardProjects, cardVendors, cardAttention, cardTodos, cardSchedule, cardActivity, cardProfit, cardCash, cardAging, cardSales] = await Promise.all([
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
          take: 30,
        })
      : null,
    want("activity")
      ? db.activity.findMany({ where: { NOT: { type: { startsWith: "security." } } }, include: { user: { select: { name: true } }, project: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 20 })
      : null,
    want("profit") || want("wip") ? jobRows(ACTIVE) : null,
    want("cash") ? cashFlow("week", now) : null,
    want("aging") ? agingRows(now) : null,
    want("sales") ? salesData(user.id, now) : null,
  ]);

  const render: Record<string, () => React.ReactNode> = {
    stats: () => {
      const s = cardStats!;
      return (
        // Tiles stretch to fill each row, so there's never an empty spot.
        <div className="flex flex-wrap gap-2 pr-8">
          <Tile label="Active projects" value={s.activeCount} hint="Contracted, building, on hold" />
          <Tile label="Contract value" value={money(s.activeContractTotal, true)} hint="Active jobs" />
          <Tile label="Receivables" value={money(s.receivables, true)} hint="Invoiced, not paid" tone={s.receivables > 0 ? "warn" : undefined} />
          <Tile label="My to-dos" value={s.myOpen} hint={`${s.myOverdue} overdue`} />
          <Tile
            label="Client approvals"
            value={s.pendingSelections + s.pendingCOs}
            hint={`${s.pendingSelections} selections · ${s.pendingCOs} COs`}
            tone={s.pendingSelections + s.pendingCOs > 0 ? "warn" : undefined}
          />
        </div>
      );
    },
    sales: () => {
      const s = cardSales!;
      return (
        <Panel
          title="Sales pipeline"
          note={`${s.open.length} open · ${money(
            s.open.reduce((n, l) => n + (l.value ?? 0), 0),
            true,
          )}`}
          href="/leads"
          link="Leads"
        >
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-2 text-sm @sm:grid-cols-2">
            {LEAD_STAGES.filter((x) => x.key !== "WON").map((x) => (
              <li key={x.key} className="flex justify-between">
                <span className="text-slate-600">{x.label}</span>
                <span className="font-medium tabular-nums">{s.open.filter((l) => l.stage === x.key).length}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-slate-100 px-4 py-2 text-sm">
            <Link href="/leads?view=list&sort=follow" className={cn("hover:underline", s.mineDue ? "font-semibold text-rose-700" : "text-slate-600")}>
              Follow-ups due: {s.mineDue}
            </Link>
            <span className="text-slate-600">
              Win rate <strong className="text-slate-900">{s.rate == null ? "—" : `${Math.round(s.rate * 100)}%`}</strong>
            </span>
          </div>
        </Panel>
      );
    },
    projects: () => {
      const { activeProjects, contractValues, progressMap } = cardProjects!;
      return (
        <Panel title="Active projects" note={`${activeProjects.length} in flight`} href="/projects" link="All projects">
          {activeProjects.length === 0 ? (
            <Quiet>No active projects — they show here once contracted.</Quiet>
          ) : (
            <MoreList
              items={activeProjects.map((p, i) => {
                const progress = progressMap.get(p.id) ?? 0;
                return (
                  <li key={p.id} className={cn(row, "flex items-center gap-3")}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/projects/${p.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-blue-700">
                        <span className="text-slate-400">#{p.number}</span> {p.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {p.client ? `${p.client.firstName} ${p.client.lastName}` : p.isSpec ? "Spec home" : "No client"} · {money(contractValues[i], true)}
                      </p>
                    </div>
                    <div className="w-20 shrink-0">
                      <p className="mb-0.5 text-right text-[11px] tabular-nums text-slate-500">{progress}%</p>
                      <Progress value={progress} />
                    </div>
                  </li>
                );
              })}
            />
          )}
        </Panel>
      );
    },
    vendors: () => {
      if (!cardVendors) return null; // purchasing hidden for this position
      const { insuranceWarnings, billsWaiting } = cardVendors;
      const items = [
        ...(billsWaiting.length
          ? [
              <li key="bills" className={row}>
                <Link href="/bills" className="flex items-center gap-2 text-sm font-medium text-slate-900 hover:text-blue-700">
                  <FileInput className="h-4 w-4 shrink-0 text-amber-600" />
                  {billsWaiting.length} bill{billsWaiting.length === 1 ? "" : "s"} to approve ·{" "}
                  {money(
                    billsWaiting.reduce((n, b) => n + billTotal(b.lines), 0),
                    true,
                  )}
                </Link>
              </li>,
            ]
          : []),
        ...insuranceWarnings.map((w) => (
          <li key={w.vendor.id} className={row}>
            <Link href={`/settings/vendors/${w.vendor.id}`} className="flex items-start gap-2 text-sm hover:text-blue-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{w.vendor.name}</span>
                <span className="block truncate text-xs text-slate-600">{w.text}</span>
              </span>
            </Link>
          </li>
        )),
      ];
      return (
        <Panel title="Subs & vendors">
          {items.length ? (
            <MoreList items={items} />
          ) : (
            <Quiet good>
              <ShieldCheck className="h-4 w-4" /> All clear — no bills waiting, insurance up to date.
            </Quiet>
          )}
        </Panel>
      );
    },
    attention: () => (
      <Panel title="Needs attention" note={cardAttention!.length ? `${cardAttention!.length}` : undefined}>
        {cardAttention!.length === 0 ? (
          <Quiet good>All clear — nothing overdue or waiting on a decision.</Quiet>
        ) : (
          <MoreList
            items={cardAttention!.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className={cn(row, "flex items-center gap-2 hover:bg-slate-50")}>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-900">{a.label}</p>
                    <p className="truncate text-xs text-slate-500">
                      {a.tone} · {a.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{a.date ? fmtDate(a.date, "MMM d") : ""}</span>
                </Link>
              </li>
            ))}
          />
        )}
      </Panel>
    ),
    todos: () => {
      const todos = cardTodos!;
      return (
        <Panel title="My to-dos" note={`${todos.length} open`} href="/todos" link="All to-dos">
          {todos.length === 0 ? (
            <Quiet good>You&apos;re all caught up.</Quiet>
          ) : (
            <MoreList
              items={todos.map((t) => {
                const overdue = t.dueDate ? t.dueDate < now : false;
                return (
                  <li key={t.id} className={cn(row, "flex items-start gap-2.5")}>
                    <form action={completeTodo} className="pt-0.5">
                      <input type="hidden" name="id" value={t.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 rounded-full border border-slate-300 p-0 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                        title="Mark complete"
                        aria-label={`Complete ${t.title}`}
                      >
                        <span className="sr-only">Complete</span>
                      </Button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{t.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {t.leadId ? (
                          <Link href={`/leads/${t.leadId}`} className="hover:underline">
                            Lead
                          </Link>
                        ) : t.project ? (
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
            />
          )}
        </Panel>
      );
    },
    schedule: () => (
      <Panel title="Upcoming schedule" note="Next 7 days" href="/schedule" link="Look-ahead">
        {cardSchedule!.length === 0 ? (
          <Quiet>Nothing starting this week.</Quiet>
        ) : (
          <MoreList
            items={cardSchedule!.map((t) => (
              <li key={t.id}>
                <Link href={`/projects/${t.projectId}/schedule`} className={cn(row, "flex items-center gap-2.5 hover:bg-slate-50")}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-900">
                      {t.name}
                      {t.isMilestone ? <span className="ml-1.5 text-xs text-violet-700">Milestone</span> : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">{t.project.name}</p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-600">{fmtDate(t.startDate, "MMM d")}</span>
                </Link>
              </li>
            ))}
          />
        )}
      </Panel>
    ),
    activity: () => (
      <Panel title="Recent activity">
        {cardActivity!.length === 0 ? (
          <Quiet>No activity yet.</Quiet>
        ) : (
          <MoreList
            items={cardActivity!.map((a) => (
              <li key={a.id} className={row}>
                <p className="line-clamp-2 text-sm text-slate-900">{a.description}</p>
                <p className="truncate text-xs text-slate-500">
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
          />
        )}
      </Panel>
    ),
    profit: () => {
      const rows = cardProfit!;
      const t = sumRows(rows);
      return (
        <Panel title="Job profit" note={`Heading for ${money(t.projectedProfit, true)} (${pctText(t.projectedMargin)})`} href="/reports" link="Report">
          {rows.length === 0 ? (
            <Quiet>No active jobs.</Quiet>
          ) : (
            <MoreList
              items={rows.map((r) => (
                <li key={r.id} className={cn(row, "flex items-center gap-2 text-sm")}>
                  <Link href={`/projects/${r.id}/budget`} className="min-w-0 flex-1 truncate font-medium text-slate-900 hover:text-blue-700">
                    {r.name}
                  </Link>
                  <span className="shrink-0 whitespace-nowrap text-right">
                    <Signed value={r.projectedProfit} /> <span className="text-xs text-slate-500">{pctText(r.projectedMargin)}</span>
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs">
                    {r.fade < -0.5 ? <Signed value={r.fade} className="font-semibold" /> : <span className="text-emerald-700">on bid</span>}
                  </span>
                </li>
              ))}
            />
          )}
        </Panel>
      );
    },
    wip: () => {
      const rows = cardProfit!;
      const t = sumRows(rows);
      const under = rows.filter((r) => r.overUnder < -0.5).sort((a, b) => a.overUnder - b.overUnder);
      return (
        <Panel title="Over / under billing" href="/reports/wip" link="WIP">
          <div className="grid grid-cols-2 gap-3 px-4 py-2 text-sm">
            <div>
              <p className="text-xs text-slate-500">Over-billed</p>
              <p className="font-semibold tabular-nums text-amber-700">{money(t.overBilled, true)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Under-billed</p>
              <p className="font-semibold tabular-nums text-rose-700">{money(Math.abs(t.underBilled), true)}</p>
            </div>
          </div>
          {under.length ? (
            <MoreList
              className="border-t border-slate-100"
              items={under.map((r) => (
                <li key={r.id} className={cn(row, "flex items-center gap-2 text-sm")}>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="tabular-nums text-rose-700">{money(-r.overUnder, true)}</span>
                  <Link href={`/projects/${r.id}/invoices/new`} className="text-xs font-medium text-blue-700 hover:underline">
                    Bill it
                  </Link>
                </li>
              ))}
            />
          ) : (
            <Quiet>No job is behind on billing.</Quiet>
          )}
        </Panel>
      );
    },
    cash: () => {
      const ahead = cardCash!.filter((r) => !r.past).slice(0, 5);
      const inn = ahead.reduce((n, r) => n + r.in + r.expectedIn, 0);
      const out = ahead.reduce((n, r) => n + r.out + r.expectedOut, 0);
      const scale = Math.max(1, inn, out);
      return (
        <Panel title="Cash next 30 days" href="/reports/cash-flow?by=week" link="Cash flow">
          <div className="space-y-2 px-4 py-2 text-sm">
            {[
              { label: "Coming in", value: inn, bar: "bg-emerald-500" },
              { label: "Going out", value: out, bar: "bg-rose-500" },
            ].map((x) => (
              <div key={x.label}>
                <div className="flex justify-between">
                  <span className="text-slate-600">{x.label}</span>
                  <span className="font-medium tabular-nums">{money(x.value, true)}</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-100">
                  <div className={cn("h-full", x.bar)} style={{ width: `${(x.value / scale) * 100}%` }} />
                </div>
              </div>
            ))}
            <p className="flex justify-between border-t border-slate-100 pt-1.5 font-semibold">
              <span>Net</span>
              <Signed value={inn - out} />
            </p>
          </div>
        </Panel>
      );
    },
    aging: () => {
      const rows = cardAging!;
      const total = rows.reduce((n, r) => n + r.balance, 0);
      return (
        <Panel title="What clients owe" note={`${money(total, true)} · ${rows.length} invoice${rows.length === 1 ? "" : "s"}`} href="/reports/aging" link="Aging">
          <ul className="space-y-1 px-4 py-2 text-sm">
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
        </Panel>
      );
    },
  };

  const nodes = Object.fromEntries(cards.filter((k) => render[k]).map((k) => [k, render[k]()]));
  const titles = Object.fromEntries(DASHBOARD_CARDS.map((c) => [c.key, c.title]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description={first ? `Welcome to The Builder Station, ${user.name.split(" ")[0]}! Start with Projects → New project, or invite your team in Settings → Team.` : `Welcome back, ${user.name.split(" ")[0]}. Drag a card by its grip to move it.`}
        actions={<CustomizeDashboard cards={availableCards(reports)} picked={cards} />}
      />
      <GettingStarted isAdmin={user.role === "ADMIN"} />
      {cards.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="Your dashboard is empty" description="Use Customize to pick the cards you want." />
      ) : (
        // Keyed by the saved layout: after Customize (or Reset) it redraws from what's saved.
        <DashboardBoard key={JSON.stringify(layout)} layout={layout} cards={nodes} titles={titles} />
      )}
    </div>
  );
}

// --- What each card loads ---------------------------------------------------------------------

async function statsData(userId: string, now: Date) {
  const [active, invoices, myOpen, myOverdue, pendingSelections, pendingCOs] = await Promise.all([
    db.project.findMany({ where: { status: { in: ACTIVE }, isTemplate: false }, select: { id: true, contractAmount: true } }),
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
    where: { status: { in: ACTIVE }, isTemplate: false },
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

async function salesData(userId: string, now: Date) {
  await syncLeadStages();
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const [leads, mineDue] = await Promise.all([
    db.lead.findMany({ select: { stage: true, value: true, wonAt: true, lostAt: true } }),
    db.todo.count({ where: { leadId: { not: null }, assigneeId: userId, status: { not: "DONE" }, dueDate: { lte: endOfToday } } }),
  ]);
  const decided = leads.filter((l) => (l.stage === "WON" && l.wonAt && l.wonAt >= yearAgo) || (l.stage === "LOST" && l.lostAt && l.lostAt >= yearAgo));
  return { open: leads.filter((l) => OPEN_STAGES.includes(l.stage)), mineDue, rate: winRate(decided).rate };
}
