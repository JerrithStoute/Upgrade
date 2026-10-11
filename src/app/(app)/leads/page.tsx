import Link from "@/components/link";
import { Plus, UserPlus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadName, syncLeadStages } from "@/lib/leads";
import { OPEN_STAGES, daysBetween, stageLabel, winRate } from "@/lib/leads-math";
import { cn, fmtDate, money } from "@/lib/utils";
import { Badge, ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { LeadBoard, type BoardCard } from "./_components/board";

export const metadata = { title: "Leads" };

const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function followLabel(due: Date, today: Date) {
  const d = daysBetween(day0(today), day0(due));
  const late = day0(due) < day0(today);
  if (late) return { label: `Overdue · ${fmtDate(due, "MMM d")}`, overdue: true };
  if (d === 0) return { label: "Today", overdue: false };
  if (d === 1) return { label: "Tomorrow", overdue: false };
  return { label: fmtDate(due, "MMM d"), overdue: false };
}

const SORTS: Record<string, string> = { recent: "Newest", follow: "Next follow-up", value: "Value", stage: "Stage" };

/** The sales pipeline: every lead from first call to won or lost — a board, or a list. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ view?: string; stage?: string; sort?: string; who?: string }> }) {
  const user = await requireStaff();
  const q = await searchParams;
  await syncLeadStages();
  const today = new Date();
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const [leads, staff] = await Promise.all([
    db.lead.findMany({
      where: q.who ? { ownerId: q.who } : {},
      include: {
        owner: { select: { name: true } },
        project: { select: { number: true } },
        todos: { where: { status: { not: "DONE" }, dueDate: { not: null } }, orderBy: { dueDate: "asc" }, take: 1, select: { dueDate: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const decided = leads.filter((l) => (l.stage === "WON" && l.wonAt && l.wonAt >= yearAgo) || (l.stage === "LOST" && l.lostAt && l.lostAt >= yearAgo));
  const rate = winRate(decided);
  const due = open.filter((l) => l.todos[0]?.dueDate && day0(l.todos[0].dueDate) <= day0(today));
  const noFollow = open.filter((l) => !l.todos.length);
  const initials = (n: string) =>
    n
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const card = (l: (typeof leads)[number]): BoardCard => ({
    id: l.id,
    stage: l.stage,
    name: leadName(l),
    title: l.title,
    value: l.value,
    source: l.source,
    days: daysBetween(l.stageAt, today),
    job: l.project?.number ?? null,
    owner: l.owner ? initials(l.owner.name) : null,
    followUp: l.todos[0]?.dueDate ? followLabel(l.todos[0].dueDate, today) : null,
  });
  // The board: open leads, and the last 90 days of wins.
  const recentWin = new Date(today.getTime() - 90 * 86400000);
  const boardCards = leads.filter((l) => OPEN_STAGES.includes(l.stage) || (l.stage === "WON" && (l.wonAt ?? l.stageAt) >= recentWin)).map(card);

  const isList = q.view === "list";
  const sort = SORTS[q.sort ?? ""] ? q.sort! : "recent";
  let listed = leads.filter((l) => !q.stage || l.stage === q.stage);
  const order = ["INQUIRY", "MEETING", "ESTIMATE", "PROPOSAL", "WON", "LOST"];
  if (sort === "follow") listed = [...listed].sort((a, b) => (a.todos[0]?.dueDate?.getTime() ?? Infinity) - (b.todos[0]?.dueDate?.getTime() ?? Infinity));
  if (sort === "value") listed = [...listed].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  if (sort === "stage") listed = [...listed].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { view: q.view, stage: q.stage, sort: q.sort, who: q.who, ...o };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/leads?${s}` : "/leads";
  };
  const chip = (on: boolean) =>
    cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description="Everyone who might hire you, from first call to won or lost. Drag a lead to move it along; at Estimate it becomes a job."
        actions={
          <ButtonLink href="/leads/new" size="sm">
            <Plus className="h-4 w-4" /> New lead
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Open leads"
          value={open.length}
          hint={`${money(
            open.reduce((n, l) => n + (l.value ?? 0), 0),
            true,
          )} in the pipeline`}
        />
        <Stat label="Follow-ups due" value={due.length} hint={noFollow.length ? `${noFollow.length} with none set` : "Every lead has one"} tone={due.length ? "warn" : "default"} />
        <Stat label="Win rate · 12 months" value={rate.rate == null ? "—" : `${Math.round(rate.rate * 100)}%`} hint={`${rate.won} won · ${rate.lost} lost`} tone="good" />
        <Stat
          label="Won · 12 months"
          value={money(
            decided.filter((l) => l.stage === "WON").reduce((n, l) => n + (l.value ?? 0), 0),
            true,
          )}
          hint="Their lead values"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ view: undefined, stage: undefined })} className={chip(!isList)}>
          Board
        </Link>
        <Link href={href({ view: "list" })} className={chip(isList)}>
          List
        </Link>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <Link href={href({ who: undefined })} className={chip(!q.who)}>
          Everyone
        </Link>
        <Link href={href({ who: user.id })} className={chip(q.who === user.id)}>
          Mine
        </Link>
        {staff
          .filter((s) => s.id !== user.id)
          .map((s) => (
            <Link key={s.id} href={href({ who: s.id })} className={chip(q.who === s.id)}>
              {s.name.split(" ")[0]}
            </Link>
          ))}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No leads yet"
          description="Add the next person who calls about a job — then set a follow-up so they never fall through the cracks."
          action={
            <ButtonLink href="/leads/new" size="sm">
              <Plus className="h-4 w-4" /> New lead
            </ButtonLink>
          }
        />
      ) : !isList ? (
        <LeadBoard cards={boardCards} lostCount={leads.filter((l) => l.stage === "LOST").length} />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">Stage:</span>
            <Link href={href({ stage: undefined })} className={chip(!q.stage)}>
              All
            </Link>
            {order.map((s) => (
              <Link key={s} href={href({ stage: s })} className={chip(q.stage === s)}>
                {stageLabel(s)}
              </Link>
            ))}
            <span className="ml-2 text-slate-500">Sort:</span>
            {Object.entries(SORTS).map(([k, label]) => (
              <Link key={k} href={href({ sort: k === "recent" ? undefined : k })} className={chip(sort === k)}>
                {label}
              </Link>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Lead</th>
                  <th className="px-3 py-2.5 font-medium">Stage</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th className="px-3 py-2.5 font-medium">Next follow-up</th>
                  <th className="px-3 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listed.map((l) => {
                  const f = l.todos[0]?.dueDate ? followLabel(l.todos[0].dueDate, today) : null;
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-2">
                        <Link href={`/leads/${l.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                          {leadName(l)}
                        </Link>
                        <span className="block text-xs text-slate-500">{[l.title, l.project ? `job #${l.project.number}` : null].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge status={l.stage === "WON" ? "APPROVED" : l.stage === "LOST" ? "DECLINED" : "OPEN"}>{stageLabel(l.stage)}</Badge>
                        {l.stage === "LOST" && l.lostReason ? <span className="block text-xs text-slate-500">{l.lostReason}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">{l.source ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.value ? money(l.value, true) : "—"}</td>
                      <td className={cn("px-3 py-2 text-xs", f?.overdue && "font-semibold text-rose-700")}>
                        {f ? f.label : OPEN_STAGES.includes(l.stage) ? <span className="text-amber-700">None set</span> : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{l.owner?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{fmtDate(l.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
