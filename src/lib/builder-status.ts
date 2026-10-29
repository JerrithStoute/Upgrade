/**
 * Where a builder company stands with The Builder Station (StationBuilder), set by hand in the Station
 * until billing does it:
 *   - TRIAL:  trying it out, until `trialEndsAt` (their admins see a note the last week, and after);
 *   - ACTIVE: a customer (no record at all counts as Active);
 *   - FREE:   free on purpose (founding builders, friends);
 *   - PAUSED: nobody in the company can sign in — team, clients or vendors. Their data is kept.
 */

export const BUILDER_STATUSES = ["TRIAL", "ACTIVE", "FREE", "PAUSED"] as const;
export type BuilderStatus = (typeof BUILDER_STATUSES)[number];

export const STATUS_LABEL: Record<BuilderStatus, string> = { TRIAL: "Trial", ACTIVE: "Active", FREE: "Free", PAUSED: "Paused" };

export const readStatus = (s: string | null | undefined): BuilderStatus => (BUILDER_STATUSES as readonly string[]).includes(s ?? "") ? (s as BuilderStatus) : "ACTIVE";

/** What a person of a paused company is told when they try to sign in. */
export const PAUSED_MESSAGE = "This company's account is paused. Contact The Builder Station to turn it back on.";

const DAY = 86_400_000;

/** Calendar days from `now` to `at`: 0 the same day, negative once it's past. */
export const daysUntil = (at: Date, now: Date) => {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(at) - day(now)) / DAY);
};

/**
 * The note a trial company's admins see: from a week before the trial ends, and after it has ended
 * (until the Station changes their status). Null otherwise.
 */
export function trialNote(status: BuilderStatus, trialEndsAt: Date | null, now: Date): string | null {
  if (status !== "TRIAL" || !trialEndsAt) return null;
  const d = daysUntil(trialEndsAt, now);
  if (d > 7) return null;
  if (d < 0) return "Your free trial has ended. The Builder Station will be in touch — or contact us any time.";
  return `Your free trial ends ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}. Questions? Contact The Builder Station.`;
}

export type BuilderUsage = {
  status: BuilderStatus;
  trialEndsAt: Date | null;
  signedUp: Date;
  jobs: number;
  lastSignIn: Date | null;
  /** The last time anyone used the program (usage.ts) — a sign-in lasts weeks, so this is the one to trust. */
  lastActive?: Date | null;
};

/** Things worth a look in the Station's Builders list (most pressing first). */
export function healthFlags(b: BuilderUsage, now: Date): { text: string; tone: "bad" | "warn" | "info" }[] {
  const out: { text: string; tone: "bad" | "warn" | "info" }[] = [];
  if (b.status === "PAUSED") out.push({ text: "Paused", tone: "bad" });
  if (b.status === "TRIAL" && b.trialEndsAt) {
    const d = daysUntil(b.trialEndsAt, now);
    if (d <= 0) out.push({ text: d === 0 ? "Trial ends today" : `Trial ended ${-d} day${d === -1 ? "" : "s"} ago`, tone: "bad" });
    else if (d <= 7) out.push({ text: `Trial ends in ${d} day${d === 1 ? "" : "s"}`, tone: "warn" });
  }
  if (b.jobs === 0 && now.getTime() - b.signedUp.getTime() > 3 * DAY) out.push({ text: "No jobs yet", tone: "warn" });
  const last = b.lastActive ?? b.lastSignIn;
  if (!last) out.push({ text: "Never signed in", tone: "warn" });
  else if (now.getTime() - last.getTime() > 7 * DAY) out.push({ text: `No activity in ${Math.floor((now.getTime() - last.getTime()) / DAY)} days`, tone: "warn" });
  return out;
}
