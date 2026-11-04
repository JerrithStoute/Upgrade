/**
 * The program's running checks (running-checks.ts): which there are, how often each runs, and when one
 * counts as late or failing — kept apart so it can be tested without a database.
 */

export type CheckName = "backup" | "morning" | "long-shift";

export const CHECKS: { name: CheckName; label: string; everyMin: number; offEnv: string }[] = [
  { name: "backup", label: "Nightly backup", everyMin: 60, offEnv: "BACKUP_AUTO" },
  { name: "morning", label: "Morning email", everyMin: 60, offEnv: "MORNING_EMAIL" },
  { name: "long-shift", label: "Long-shift check", everyMin: 15, offEnv: "LONG_SHIFT_EMAIL" },
];

export type CheckRow = { lastRunAt: Date; lastOkAt: Date | null; problem: string | null; failingSince: Date | null; alertedAt: Date | null } | null;

/** ok · late (hasn't run when it should have) · failing · off (turned off on this server) · waiting (never run yet). */
export type CheckState = "ok" | "late" | "failing" | "off" | "waiting";

/** Two runs missed (and a little slack for start-up) before it's late. */
export const lateAfterMs = (everyMin: number) => (everyMin * 2 + 10) * 60_000;

export function checkState(check: { everyMin: number }, row: CheckRow, now: Date, off: boolean): CheckState {
  if (off) return "off";
  if (!row) return "waiting";
  if (now.getTime() - row.lastRunAt.getTime() > lateAfterMs(check.everyMin)) return "late";
  return row.problem ? "failing" : "ok";
}

/**
 * Whether to email the owners now: "down" once when it goes late, or fails two runs in a row (one
 * blip isn't worth an email); "back" once it's fine again after a "down".
 */
export function alertNeeded(check: { everyMin: number }, state: CheckState, row: CheckRow, now: Date): "down" | "back" | null {
  if (!row) return null;
  const failingLong = state === "failing" && !!row.failingSince && now.getTime() - row.failingSince.getTime() >= check.everyMin * 60_000 * 0.9;
  if ((state === "late" || failingLong) && !row.alertedAt) return "down";
  if (state === "ok" && row.alertedAt) return "back";
  return null;
}
