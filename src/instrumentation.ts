import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Runs once when the server starts. Checking the session secret here makes a
 * misconfigured production server fail at startup instead of on the first login.
 * It also starts the nightly backups, the morning emails, the long-shift emails and the QuickBooks
 * Online updates.
 */
export async function register() {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return; // `next build` doesn't need the secret
  const { getSessionSecret } = await import("./lib/session-secret");
  getSessionSecret();
  // Online, start only when everything it needs is set — never half-configured.
  if (process.env.NODE_ENV === "production") {
    const { productionProblems } = await import("./lib/startup-checks");
    const problems = productionProblems(process.env);
    if (problems.length) throw new Error(`The server can't start:\n- ${problems.join("\n- ")}`);
  }

  // The speed alarm: slow requests are written to the log (request-stats.ts).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSpeedAlarm } = await import("./lib/request-stats");
    await startSpeedAlarm();
  }

  // Nightly backup of the database and uploads (BACKUP_AUTO=off to disable).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BACKUP_AUTO !== "off") {
    const { startNightlyBackups } = await import("./lib/backup");
    startNightlyBackups();
  }

  // The morning email — what's due today, and insurance about to lapse (MORNING_EMAIL=off to disable).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MORNING_EMAIL !== "off") {
    const { startMorningEmails } = await import("./lib/morning-email");
    startMorningEmails();
  }

  // "Still on the clock?" emails for long shifts (Settings → Time clock; LONG_SHIFT_EMAIL=off to disable).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.LONG_SHIFT_EMAIL !== "off") {
    const { startLongShiftChecks } = await import("./lib/long-shifts");
    startLongShiftChecks();
  }

  // QuickBooks Online: each connected company updated every 15 minutes (QBO_SYNC=off to disable).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.QBO_SYNC !== "off") {
    const { startQboSync } = await import("./lib/qbo/sync");
    startQboSync();
  }
}
