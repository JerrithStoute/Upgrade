import "server-only";
import { ifFirst } from "./job-lock";
import { db, systemDb } from "./db";
import { runAsCompany } from "./tenant";
import { appUrl, type MailSection } from "./mail";
import { sendCompanyMail } from "./notify";
import { teamRecipients } from "./notify-recipients";
import { daysOpen, problemText } from "./paperwork";
import { vendorsPaperwork } from "./paperwork-server";
import { fmtDate } from "./utils";
import { isPaperworkDay, morningWindow, ymd } from "./morning-rules";
import { companyClock } from "@/lib/company-zone";
import { sendSelectionReminders } from "./notify-client";

/**
 * The morning email: once a day, each team member the builder picked (Settings → Email notifications)
 * gets one email with what's theirs today — to-dos and reminders due (or overdue), tasks starting,
 * selections due. Nothing due: no email. Each person can still turn theirs off on their Account page.
 *
 * The same morning run sends, when the builder turned them on: clients' selection deadlines (a week out,
 * and the day), and on Mondays the paperwork email (who's missing what) to whoever they picked. Nothing
 * ever goes to subs by itself.
 *
 * Checked hourly from the server (startMorningEmails), each company at 6 am on its own clock; what already went out is remembered in
 * the database (User.morningEmailOn, Company.paperworkEmailOn), so a restart never sends twice.
 */

type Member = { id: string; name: string; email: string; role: string };
// (Not the sample job: it isn't real work — sample-job.ts.)
const ACTIVE_JOB = { status: { notIn: ["COMPLETED", "CANCELLED"] }, isSample: false };

/** What one person's morning email holds (empty: nothing to send). */
export async function morningSections(user: Member, now: Date): Promise<MailSection[]> {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const admin = user.role === "ADMIN";
  const [todos, tasks, selections] = await Promise.all([
    db.todo.findMany({
      where: { status: "OPEN", dueDate: { lt: dayEnd }, OR: [{ assigneeId: user.id }, { assigneeId: null, createdById: user.id }], NOT: { project: { isSample: true } } },
      orderBy: { dueDate: "asc" },
      include: { project: { select: { id: true, name: true } }, task: { select: { name: true } } },
      take: 40,
    }),
    db.scheduleTask.findMany({
      where: {
        startDate: { gte: dayStart, lt: dayEnd },
        percentComplete: { lt: 100 },
        project: ACTIVE_JOB,
        OR: [{ assigneeId: user.id }, { project: { managerId: user.id } }],
      },
      orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
      include: { project: { select: { id: true, name: true } }, vendor: { select: { name: true } } },
      take: 40,
    }),
    db.selection.findMany({
      where: {
        status: "PENDING",
        dueDate: { lt: dayEnd },
        project: { ...ACTIVE_JOB, ...(admin ? { OR: [{ managerId: user.id }, { managerId: null }] } : { managerId: user.id }) },
      },
      orderBy: { dueDate: "asc" },
      include: { project: { select: { id: true, name: true } } },
      take: 40,
    }),
  ]);
  const late = (d: Date | null) => (d && d < dayStart ? `was due ${fmtDate(d)}` : "due today");
  const sections: MailSection[] = [];
  if (todos.length)
    sections.push({
      title: "To-dos and reminders",
      items: todos.map((t) => ({
        text: t.title,
        note: [t.project?.name, t.task ? `for "${t.task.name}"` : null, late(t.dueDate)].filter(Boolean).join(" · "),
        url: appUrl(t.project ? `/projects/${t.project.id}/todos` : "/todos"),
      })),
    });
  if (tasks.length)
    sections.push({
      title: "Starting today",
      items: tasks.map((t) => ({
        text: t.name,
        note: [t.project.name, t.vendor?.name].filter(Boolean).join(" · "),
        url: appUrl(`/projects/${t.project.id}/schedule`),
      })),
    });
  if (selections.length)
    sections.push({
      title: "Selections waiting on a choice",
      items: selections.map((s) => ({ text: s.title, note: `${s.project.name} · ${late(s.dueDate)}`, url: appUrl(`/projects/${s.project.id}/selections`) })),
    });
  return sections;
}

