import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Bell, Briefcase, CalendarClock, Mail, MapPin, MessageSquare, Phone, StickyNote, Users } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadName, sourceOptions, syncLeadStages } from "@/lib/leads";
import { LEAD_STAGES, LOST_REASONS, daysBetween, stageLabel } from "@/lib/leads-math";
import { cn, dateInput, fmtDate, fmtDateTime, money, titleCase } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHeader, Collapsible, ConfirmForm, SubmitButton } from "@/components/ui";
import { LeadForm } from "../_components/lead-form";
import { addLeadEntry, completeFollowUp, deleteLead, moveLeadForm, setFollowUp, setMeeting, updateLead } from "../actions";
import { companyClock } from "@/lib/company-zone";

const KIND_ICON = { CALL: Phone, EMAIL: Mail, MEETING: Users, NOTE: StickyNote, STAGE: Briefcase } as const;
const KIND_LABEL: Record<string, string> = { CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note", STAGE: "" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ note?: string; next?: string }> }) {
  const user = await requireView("leads");
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
  const inThree = new Date(today.getTime() + 3 * 86400000);
  const hidden = (stage: string) => (
    <>
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="stage" value={stage} />
    </>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link href="/leads" className="text-xs text-slate-500 hover:text-slate-800">
          ← Leads
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          {name}
          <Badge status={lead.stage === "WON" ? "APPROVED" : lead.stage === "LOST" ? "DECLINED" : "OPEN"}>{stageLabel(lead.stage)}</Badge>
        </h1>
        <p className="text-sm text-slate-500">
          {[lead.title, titleCase(lead.jobType), lead.value ? money(lead.value, true) : null, lead.source ? `from ${lead.source}` : null].filter(Boolean).join(" · ")}
          {" · "}
          {daysBetween(lead.stageAt, today)} days in this stage
          {lead.owner ? ` · ${lead.owner.name}'s lead` : ""}
        </p>
        {lead.project ? (
          <Link href={`/projects/${lead.project.id}`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
            <Briefcase className="h-4 w-4" /> Job #{lead.project.number} {lead.project.name}
          </Link>
        ) : null}
        {lead.stage === "LOST" ? (
          <p className="mt-1 text-sm text-rose-700">
            Lost {fmtDate(lead.lostAt)}
            {lead.lostReason ? ` — ${lead.lostReason}` : ""}
          </p>
        ) : null}
      </div>

      {note ? <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">{note}</p> : null}

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
                disabled={here || blocked}
                title={blocked ? "It's a job now" : s.key === "ESTIMATE" && !lead.projectId ? "Makes it a job, to estimate" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset",
                  here ? "bg-slate-900 text-white ring-slate-900" : blocked ? "text-slate-300 ring-slate-200" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                )}
              >
                {i + 1}. {s.label}
              </button>
            </form>
          );
        })}
        {lead.stage !== "LOST" ? (
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full px-3 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 [&::-webkit-details-marker]:hidden">
              Lost…
            </summary>
            <form action={moveLeadForm} className="absolute left-0 z-20 mt-1 w-72 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              {hidden("LOST")}
              <select name="reason" className="input" defaultValue="">
                <option value="">Why? Pick one…</option>
                {LOST_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <input name="otherReason" className="input" placeholder="…or type the reason" />
              <Button type="submit" size="sm" variant="danger">
                Mark lost
              </Button>
            </form>
          </details>
        ) : null}
      </div>
      {!lead.projectId && isOpen ? (
        <p className="-mt-3 text-xs text-slate-500">Moving it to Estimate makes it a job — its client and project — so you can do the takeoff and estimate.</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card className={cn(next && "ring-2 ring-blue-400")}>
            <div id="follow-up" className="scroll-mt-24" />
            <CardHeader
              title="Follow-up"
              description={next ? "Done — when's the next one?" : "A To-Do for whoever's on it: it shows in To-Dos, on the Dashboard and the calendar."}
            />
            <CardBody className="space-y-3">
              {followUps.length === 0 && isOpen ? <p className="text-sm font-medium text-amber-700">No follow-up set — set one so this lead doesn&apos;t go quiet.</p> : null}
              {followUps.map((t) => {
                const late = t.dueDate && day0(t.dueDate) < day0(today);
                return (
                  <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Bell className={cn("h-4 w-4", late ? "text-rose-600" : "text-slate-400")} />
                      <span className={cn("font-medium", late ? "text-rose-700" : "text-slate-900")}>{t.dueDate ? fmtDate(t.dueDate) : "No date"}</span>
                      <span className="text-slate-700">{t.title.replace(/^Follow up: [^—]*(— )?/, "") || "Follow up"}</span>
                      {t.assignee ? <span className="text-xs text-slate-500">· {t.assignee.name}</span> : null}
                    </p>
                    <form action={completeFollowUp} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={lead.id} />
                      <input type="hidden" name="todoId" value={t.id} />
                      <select name="kind" className="input !h-8 !w-auto !py-0 text-xs" defaultValue="CALL" aria-label="How">
                        <option value="CALL">Called</option>
                        <option value="EMAIL">Emailed</option>
                        <option value="MEETING">Met</option>
                        <option value="NOTE">Other</option>
                      </select>
                      <input name="result" className="input !h-8 min-w-0 flex-1 text-sm" placeholder="What happened (optional)" aria-label="What happened" />
                      <SubmitButton size="sm" variant="success" pendingText="Saving…">
                        Done
                      </SubmitButton>
                    </form>
                  </div>
                );
              })}
              {isOpen ? (
                <form action={setFollowUp} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={lead.id} />
                  <input name="date" type="date" required className="input !w-40" defaultValue={dateInput(inThree)} aria-label="Follow up on" />
                  <input name="note" placeholder={followUps.length ? "Another follow-up…" : "e.g. Call about plans"} aria-label="Note" className="input min-w-[10rem] flex-1" />
                  <select name="assigneeId" className="input !w-44" defaultValue={lead.ownerId ?? user.id} aria-label="Who">
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton pendingText="Setting…">Set follow-up</SubmitButton>
                </form>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <div id="log" className="scroll-mt-24" />
            <CardHeader title="Log" description="Calls, emails, meetings and notes — and where it's been." />
            <CardBody className="space-y-4">
              <form action={addLeadEntry} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={lead.id} />
                <select name="kind" className="input !w-auto" defaultValue="CALL" aria-label="Kind">
                  <option value="CALL">Call</option>
                  <option value="EMAIL">Email</option>
                  <option value="MEETING">Meeting</option>
                  <option value="NOTE">Note</option>
                </select>
                <input name="text" required className="input min-w-0 flex-1" placeholder="What happened" aria-label="What happened" />
                <SubmitButton pendingText="Adding…">Add</SubmitButton>
              </form>
              <ol className="space-y-2.5">
                {lead.entries.map((e) => {
                  const Icon = KIND_ICON[e.kind as keyof typeof KIND_ICON] ?? MessageSquare;
                  return (
                    <li key={e.id} className="flex gap-2.5 text-sm">
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", e.kind === "STAGE" ? "text-blue-500" : "text-slate-400")} />
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
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact" />
            <CardBody className="space-y-1.5 text-sm">
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-blue-700 hover:underline">
                  <Phone className="h-4 w-4" /> {lead.phone}
                </a>
              ) : null}
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 break-all text-blue-700 hover:underline">
                  <Mail className="h-4 w-4 shrink-0" /> {lead.email}
                </a>
              ) : null}
              {lead.address ? (
                <p className="flex items-start gap-2 text-slate-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {[lead.address, [lead.city, lead.state].filter(Boolean).join(", "), lead.zip].filter(Boolean).join(" ")}
                </p>
              ) : null}
              {!lead.phone && !lead.email && !lead.address ? <p className="text-slate-500">No contact details yet.</p> : null}
              {lead.notes ? <p className="whitespace-pre-line border-t border-slate-100 pt-2 text-slate-700">{lead.notes}</p> : null}
            </CardBody>
          </Card>

          {isOpen ? (
            <Card>
              <CardHeader title="Meeting" description={lead.meetingAt ? undefined : "Goes on the calendar; an inquiry moves to Meeting."} />
              <CardBody className="space-y-2">
                {lead.meetingAt ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <CalendarClock className="h-4 w-4 text-slate-500" /> {fmtDateTime(lead.meetingAt)}
                  </p>
                ) : null}
                <form action={setMeeting} className="grid grid-cols-[1fr_6.5rem] gap-2">
                  <input type="hidden" name="id" value={lead.id} />
                  <input name="date" type="date" required className="input" defaultValue={dateInput(lead.meetingAt)} aria-label="Meeting day" />
                  <input
                    name="time"
                    type="time"
                    className="input"
                    defaultValue={lead.meetingAt ? `${String(lead.meetingAt.getHours()).padStart(2, "0")}:${String(lead.meetingAt.getMinutes()).padStart(2, "0")}` : ""}
                    aria-label="Meeting time"
                  />
                  <SubmitButton size="sm" variant="secondary" className="col-span-2" pendingText="Saving…">
                    {lead.meetingAt ? "Change meeting" : "Set meeting"}
                  </SubmitButton>
                </form>
              </CardBody>
            </Card>
          ) : null}

          <Collapsible summary="Edit details">
            <LeadForm action={updateLead} values={lead} sources={sources} staff={staff} meId={user.id} />
          </Collapsible>
          {!lead.projectId || lead.project?.isSpec ? (
            <ConfirmForm action={deleteLead} hidden={{ id: lead.id }} message={`Delete the lead ${name}? (To keep it in your win rate, mark it lost instead.)`} variant="ghost">
              <span className="text-xs text-rose-600">Delete lead</span>
            </ConfirmForm>
          ) : null}
        </div>
      </div>
    </div>
  );
}
