import { systemDb } from "./db";
import { ifFirst } from "./job-lock";
import { CHECKS, alertNeeded, checkState, type CheckName } from "./running-check-rules";

/**
 * The Station's "Running checks": the nightly backup, the morning email and the long-shift check each
 * write down every run here (and what failed, by builder). A watch every 15 minutes emails the Station's
 * owners once when one stops running or keeps failing, and once when it's working again. If the whole
 * program is down, nothing here can tell anyone — UptimeRobot does that.
 *
 * Through the system login: StationCheck is the Station's, no company's. Nothing here may throw. No
 * "server-only" here (and problems.ts loaded only when emailing): `npm run backup` records its run too.
 */

/** A run finished: `problems` is what failed ("JT&I Custom Homes: …"), empty when all went fine. */
export async function recordCheckRun(name: CheckName, problems: string[]) {
  try {
    const now = new Date();
    const before = await systemDb.stationCheck.findUnique({ where: { name }, select: { lastOkAt: true, failingSince: true } });
    const problem = problems.length ? problems.join("\n").slice(0, 2000) : null;
    const data = { lastRunAt: now, lastOkAt: problem ? (before?.lastOkAt ?? null) : now, problem, failingSince: problem ? (before?.failingSince ?? now) : null };
    await systemDb.stationCheck.upsert({ where: { name }, create: { name, ...data }, update: data });
  } catch (e) {
    console.error(`[running checks] couldn't record ${name}`, e);
  }
}

/** Every check with its last run and how it stands (for the Problems tab and the watch). */
export async function runningChecks(now = new Date()) {
  const rows = new Map((await systemDb.stationCheck.findMany()).map((r) => [r.name, r]));
  return CHECKS.map((check) => {
    const row = rows.get(check.name) ?? null;
    return { ...check, row, state: checkState(check, row, now, process.env[check.offEnv] === "off") };
  });
}

const hoursSince = (d: Date, now: Date) => {
  const h = Math.round((now.getTime() - d.getTime()) / 3_600_000);
  return h < 1 ? "less than an hour" : `${h} hour${h === 1 ? "" : "s"}`;
};

/** Emails the owners about any check that just went late or failing, or just came back. */
export async function watchRunningChecks(now = new Date()) {
  try {
    const { emailOwners } = await import("./problems");
    for (const c of await runningChecks(now)) {
      const alert = alertNeeded(c, c.state, c.row, now);
      if (!alert || !c.row) continue;
      if (alert === "back") {
        await emailOwners(`${c.label} is working again`, `${c.label} is working again`, ["It ran just now with nothing wrong."]);
        await systemDb.stationCheck.update({ where: { name: c.name }, data: { alertedAt: null } });
        continue;
      }
      const lines =
        c.state === "late"
          ? [`It hasn't run in ${hoursSince(c.row.lastRunAt, now)}. It should run every ${c.everyMin === 60 ? "hour" : `${c.everyMin} minutes`}.`, "Check that the program is running on Render, and its log."]
          : [`It has been failing for ${hoursSince(c.row.failingSince ?? c.row.lastRunAt, now)}.`, `What it said: ${c.row.problem}`];
      await emailOwners(c.state === "late" ? `${c.label} isn't running` : `${c.label} is failing`, c.state === "late" ? `${c.label} isn't running` : `${c.label} is failing`, lines);
      await systemDb.stationCheck.update({ where: { name: c.name }, data: { alertedAt: now } });
    }
  } catch (e) {
    console.error("[running checks] watch failed", e);
  }
}

/** Every 15 minutes; with several copies of the app online, one watches (job-lock.ts). */
export function startCheckWatch() {
  const g = globalThis as unknown as { __checkWatchTimer?: ReturnType<typeof setInterval> };
  if (g.__checkWatchTimer) return; // dev reloads re-run register()
  const watch = () => ifFirst("running-checks", 5 * 60 * 1000, () => watchRunningChecks()).catch(() => {});
  setTimeout(watch, 5 * 60_000); // after the checks have had their first run
  g.__checkWatchTimer = setInterval(watch, 15 * 60 * 1000);
}
