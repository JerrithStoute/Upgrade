import Link from "@/components/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { companyPositions } from "@/lib/positions";
import { parseChanges, positionAccess, savedAccess } from "@/lib/access";
import { cn, fmtDate, titleCase } from "@/lib/utils";
import { workdaysBetween } from "@/lib/workdays";
import { loadWorkCal } from "@/lib/work-calendar";
import { companyClock } from "@/lib/company-zone";
import { Button, ConfirmForm, SubmitButton } from "@/components/ui";
import { MemberAccess, MemberInfo } from "@/components/team/member-cards";
import { deleteTeamMember, sendPasswordReset, toggleTeamMemberActive } from "../actions";

const small = "!h-7 !px-2.5 !text-xs";

/**
 * One person on the team, laid out like a sub's page: their info and what they can see side by side (edited
 * right here), the jobs they're on, and their sign-in. Everyone on the team can look someone up; only admins
 * change anything — and only admins ever see pay.
 */
export default async function TeamMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reset?: string }> }) {
  const me = await requireStaff();
  const admin = me.role === "ADMIN";
  const { id } = await params;
  const { reset } = await searchParams;
  const [m, positions] = await Promise.all([
    db.user.findFirst({
      where: { id, role: { in: ["ADMIN", "STAFF", "SUB"] } },
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        phone: true,
        role: true,
        active: true,
        positionId: true,
        access: true,
        vacationDays: true,
        payRate: true,
        salaried: true,
        createdAt: true,
        _count: { select: { dailyLogs: true, messages: true } },
      },
    }),
    companyPositions(),
  ]);
  if (!m) notFound();
  const noLogin = m.role === "SUB" || m.email.endsWith(".invalid");
  const { now } = await companyClock();
  const [jobs, todos, signIn, vacationUsed] = await Promise.all([
    db.project.findMany({
      where: { isTemplate: false, status: { notIn: ["COMPLETED", "CANCELLED"] }, OR: [{ managerId: m.id }, { members: { some: { userId: m.id } } }] },
      orderBy: { number: "desc" },
      select: { id: true, number: true, name: true, status: true, managerId: true },
    }),
    db.todo.groupBy({ by: ["projectId"], where: { assigneeId: m.id, status: "OPEN" }, _count: { _all: true } }),
    admin && !noLogin ? systemDb.user.findUnique({ where: { id: m.id }, select: { lastSignInAt: true, totpEnabledAt: true } }) : null,
    m.vacationDays != null ? vacationThisYear(m.id, now) : null,
  ]);
  const openTodos = new Map(todos.map((t) => [t.projectId, t._count._all]));
  const position = positions.find((p) => p.id === m.positionId);
  const isSelf = me.id === m.id;
  const hasHistory = m._count.dailyLogs > 0 || m._count.messages > 0;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/team" className="text-xs text-slate-500 hover:text-slate-800">
          ← Team
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">
              {m.name}
              {isSelf ? <span className="ml-2 text-sm font-normal text-slate-500">(you)</span> : null}
            </h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                {m.role === "ADMIN" ? "Admin" : noLogin ? "No sign-in" : (position?.name ?? "Staff")}
              </span>
              {!m.active ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Turned off</span>
              ) : signIn?.lastSignInAt ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Signed in {fmtDate(signIn.lastSignInAt, "MMM d")}</span>
              ) : null}
            </div>
          </div>
          {admin && !isSelf ? (
            <ConfirmForm
              action={deleteTeamMember}
              hidden={{ id: m.id }}
              message={hasHistory ? `${m.name} has written daily logs or messages, so they'll be turned off instead of removed. Continue?` : `Remove ${m.name}? This can't be undone.`}
              variant="ghost"
            >
              <span className="text-xs text-rose-600">{hasHistory ? "Turn off" : "Remove"}</span>
            </ConfirmForm>
          ) : null}
        </div>
      </div>

      {reset ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">A link to choose a new password was emailed to {m.email}.</p> : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <MemberInfo
          member={{
            id: m.id,
            name: m.name,
            title: m.title,
            phone: m.phone,
            email: noLogin ? null : m.email,
            role: m.role,
            positionId: m.positionId,
            vacationDays: m.vacationDays,
            vacationUsed,
            // Pay: admins only, always.
            ...(admin ? { pay: { rate: m.payRate, salaried: m.salaried } } : {}),
          }}
          positions={positions.map((p) => ({ id: p.id, name: p.name }))}
          canEdit={admin}
          isSelf={isSelf}
        />
        <MemberAccess
          memberId={m.id}
          name={m.name}
          role={noLogin ? "SUB" : m.role}
          value={savedAccess(position?.access, m.access)}
          base={positionAccess(position?.access)}
          changed={m.role === "STAFF" && Object.keys(parseChanges(m.access)).length > 0}
          canEdit={admin}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Jobs</h2>
        </header>
        {jobs.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-2 py-2 font-medium">{m.name.split(" ")[0]}&apos;s part</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Open to-dos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2">
                    <Link href={`/projects/${j.id}`} className="text-blue-700 hover:underline">
                      #{j.number} {j.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{j.managerId === m.id ? "Manager" : "On the team"}</td>
                  <td className="px-2 py-2 text-slate-600">{titleCase(j.status)}</td>
                  <td className={cn("px-4 py-2 text-right tabular-nums", openTodos.get(j.id) ? "text-slate-900" : "text-slate-400")}>{openTodos.get(j.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-3 text-sm text-slate-500">Not on any open job.</p>
        )}
      </section>

      {admin ? (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Sign-in</h2>
            {!noLogin ? <span className="text-xs text-slate-500">{m.email}</span> : null}
          </header>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
            <span className="min-w-52 flex-1 text-slate-600">
              {noLogin
                ? "Doesn't sign in — on the schedule and time clock only."
                : `${signIn?.lastSignInAt ? `Last signed in ${fmtDate(signIn.lastSignInAt, "MMM d, h:mm a")}` : "Hasn't signed in yet"} · two-step sign-in ${signIn?.totpEnabledAt ? "on" : "off"}`}
            </span>
            {!noLogin && m.active ? (
              <form action={sendPasswordReset}>
                <input type="hidden" name="id" value={m.id} />
                <SubmitButton size="sm" variant="secondary" className={small} pendingText="Sending…">
                  Send password reset
                </SubmitButton>
              </form>
            ) : null}
            {!isSelf ? (
              <form action={toggleTeamMemberActive}>
                <input type="hidden" name="id" value={m.id} />
                <Button type="submit" size="sm" variant="secondary" className={small}>
                  {m.active ? (noLogin ? "Turn off" : "Turn off sign-in") : "Turn back on"}
                </Button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Workdays of vacation this person has taken (or booked) this year — holidays and days off not counted. */
async function vacationThisYear(userId: string, now: Date) {
  const [cal, off] = await Promise.all([
    loadWorkCal(),
    db.calendarEvent.findMany({
      where: { kind: "TIME_OFF", timeOffType: "VACATION", userId, startDate: { lte: new Date(now.getFullYear(), 11, 31, 23) }, endDate: { gte: new Date(now.getFullYear(), 0, 1) } },
      select: { startDate: true, endDate: true },
    }),
  ]);
  return off.reduce((n, e) => n + workdaysBetween(cal, e.startDate, e.endDate), 0);
}
