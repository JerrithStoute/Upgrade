/**
 * Lead pipeline rules (no database here, tested on its own): the stages, where a lead stands
 * once it's a job, and win rates.
 */

export const LEAD_STAGES = [
  { key: "INQUIRY", label: "Inquiry" },
  { key: "MEETING", label: "Meeting" },
  { key: "ESTIMATE", label: "Estimate" },
  { key: "PROPOSAL", label: "Proposal sent" },
  { key: "WON", label: "Won" },
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number]["key"] | "LOST";
export const stageLabel = (s: string) => (s === "LOST" ? "Lost" : (LEAD_STAGES.find((x) => x.key === s)?.label ?? s));
export const OPEN_STAGES = ["INQUIRY", "MEETING", "ESTIMATE", "PROPOSAL"];

/** Lead sources always offered (yours are added to these). */
export const COMMON_SOURCES = ["Referral", "Past client", "Website", "Facebook", "Google", "Yard sign", "Home show", "Realtor", "Other"];
/** Why a lead was lost — pick one, or type your own. */
export const LOST_REASONS = ["Price", "Went with another builder", "Timing", "Project cancelled", "Stopped responding", "Not a fit for us"];

/**
 * Where a lead stands once it's a job: contracted (or later) = won; an estimate sent (or the
 * job marked proposal sent) = proposal; otherwise it's being estimated. A cancelled job
 * doesn't move it — you mark a lead lost yourself, with the reason.
 */
export function stageFromJob(projectStatus: string, estimateStatuses: string[]): LeadStage | null {
  if (projectStatus === "CANCELLED") return null;
  if (["CONTRACTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"].includes(projectStatus)) return "WON";
  if (projectStatus === "PROPOSAL_SENT" || estimateStatuses.some((s) => s === "SENT" || s === "APPROVED")) return "PROPOSAL";
  return "ESTIMATE";
}

/** Won ÷ (won + lost); null before anything's decided. */
export function winRate(leads: { stage: string }[]) {
  const won = leads.filter((l) => l.stage === "WON").length;
  const lost = leads.filter((l) => l.stage === "LOST").length;
  return { won, lost, rate: won + lost ? won / (won + lost) : null };
}

/** Whole days between two dates. */
export function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}
