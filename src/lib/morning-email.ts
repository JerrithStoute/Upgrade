import "server-only";
import { ifFirst } from "./job-lock";
import { db, systemDb } from "./db";
import { runAsCompany } from "./tenant";
import { appUrl, type MailSection } from "./mail";
import { sendCompanyMail, vendorContacts } from "./notify";
import { coverageLabel, coverageWarning, vendorsCoverage } from "./purchasing";
import { fmtDate } from "./utils";
import { insuranceStage, morningWindow, ymd } from "./morning-rules";
import { companyClock } from "@/lib/company-zone";
import { sendSelectionReminders } from "./notify-client";

/**
 * The morning email: once a day, each team member gets one email with what's theirs today —
 * to-dos and reminders due (or overdue), tasks starting, selections due — and admins also see
 * insurance running out. Nothing due: no email. Each person can turn theirs off on their
 * Account page.
 *
 * The same morning run emails subs whose insurance is about to lapse (30 days, 7 days, the day),
 * and clients whose selections are coming due (a week out, and the day).
 *
 * Checked hourly from the server (startMorningEmails), each company at 6 am on its own clock; what already went out is remembered in
 * the database (User.morningEmailOn, VendorInsurance.reminded), so a restart never sends twice.
 */

type Member = { id: string; name: string; email: string; role: string };
// (Not the sample job: it isn't real work — sample-job.ts.)
const ACTIVE_JOB = { status: { notIn: ["COMPLETED", "CANCELLED"] }, isSample: false };

/** What one person's morning email holds (empty: nothing to send). */
export async function morningSections(user: Member, now: Date): Promise<MailSection[]> {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const admin = user.role === "ADMIN";
  const [todos, tasks, selections, coverage] = await Promise.all([
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
    admin ? vendorsCoverage() : [],
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
  const insurance = coverage.filter((c) => c.state && (c.state.expired.length || c.state.expiring.length));
  if (insurance.length)
    sections.push({
      title: "Insurance running out",
      items: insurance.map((c) => ({
        text: c.vendor.name,
        note: coverageWarning({ ...c.state!, missing: [] }, fmtDate),
        url: appUrl(`/settings/vendors/${c.vendor.id}`),
      })),
    });
  return sections;
}

/** Sends this company's morning emails to everyone who hasn't had today's. Returns how many went out. */
export async function sendMorningEmails(now = new Date()) {
  const today = ymd(now);
  const users = await db.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF"] }, active: true, morningEmail: true, OR: [{ morningEmailOn: null }, { morningEmailOn: { not: today } }] },
    select: { id: true, name: true, email: true, role: true },
  });
  let sent = 0;
  for (const u of users) {
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

/** Emails subs whose insurance is about to lapse — once at 30 days, at 7, and the day it does. */
export async function sendInsuranceReminders(now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let sent = 0;
  for (const c of await vendorsCoverage()) {
    if (!c.state) continue; // their insurance isn't needed
    const due: { id: string; type: string; expiresAt: Date; stage: number }[] = [];
    for (const e of [...c.state.expired, ...c.state.expiring]) {
      // The certificate that sets this type's date (the latest confirmed one).
      const cert = c.vendor.insurance.find((i) => i.confirmed && i.type === e.type && i.expiresAt.getTime() === e.expiresAt.getTime());
      if (!cert) continue;
      const stage = insuranceStage(
        Math.round((new Date(e.expiresAt.getFullYear(), e.expiresAt.getMonth(), e.expiresAt.getDate()).getTime() - dayStart.getTime()) / 86400000),
        cert.reminded,
      );
      if (stage !== null) due.push({ id: cert.id, type: e.type, expiresAt: e.expiresAt, stage });
    }
    if (!due.length) continue;
    const { emails, portal } = await vendorContacts(c.vendor.id);
    // Marked first, with or without an address to send to: no second try every hour.
    for (const d of due) await db.vendorInsurance.update({ where: { id: d.id }, data: { reminded: d.stage } });
    if (!emails.length) continue;
    const lapsed = due.some((d) => d.stage === 0);
    const reached = await sendCompanyMail(emails, {
      subject: lapsed ? "Your insurance certificate has expired" : "Your insurance certificate is about to expire",
      heading: lapsed ? "We need a new insurance certificate" : "Your insurance is coming up for renewal",
      lines: [
        ...due.map((d) => `${coverageLabel(d.type)}: ${d.stage === 0 ? "expired" : "expires"} ${fmtDate(d.expiresAt)}`),
        "Please send the renewed certificate so there's no hold-up on your work or your payments.",
      ],
      button: portal ? { label: "Upload the new certificate", url: appUrl("/vendor/insurance") } : undefined,
      after: portal ? [] : ["Reply to this email with the new certificate attached."],
    });
    sent += reached.length;
  }
  return sent;
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
          const subs = await sendInsuranceReminders(now);
          const clients = await sendSelectionReminders(now);
          const team = await sendMorningEmails(now);
          if (subs || team || clients)
            console.log(`[morning email] company ${id}: ${team} to the team, ${subs} to subs about insurance, ${clients} to clients about selections`);
        }),
      ).catch((err) => console.error(`[morning email] company ${id} failed:`, err));
  };
  setTimeout(check, 90_000); // let the server finish starting
  g.__morningTimer = setInterval(check, 60 * 60 * 1000);
}