/** Sends this company's morning emails to everyone who hasn't had today's. Returns how many went out. */
export async function sendMorningEmails(now = new Date()) {
  const today = ymd(now);
  const picked = new Set(await teamRecipients("morning"));
  if (!picked.size) return 0;
  const users = await db.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF"] }, active: true, morningEmail: true, OR: [{ morningEmailOn: null }, { morningEmailOn: { not: today } }] },
    select: { id: true, name: true, email: true, role: true },
  });
  let sent = 0;
  for (const u of users.filter((x) => picked.has(x.email))) {
    const sections = await morningSections(u, now);
    // Marked first: a send that fails half-way is not tried again every hour.
    await db.user.update({ where: { id: u.id }, data: { morningEmailOn: today } });
    if (!sections.length) continue;
    const count = sections.reduce((n, s) => n + s.items.length, 0);
    const reached = await sendCompanyMail([u.email], {
      subject: `Today: ${count} thing${count === 1 ? "" : "s"} on your list`,
      heading: `Good morning, ${u.name.split(" ")[0]}`,
      lines: [`Here's what's yours for ${fmtDate(now)}.`],
      sections,
      button: { label: "Open The Builder Station", url: appUrl("/dashboard") },
      after: ["You can turn this email off on your Account page."],
    });
    sent += reached.length;
  }
  return sent;
}

/**
 * Mondays: one email to whoever the builder picked — every sub missing paperwork, and insurance running out
 * within 30 days, with how long each has been open. Off until the builder turns it on.
 */
export async function sendPaperworkEmail(now = new Date()) {
  if (!isPaperworkDay(now)) return 0;
  const today = ymd(now);
  const company = await db.company.findFirst({ select: { id: true, paperworkEmailOn: true } });
  if (!company || company.paperworkEmailOn === today) return 0;
  const to = await teamRecipients("paperworkWeekly");
  // Marked first: a send that fails half-way is not tried again every hour.
  await db.company.update({ where: { id: company.id }, data: { paperworkEmailOn: today } });
  if (!to.length) return 0;
  const open = (await vendorsPaperwork(undefined, now)).filter((v) => v.problems.length || v.toConfirm);
  if (!open.length) return 0;
  const reached = await sendCompanyMail(to, {
    subject: `Paperwork: ${open.length} sub${open.length === 1 ? "" : "s"} to follow up`,
    heading: "Subs' paperwork this week",
    lines: ["Missing, expired or running out within 30 days — follow up with each, or untick what you don't need from them."],
    sections: [
      {
        title: "To follow up",
        items: open.map((v) => ({
          text: v.vendor.name,
          note: [
            ...v.problems.map((l) => {
              const days = l.status !== "soon" ? daysOpen(l.since, now) : 0;
              return `${problemText(l, (d) => fmtDate(d, "MMM d"))}${days ? ` (${days} day${days === 1 ? "" : "s"})` : ""}`;
            }),
            ...(v.toConfirm ? [`${v.toConfirm} they sent to look over`] : []),
          ].join(" · "),
          url: appUrl(`/vendors/${v.vendor.id}`),
        })),
      },
    ],
    button: { label: "Open Subs & vendors", url: appUrl("/vendors") },
    after: ["You chose to get this in Settings → Email notifications."],
  });
  return reached.length;
}

/**
 * Runs from the server: every company's morning emails, checked at start-up and then hourly (MORNING_EMAIL=off to
 * disable). With several copies of the app online, one sends each company's (job-lock.ts); each email is marked as
 * sent before it goes, so the next hour's check doesn't send it again.
 */
export function startMorningEmails() {
  const g = globalThis as unknown as { __morningTimer?: ReturnType<typeof setInterval> };
  if (g.__morningTimer) return; // dev reloads re-run register()
  const check = async () => {
    for (const { id } of await systemDb.company.findMany({ select: { id: true } }).catch(() => []))
      await ifFirst(`morning:${id}`, 30 * 60 * 1000, () =>
        runAsCompany(id, async () => {
          // Each company's own morning: its clock, its day.
          const now = (await companyClock()).now;
          if (!morningWindow(now)) return;
          const paperwork = await sendPaperworkEmail(now);
          const clients = await sendSelectionReminders(now);
          const team = await sendMorningEmails(now);
          if (paperwork || team || clients)
            console.log(`[morning email] company ${id}: ${team} to the team, ${paperwork} about paperwork, ${clients} to clients about selections`);
        }),
      ).catch((err) => console.error(`[morning email] company ${id} failed:`, err));
  };
  setTimeout(check, 90_000); // let the server finish starting
  g.__morningTimer = setInterval(check, 60 * 60 * 1000);
}
