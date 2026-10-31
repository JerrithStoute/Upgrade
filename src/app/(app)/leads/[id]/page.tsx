import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Bell, Briefcase, CalendarClock, Mail, MessageSquare, Phone, StickyNote, Trash2, Users } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { leadName, sourceOptions, syncLeadStages } from "@/lib/leads";
import { LEAD_STAGES, LOST_REASONS, daysBetween, stageLabel } from "@/lib/leads-math";
import { cn, dateInput, fmtDate, fmtDateTime, money, titleCase } from "@/lib/utils";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { LeadInfo } from "@/components/leads/lead-info";
import { addLeadEntry, completeFollowUp, deleteLead, moveLeadForm, setFollowUp, setMeeting } from "../actions";
import { companyClock } from "@/lib/company-zone";

const KIND_ICON = { CALL: Phone, EMAIL: Mail, MEETING: Users, NOTE: StickyNote, STAGE: Briefcase } as const;
const KIND_LABEL: Record<string, string> = { CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note", STAGE: "" };

const small = "!h-7 !px-2.5 !text-xs";
const pill = "rounded-full px-2.5 py-0.5 text-xs font-medium";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const cardHead = "border-b border-slate-100 px-4 py-2.5";
const field = "input !h-7 !py-0 text-xs";

/**
 * One lead, laid out like a client's or sub's page: its stage along the top, its info (edited right here) beside
 * the follow-up and meeting, and the log of everything that's happened.
 */
export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string; next?: string }> }) {
  const user = await requireView("leads");
  const canEdit = user.role === "ADMIN" || allows(user.access, "leads", 2);
  const { dateTime } = await companyClock();
  const { id } = await params;
  const { note, next } = await searchParams;
  await syncLeadStages();
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      project: { select: { id: true, number: true, name: true, status: true, isSpec: true } },
      entries: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      todos: { where: { status: { not: "DONE" } }, orderBy: { dueDate: "asc" }, include: { assignee: { select: { name: true } } } },
    },
  });
  if (!lead) notFound();
  const [sources, staff] = await Promise.all([
    sourceOptions(),
    db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const name = leadName(lead);
  const today = (await companyClock()).now; // today, on the company's clock
  const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isOpen = lead.stage !== "WON" && lead.stage !== "LOST";
  const followUps = lead.todos.filter((t) => !t.title.startsWith("Meeting:"));
  const days = daysBetween(lead.stageAt, today);
  const inThree = new Date(today.getTime() + 3 * 86400000);
  const hidden = (stage: string) => (
    <>
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="stage" value={stage} />
    </>
  );

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/leads" className="text-xs text-slate-500 hover:text-slate-800">
          ← Leads
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">{name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className={cn(pill, lead.stage === "WON" ? "bg-emerald-50 text-emerald-800" : lead.stage === "LOST" ? "bg-rose-50 text-rose-800" : "bg-blue-50 text-blue-800")}>
                {stageLabel(lead.stage)} · {days === 1 ? "1 day" : `${days} days`}
              </span>
              <span className={cn(pill, "bg-slate-100 text-slate-600")}>{[lead.value ? money(lead.value, true) : null, titleCase(lead.jobType).toLowerCase()].filter(Boolean).join(" ")}</span>
              {lead.source ? <span className={cn(pill, "bg-slate-100 text-slate-600")}>{lead.source}</span> : null}
              {lead.owner ? <span className={cn(pill, "bg-slate-100 text-slate-600")}>{lead.owner.name.split(" ")[0]}&apos;s lead</span> : null}
              {lead.project ? (
                <Link href={`/projects/${lead.project.id}`} className={cn(pill, "inline-flex items-center gap-1 bg-blue-50 text-blue-800 hover:bg-blue-100")}>
                  <Briefcase className="h-3 w-3" /> Job #{lead.project.number} {lead.project.name}
                </Link>
              ) : null}
            </div>
            {lead.stage === "LOST" ? (
              <p className="mt-1 text-xs text-rose-700">
                Lost {fmtDate(lead.lostAt)}
                {lead.lostReason ? ` — ${lead.lostReason}` : ""}
              </p>
            ) : null}
          </div>
          {canEdit && (!lead.projectId || lead.project?.isSpec) ? (
            <ConfirmForm action={deleteLead} hidden={{ id: lead.id }} message={`Delete the lead ${name}? (To keep it in your win rate, mark it lost instead.)`} variant="ghost">
              <span className="inline-flex items-center gap-1 text-xs text-rose-600">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </span>
            </ConfirmForm>
          ) : null}
        </div>
      </div>

      {note ? <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">{note}</p> : null}

      {/* Where it is, and the way along. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {LEAD_STAGES.map((s, i) => {
          const here = lead.stage === s.key;
          const blocked = !!lead.projectId && (s.key === "INQUIRY" || s.key === "MEETING");
          return (
            <form key={s.key} action={moveLeadForm}>
              {hidden(s.key)}
              <button
                type="submit"
                disabled={here || blocked || !canEdit}
                title={blocked ? "It's a job now" : s.key === "ESTIMATE" && !lead.projectId ? "Makes it a job, to estimate" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                  here ? "bg-slate-900 text-white ring-slate-900" : blocked ? "text-slate-300 ring-slate-200" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                )}
              >
                {i + 1}. {s.label}
              </button>
            </form>
          );
        })}
        {lead.stage !== "LOST" && canEdit ? (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 [&::-webkit-details-marker]:hidden">
              Lost…
            </summary>
            <form action={moveLeadForm} className="absolute left-0 z-20 mt-1 w-64 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg">
              {hidden("LOST")}
              <select name="reason" className={cn(field, "w-full")} defaultValue="" aria-label="Why">
                <option value="">Why? Pick one…</option>
                {LOST_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <input name="otherReason" className={cn(field, "w-full")} placeholder="…or type the reason" aria-label="Other reason" />
              <SubmitButton size="sm" variant="danger" className={small}>
                Mark lost
              </SubmitButton>
            </form>
          </details>
        ) : null}
        {!lead.projectId && isOpen ? <span className="ml-1 text-xs text-slate-500">Estimate makes it a job</span> : null}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <LeadInfo lead={lead} sources={sources} staff={staff} canEdit={canEdit} />

        <div className="space-y-4">
          <section id="follow-up" className={cn(card, "scroll-mt-24", next && "ring-2 ring-blue-400")}>
            <header className={cardHead}>
              <h2 className="text-sm font-semibold text-slate-900">Follow-up</h2>
              <p className="text-xs text-slate-500">{next ? "Done — when's the next one?" : "A To-Do for whoever's on it: To-Dos, the Dashboard and the calendar."}</p>
            </header>
            <div className="divide-y divide-slate-100">
              {followUps.length === 0 && isOpen ? <p className="px-4 py-2 text-sm text-amber-700">No follow-up set — set one so this lead doesn&apos;t go quiet.</p> : null}
              {followUps.map((t) => {
                const late = t.dueDate && day0(t.dueDate) < day0(today);
                return (
                  <div key={t.id} className="px-4 py-2">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      <Bell className={cn("h-3.5 w-3.5", late ? "text-rose-600" : "text-slate-400")} />
                      <span className={cn("font-medium", late ? "text-rose-700" : "text-slate-900")}>{t.dueDate ? fmtDate(t.dueDate, "MMM d") : "No date"}</span>
                      <span className="text-slate-700">{t.title.replace(/^Follow up: [^—]*(— )?/, "") || "Follow up"}</span>
                      {t.assignee ? <span className="text-xs text-slate-500">· {t.assignee.name}</span> : null}
                    </p>
                    {canEdit ? (
                      <form action={completeFollowUp} className="mt-1.5 flex flex-wrap gap-1.5">
                        <input type="hidden" name="id" value={lead.id} />
                        <input type="hidden" name="todoId" value={t.id} />
                        <select name="kind" className={cn(field, "!w-auto")} defaultValue="CALL" aria-label="How">
                          <option value="CALL">Called</option>
                          <option value="EMAIL">Emailed</option>
                          <option value="MEETING">Met</option>
                          <option value="NOTE">Other</option>
                        </select>
                        <input name="result" className={cn(field, "min-w-0 flex-1")} placeholder="What happened (optional)" aria-label="What happened" />
                        <SubmitButton size="sm" className={small} pendingText="Saving…">
                          Done
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                );
              })}
              {isOpen && canEdit ? (
                <form action={setFollowUp} className="flex flex-wrap gap-1.5 px-4 py-2">
                  <input type="hidden" name="id" value={lead.id} />
                  <input name="date" type="date" required className={cn(field, "!w-32")} defaultValue={dateInput(inThree)} aria-label="Follow up on" />
                  <input name="note" placeholder={followUps.length ? "Another follow-up…" : "Call about plans"} aria-label="Note" className={cn(field, "min-w-[8rem] flex-1")} />
                  <select name="assigneeId" className={cn(field, "!w-32")} defaultValue={lead.ownerId ?? user.id} aria-label="Who">
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton size="sm" variant="secondary" className={small} pendingText="Setting…">
                    Set
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </section>

          {isOpen ? (
            <section className={card}>
              <header className={cardHead}>
                <h2 className="text-sm font-semibold text-slate-900">Meeting</h2>
                {lead.meetingAt ? null : <p className="text-xs text-slate-500">Goes on the calendar; an inquiry moves to Meeting.</p>}
              </header>
              <div className="space-y-1.5 px-4 py-2">
                {lead.meetingAt ? (
                  <p className="flex items-center gap-1.5 text-sm text-slate-900">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-500" /> {fmtDateTime(lead.meetingAt)}
                  </p>
                ) : null}
                {canEdit ? (
                  <form action={setMeeting} className="flex flex-wrap gap-1.5">
                    <input type="hidden" name="id" value={lead.id} />
                    <input name="date" type="date" required className={cn(field, "!w-32")} defaultValue={dateInput(lead.meetingAt)} aria-label="Meeting day" />
                    <input
                      name="time"
                      type="time"
                      className={cn(field, "!w-28")}
                      defaultValue={lead.meetingAt ? `${String(lead.meetingAt.getHours()).padStart(2, "0")}:${String(lead.meetingAt.getMinutes()).padStart(2, "0")}` : ""}
                      aria-label="Meeting time"
                    />
                    <SubmitButton size="sm" variant="secondary" className={small} pendingText="Saving…">
                      {lead.meetingAt ? "Change" : "Set meeting"}
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <section id="log" className={cn(card, "scroll-mt-24")}>
        <header className={cn(cardHead, "flex flex-wrap items-center justify-between gap-2")}>
          <h2 className="text-sm font-semibold text-slate-900">Log</h2>
          <span className="text-xs text-slate-500">Calls, emails, meetings, notes — and where it&apos;s been</span>
        </header>
        {canEdit ? (
          <form action={addLeadEntry} className="flex flex-wrap gap-1.5 px-4 py-2">
            <input type="hidden" name="id" value={lead.id} />
            <select name="kind" className={cn(field, "!w-auto")} defaultValue="CALL" aria-label="Kind">
              <option value="CALL">Call</option>
              <option value="EMAIL">Email</option>
              <option value="MEETING">Meeting</option>
              <option value="NOTE">Note</option>
            </select>
            <input name="text" required className={cn(field, "min-w-0 flex-1")} placeholder="What happened" aria-label="What happened" />
            <SubmitButton size="sm" variant="secondary" className={small} pendingText="Adding…">
              Add
            </SubmitButton>
          </form>
        ) : null}
        <ol className="divide-y divide-slate-100 border-t border-slate-100">
          {lead.entries.map((e) => {
            const Icon = KIND_ICON[e.kind as keyof typeof KIND_ICON] ?? MessageSquare;
            return (
              <li key={e.id} className="flex gap-2.5 px-4 py-2 text-sm">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", e.kind === "STAGE" ? "text-blue-500" : "text-slate-400")} />
                <div className="min-w-0">
                  <p className={cn(e.kind === "STAGE" ? "text-slate-600" : "text-slate-900")}>
                    {KIND_LABEL[e.kind] ? <span className="font-medium">{KIND_LABEL[e.kind]}: </span> : null}
                    {e.text}
                  </p>
                  <p className="text-xs text-slate-500">
                    {dateTime(e.createdAt)}
                    {e.user ? ` · ${e.user.name}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
