import "server-only";
import { ifFirst } from "./job-lock";
import { db, systemDb } from "./db";
import { runAsCompany } from "./tenant";
import { appUrl, sendMail, simpleEmail } from "./mail";
import { teamRecipients } from "./notify-recipients";
import { companyClock } from "./company-zone";
import { parseTimeRules } from "./time-rules";
import { fmtHours } from "./time-math";

/**
 * "Still on the clock?" — once someone has been on the clock longer than Settings → Time clock
 * allows (12 hours to start), one email to whoever the builder picked (them, whoever can fix people's
 * time…), so a forgotten clock-out gets caught the same day. Once per stretch.
 */
export async function sendLongShiftEmails(now = new Date()) {
  const company = await db.company.findFirst({ select: { name: true, timeRules: true } });
  const rules = parseTimeRules(company?.timeRules);
  if (rules.longShiftHours == null) return 0;
  const since = new Date(now.getTime() - rules.longShiftHours * 3_600_000);
  const open = await db.timeEntry.findMany({
    where: { clockOut: null, longShiftSentAt: null, clockIn: { lt: since } },
    include: { user: { select: { id: true, name: true, email: true, active: true } }, project: { select: { number: true, name: true } } },
  });
  if (!open.length) return 0;
  const { wall } = await companyClock(now);
  let sent = 0;
  for (const e of open) {
    const hours = fmtHours(Math.floor(((now.getTime() - e.clockIn.getTime()) / 3_600_000) * 4) / 4, rules.hoursFormat); // to the quarter hour
    const started = wall(e.clockIn).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
    const job = `#${e.project.number} ${e.project.name}`;
    // Whoever the builder picked (Settings → Email notifications): the person on the clock, whoever fixes time…
    const to = (await teamRecipients("longShift", { worker: [e.user.id] })).map((email) => ({ email, self: email === e.user.email }));
    for (const { email, ...who } of to) {
      await sendMail(
        simpleEmail({
          to: email,
          brand: company?.name,
          subject: who.self ? `Still on the clock? (${hours} hrs)` : `${e.user.name} has been on the clock ${hours} hrs`,
          heading: who.self ? "Still on the clock?" : `${e.user.name} is still on the clock`,
          lines: [
            `${who.self ? "You've" : `${e.user.name} has`} been on the clock on ${job} since ${started} — ${hours} hours.`,
            who.self
              ? "If you forgot to clock out, clock out now and tell whoever does payroll when you really stopped."
              : "If they forgot to clock out, fix the time on Timesheets.",
          ],
          button: who.self ? { label: "Open the time clock", url: appUrl("/time") } : { label: "Open Timesheets", url: appUrl("/time/sheets") },
        }),
      ).catch((err) => console.error("[long shift] email failed:", err));
      sent++;
    }
    await db.timeEntry.update({ where: { id: e.id }, data: { longShiftSentAt: now } });
  }
  return sent;
}

/** Every 15 minutes, every company (LONG_SHIFT_EMAIL=off to disable). */
export function startLongShiftChecks() {
  const g = globalThis as unknown as { __longShiftTimer?: ReturnType<typeof setInterval> };
  if (g.__longShiftTimer) return; // dev reloads re-run register()
  const check = async () => {
    for (const { id } of await systemDb.company.findMany({ select: { id: true } }).catch(() => []))
      // With several copies of the app online, one checks each company (job-lock.ts).
      await ifFirst(`long-shift:${id}`, 10 * 60 * 1000, () =>
        runAsCompany(id, async () => {
          const n = await sendLongShiftEmails();
          if (n) console.log(`[long shift] company ${id}: ${n} email(s)`);
        }),
      ).catch((err) => console.error(`[long shift] company ${id} failed:`, err));
  };
  setTimeout(check, 120_000);
  g.__longShiftTimer = setInterval(check, 15 * 60 * 1000);
}
