import Link from "next/link";
import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { Bell, ChevronLeft, ChevronRight, Palmtree, Trash2, TriangleAlert } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { staffUsers } from "@/lib/projects";
import { cn, fmtDate } from "@/lib/utils";
import { dayKey, isWorkday, workdaysBetween } from "@/lib/workdays";
import { loadWorkCal } from "@/lib/work-calendar";
import { Card, CardBody, CardHeader, Field, FormGrid, SubmitButton, Table, TBody, THead, Td, Th, Tr } from "@/components/ui";
import { addHoliday, addReminder, addTimeOff, deleteCalendarEvent } from "../actions";

export const metadata = { title: "Calendar" };

const TYPE_LABEL: Record<string, string> = { VACATION: "Vacation", SICK: "Sick", PERSONAL: "Personal" };
const noonOf = (key: string) => new Date(`${key}T12:00:00`);

/**
 * The company calendar: every active job's tasks, holidays (nobody works — schedules skip
 * them), who's off, and reminders. Month or week; pick a day to see it all and add to it.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; day?: string; job?: string; who?: string; holiday?: string }>;
}) {
  const user = await requireStaff();
  const q = await searchParams;
  const today = new Date();
  const week = q.view === "week";
  // The month (or the week of the picked day) shown.
  const anchor = q.day && /^\d{4}-\d{2}-\d{2}$/.test(q.day) ? noonOf(q.day) : q.month && /^\d{4}-\d{2}$/.test(q.month) ? noonOf(`${q.month}-01`) : today;
  const gridStart = week ? startOfWeek(anchor, { weekStartsOn: 1 }) : startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = week ? endOfWeek(anchor, { weekStartsOn: 1 }) : endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate(), 12); d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const [cal, staff, projects, events, todos, yearOff] = await Promise.all([
    loadWorkCal(),
    staffUsers(),
    db.project.findMany({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
    db.calendarEvent.findMany({
      where: { startDate: { lte: addDays(gridEnd, 1) }, endDate: { gte: addDays(gridStart, -1) } },
      include: { user: { select: { id: true, name: true } } },
    }),
    db.todo.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { gte: addDays(gridStart, -1), lte: addDays(gridEnd, 1) },
        ...(q.who ? { assigneeId: q.who } : {}),
        ...(q.job ? { projectId: q.job } : {}),
      },
      include: { assignee: { select: { name: true } }, project: { select: { number: true } } },
    }),
    db.calendarEvent.findMany({
      where: { kind: "TIME_OFF", startDate: { lte: new Date(today.getFullYear(), 11, 31, 23) }, endDate: { gte: new Date(today.getFullYear(), 0, 1) } },
      include: { user: { select: { id: true } } },
    }),
  ]);
  const tasks = await db.scheduleTask.findMany({
    where: {
      startDate: { lte: addDays(gridEnd, 1) },
      endDate: { gte: addDays(gridStart, -1) },
      project: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      ...(q.job ? { projectId: q.job } : {}),
      ...(q.who ? { assigneeId: q.who } : {}),
    },
    orderBy: [{ startDate: "asc" }],
    include: { project: { select: { id: true, number: true, name: true } }, assignee: { select: { id: true, name: true } } },
  });

  const inDay = (key: string, x: { startDate: Date; endDate: Date }) => dayKey(x.startDate) <= key && key <= dayKey(x.endDate);
  const holidays = events.filter((e) => e.kind === "HOLIDAY");
  const off = events.filter((e) => e.kind === "TIME_OFF" && (!q.who || e.userId === q.who));
  // A task falls on a day someone assigned to it is off.
  const conflicts = tasks.flatMap((t) =>
    off
      .filter((o) => o.userId && o.userId === t.assigneeId && dayKey(o.startDate) <= dayKey(t.endDate) && dayKey(t.startDate) <= dayKey(o.endDate))
      .map((o) => ({ task: t, off: o })),
  );

  const params = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { month: q.month, view: q.view, day: q.day, job: q.job, who: q.who, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return `/schedule/calendar${s ? `?${s}` : ""}`;
  };
  const here = params({});
  const prev = week ? params({ day: dayKey(addDays(anchor, -7)), month: undefined }) : params({ month: format(addMonths(anchor, -1), "yyyy-MM"), day: undefined });
  const next = week ? params({ day: dayKey(addDays(anchor, 7)), month: undefined }) : params({ month: format(addMonths(anchor, 1), "yyyy-MM"), day: undefined });
  const picked = q.day && /^\d{4}-\d{2}-\d{2}$/.test(q.day) ? q.day : null;
  const limit = week ? 50 : 3;

  // Vacation this year, by person: workdays off (holidays and days off not counted).
  const usage = staff.map((u) => {
    const mine = yearOff.filter((e) => e.userId === u.id);
    const sum = (type: string) => mine.filter((e) => e.timeOffType === type).reduce((n, e) => n + workdaysBetween(cal, e.startDate, e.endDate), 0);
    return { ...u, vacation: sum("VACATION"), sick: sum("SICK"), personal: sum("PERSONAL") };
  });
  const allowance = new Map(
    (await db.user.findMany({ where: { id: { in: staff.map((s) => s.id) } }, select: { id: true, vacationDays: true } })).map((u) => [u.id, u.vacationDays]),
  );

  return (
    <div className="space-y-5">
      {q.holiday !== undefined ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Holiday added{Number(q.holiday) > 0 ? ` — work on ${q.holiday} active job${q.holiday === "1" ? "" : "s"} moved out (logged as a delay)` : ""}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={prev} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50" aria-label="Back">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link href={next} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50" aria-label="Forward">
          <ChevronRight className="h-4 w-4" />
        </Link>
        <Link
          href={params({ month: undefined, day: week ? dayKey(today) : undefined })}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Today
        </Link>
        <h2 className="ml-1 text-lg font-semibold text-slate-900">{week ? `Week of ${fmtDate(gridStart)}` : format(anchor, "MMMM yyyy")}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form action="/schedule/calendar" className="flex items-center gap-2">
            {q.month ? <input type="hidden" name="month" value={q.month} /> : null}
            {q.view ? <input type="hidden" name="view" value={q.view} /> : null}
            {q.day ? <input type="hidden" name="day" value={q.day} /> : null}
            <select name="job" defaultValue={q.job ?? ""} className="input !h-8 !w-48 !py-0 text-xs" aria-label="Job">
              <option value="">All jobs</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
            <select name="who" defaultValue={q.who ?? ""} className="input !h-8 !w-40 !py-0 text-xs" aria-label="Person">
              <option value="">Everyone</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Filter
            </button>
          </form>
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
            <Link
              href={params({ view: undefined, day: picked ?? undefined, month: format(anchor, "yyyy-MM") })}
              className={cn("rounded px-2.5 py-1 font-medium", !week ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              Month
            </Link>
            <Link
              href={params({ view: "week", day: picked ?? dayKey(anchor), month: undefined })}
              className={cn("rounded px-2.5 py-1 font-medium", week ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              Week
            </Link>
          </div>
        </div>
      </div>

      {conflicts.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert className="h-4 w-4" /> Assigned while off
          </p>
          <ul className="mt-1 space-y-0.5">
            {conflicts.slice(0, 8).map((c, i) => (
              <li key={i}>
                {c.off.user?.name} is off {fmtDate(c.off.startDate)}
                {dayKey(c.off.startDate) !== dayKey(c.off.endDate) ? ` – ${fmtDate(c.off.endDate)}` : ""} ({TYPE_LABEL[c.off.timeOffType ?? ""] ?? "Off"}) but has{" "}
                <Link href={`/projects/${c.task.project.id}/schedule?task=${c.task.id}`} className="font-medium underline">
                  #{c.task.project.number} {c.task.name}
                </Link>
                .
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The grid: Monday first. Days off are shaded; holidays say so. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = dayKey(d);
            const hol = holidays.filter((h) => inDay(key, h));
            const away = off.filter((o) => inDay(key, o));
            // Tasks show on the days they're worked (not weekends off or holidays).
            const work = isWorkday(cal, d) ? tasks.filter((t) => inDay(key, t)) : [];
            const due = todos.filter((t) => t.dueDate && dayKey(t.dueDate) === key);
            const items = [
              ...hol.map((h) => ({ id: `h${h.id}`, el: <span className="font-semibold text-rose-700">{h.title}</span> })),
              ...away.map((o) => ({
                id: `o${o.id}`,
                el: (
                  <span className="text-emerald-800">
                    <Palmtree className="mr-0.5 inline h-3 w-3" />
                    {o.user?.name.split(" ")[0] ?? "Off"} · {TYPE_LABEL[o.timeOffType ?? ""] ?? "Off"}
                  </span>
                ),
              })),
              ...due.map((t) => ({
                id: `r${t.id}`,
                el: (
                  <span className="text-violet-800">
                    <Bell className="mr-0.5 inline h-3 w-3" />
                    {t.title}
                  </span>
                ),
              })),
              ...work.map((t) => ({
                id: `t${t.id}`,
                el: (
                  <Link href={`/projects/${t.project.id}/schedule?task=${t.id}`} className="block truncate hover:underline">
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: t.color }} />
                    <span className="text-slate-500">#{t.project.number}</span> {t.name}
                  </Link>
                ),
              })),
            ];
            const offDay = !isWorkday(cal, d);
            const inMonth = week || d.getMonth() === anchor.getMonth();
            return (
              <div
                key={key}
                className={cn(
                  "min-h-28 border-b border-r border-slate-100 p-1.5 text-[11px] leading-snug [&:nth-child(7n)]:border-r-0",
                  week && "min-h-64",
                  offDay && "bg-slate-50",
                  hol.length && "bg-rose-50/60",
                  picked === key && "ring-2 ring-inset ring-blue-400",
                )}
              >
                <Link
                  href={params({ day: key, ...(week ? {} : { month: format(anchor, "yyyy-MM") }) })}
                  className={cn(
                    "mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold hover:bg-blue-100",
                    key === dayKey(today) ? "bg-blue-600 text-white hover:bg-blue-700" : inMonth ? "text-slate-800" : "text-slate-400",
                  )}
                  title="See this day and add to it"
                >
                  {d.getDate()}
                </Link>
                <div className="space-y-0.5">
                  {items.slice(0, limit).map((it) => (
                    <div key={it.id} className="truncate">
                      {it.el}
                    </div>
                  ))}
                  {items.length > limit ? (
                    <Link href={params({ day: key })} className="block text-slate-500 hover:underline">
                      +{items.length - limit} more
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The day you picked: everything on it, and adding to it. */}
      {picked ? (
        <DayPanel
          day={picked}
          here={here}
          isAdmin={user.role === "ADMIN"}
          me={user.id}
          staff={staff}
          projects={projects}
          holidays={holidays.filter((h) => inDay(picked, h))}
          off={off.filter((o) => inDay(picked, o))}
          todos={todos.filter((t) => t.dueDate && dayKey(t.dueDate) === picked)}
          tasks={isWorkday(cal, noonOf(picked)) ? tasks.filter((t) => inDay(picked, t)) : []}
          workday={isWorkday(cal, noonOf(picked))}
        />
      ) : (
        <p className="text-sm text-slate-500">Click a day&apos;s number to see everything on it and add a holiday, time off or a reminder.</p>
      )}

      <Card>
        <CardHeader
          title={`Time off — ${today.getFullYear()}`}
          description="Workdays off this year (holidays and days you don't work aren't counted). Set each person's vacation days in Settings → Team."
        />
        <Table className="rounded-t-none border-0 shadow-none">
          <THead>
            <tr>
              <Th>Team member</Th>
              <Th right>Vacation used</Th>
              <Th right>Allowed / yr</Th>
              <Th right>Left</Th>
              <Th right>Sick</Th>
              <Th right>Personal</Th>
            </tr>
          </THead>
          <TBody>
            {usage.map((u) => {
              const allowed = allowance.get(u.id);
              const left = allowed != null ? allowed - u.vacation : null;
              return (
                <Tr key={u.id}>
                  <Td className="font-medium text-slate-900">{u.name}</Td>
                  <Td right>{u.vacation}</Td>
                  <Td right className="text-slate-500">
                    {allowed ?? "—"}
                  </Td>
                  <Td right className={cn(left != null && left < 0 && "font-semibold text-rose-700")}>
                    {left ?? "—"}
                  </Td>
                  <Td right>{u.sick}</Td>
                  <Td right>{u.personal}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function DayPanel({
  day,
  here,
  isAdmin,
  me,
  staff,
  projects,
  holidays,
  off,
  todos,
  tasks,
  workday,
}: {
  day: string;
  here: string;
  isAdmin: boolean;
  me: string;
  staff: { id: string; name: string }[];
  projects: { id: string; number: number; name: string }[];
  holidays: { id: string; title: string }[];
  off: { id: string; title: string; userId: string | null; notes: string | null }[];
  todos: { id: string; title: string; assignee: { name: string } | null; project: { number: number } | null }[];
  tasks: { id: string; name: string; project: { id: string; number: number; name: string }; assignee: { name: string } | null }[];
  workday: boolean;
}) {
  const remove = (id: string, label: string) => (
    <form action={deleteCalendarEvent}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={here} />
      <button type="submit" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${label}`}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </form>
  );
  return (
    <Card className="border-blue-200">
      <CardHeader title={fmtDate(noonOf(day), "EEEE, MMMM d, yyyy")} description={workday ? "A workday" : "Not a workday (day off or holiday)"} />
      <CardBody className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 text-sm">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-2 font-semibold text-rose-700">
                {h.title} (holiday) {isAdmin ? remove(h.id, h.title) : null}
              </div>
            ))}
            {off.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-emerald-800">
                <Palmtree className="h-3.5 w-3.5" /> {o.title}
                {o.notes ? <span className="text-xs text-slate-500">— {o.notes}</span> : null}
                {isAdmin || o.userId === me ? remove(o.id, o.title) : null}
              </div>
            ))}
            {todos.map((t) => (
              <div key={t.id} className="text-violet-800">
                <Bell className="mr-1 inline h-3.5 w-3.5" />
                {t.title}
                <span className="text-xs text-slate-500">
                  {t.assignee ? ` — ${t.assignee.name}` : ""}
                  {t.project ? ` · #${t.project.number}` : ""}
                </span>
              </div>
            ))}
            {tasks.map((t) => (
              <div key={t.id}>
                <Link href={`/projects/${t.project.id}/schedule?task=${t.id}`} className="hover:underline">
                  <span className="text-slate-500">
                    #{t.project.number} {t.project.name} ·
                  </span>{" "}
                  {t.name}
                </Link>
                {t.assignee ? <span className="text-xs text-slate-500"> — {t.assignee.name}</span> : null}
              </div>
            ))}
            {!holidays.length && !off.length && !todos.length && !tasks.length ? <p className="text-slate-500">Nothing on this day.</p> : null}
          </div>

          <form action={addReminder} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <input type="hidden" name="date" value={day} />
            <input type="hidden" name="back" value={here} />
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
              <Bell className="h-4 w-4 text-violet-600" /> Reminder
            </p>
            <input name="title" required placeholder="e.g. Call the brick supplier" className="input" aria-label="Reminder" />
            <div className="flex gap-2">
              <select name="assigneeId" defaultValue={me} className="input" aria-label="For">
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select name="projectId" defaultValue="" className="input" aria-label="Job">
                <option value="">No job</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton size="sm" variant="secondary">
              Add reminder
            </SubmitButton>
            <p className="text-[11px] text-slate-500">It shows here and in their To-Dos that day. To tie one to a task (it moves with it), add it on the task.</p>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <form action={addTimeOff} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <input type="hidden" name="back" value={here} />
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
              <Palmtree className="h-4 w-4 text-emerald-600" /> Time off
            </p>
            <FormGrid>
              <Field label="Who" htmlFor="off-who">
                <select id="off-who" name="userId" defaultValue={me} className="input" disabled={!isAdmin}>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type" htmlFor="off-type">
                <select id="off-type" name="type" className="input" defaultValue="VACATION">
                  <option value="VACATION">Vacation</option>
                  <option value="SICK">Sick</option>
                  <option value="PERSONAL">Personal</option>
                </select>
              </Field>
              <Field label="From" htmlFor="off-start">
                <input id="off-start" name="start" type="date" required defaultValue={day} className="input" />
              </Field>
              <Field label="Through" htmlFor="off-end">
                <input id="off-end" name="end" type="date" defaultValue={day} className="input" />
              </Field>
            </FormGrid>
            <input name="notes" placeholder="Note (optional)" className="input" aria-label="Note" />
            <SubmitButton size="sm" variant="secondary">
              Add time off
            </SubmitButton>
          </form>

          {isAdmin ? (
            <form action={addHoliday} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <input type="hidden" name="back" value={here} />
              <p className="text-sm font-medium text-slate-800">Holiday</p>
              <input name="title" required placeholder="e.g. Thanksgiving" className="input" aria-label="Holiday name" />
              <FormGrid>
                <Field label="From" htmlFor="hol-start">
                  <input id="hol-start" name="start" type="date" required defaultValue={day} className="input" />
                </Field>
                <Field label="Through" htmlFor="hol-end">
                  <input id="hol-end" name="end" type="date" defaultValue={day} className="input" />
                </Field>
              </FormGrid>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" name="moveWork" defaultChecked className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                <span>Move work scheduled on it out on active jobs (logged as a delay on each)</span>
              </label>
              <SubmitButton size="sm" variant="secondary">
                Add holiday
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
