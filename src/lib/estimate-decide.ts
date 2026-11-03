import "server-only";
import { db } from "./db";
import { logActivity } from "./activity";
import { lineTotals } from "./finance";
import { fmtDate, money } from "./utils";
import { companyClock } from "./company-zone";
import { goodThroughDay, parseProposalOptions, proposalExpired } from "./proposal-options";
import { takeBidSnapshot } from "./bid-snapshots";

/**
 * The client's answer to a proposal, from their portal. Approving does what "Mark approved"
 * does on the estimate — the estimate is approved and a job still being sold becomes
 * Contracted — and keeps their typed signature. (Making it the budget is still your step.)
 */

async function sentEstimate(clientId: string, id: string) {
  const est = await db.estimate.findFirst({ where: { id, project: { clientId } }, include: { items: true, project: { select: { id: true, status: true } } } });
  if (!est) throw new Error("Proposal not found");
  if (est.status !== "SENT") throw new Error("This proposal isn't waiting for your answer");
  return est;
}

/** Past its "good through" day (the company's today): the client can't approve it — they ask for an updated one. */
export async function proposalExpiredOn(est: { sentAt: Date | null; updatedAt: Date; proposalOptions: string | null }) {
  const [company, clock] = await Promise.all([db.company.findFirst({ select: { proposalOptions: true } }), companyClock()]);
  const validDays = parseProposalOptions(est.proposalOptions ?? company?.proposalOptions).validDays;
  const pricedOn = fmtDate(est.sentAt ?? est.updatedAt, "yyyy-MM-dd");
  return proposalExpired(pricedOn, validDays, fmtDate(clock.now, "yyyy-MM-dd")) ? goodThroughDay(pricedOn, validDays) : null;
}

export async function clientApprovesProposal(client: { id: string; clientId: string }, id: string, signature: string) {
  const est = await sentEstimate(client.clientId, id);
  const expired = await proposalExpiredOn(est);
  if (expired) {
    const company = await db.company.findFirst({ select: { name: true } });
    throw new Error(`This proposal's pricing expired ${fmtDate(new Date(`${expired}T12:00:00`), "MMM d, yyyy")} — ask ${company?.name ?? "your builder"} for an updated one.`);
  }
  const now = new Date();
  await db.estimate.update({ where: { id: est.id }, data: { status: "APPROVED", approvedAt: now, decidedAt: now, signedBy: signature.slice(0, 120), decisionNote: null } });
  if (["LEAD", "ESTIMATING", "PROPOSAL_SENT"].includes(est.project.status)) await db.project.update({ where: { id: est.projectId }, data: { status: "CONTRACTED" } });
  // The Material list as priced the day it was signed (escalation can be measured from it). Never stops a signature.
  await takeBidSnapshot(est.projectId, est.id, "SIGNED").catch((e) => console.error("Signed snapshot failed", e));
  await logActivity({
    projectId: est.projectId,
    userId: client.id,
    type: "estimate.approved",
    description: `Client approved the proposal "${est.name}" v${est.version} (${money(est.basePrice ?? lineTotals(est.items).price)}; signed ${signature})`,
  });
  return est;
}

export async function clientDeclinesProposal(client: { id: string; clientId: string; name: string }, id: string, note: string | null) {
  const est = await sentEstimate(client.clientId, id);
  await db.estimate.update({ where: { id: est.id }, data: { status: "DECLINED", decidedAt: new Date(), signedBy: client.name, decisionNote: note?.slice(0, 2000) ?? null } });
  await logActivity({ projectId: est.projectId, userId: client.id, type: "estimate.declined", description: `Client declined the proposal "${est.name}" v${est.version}${note ? `: ${note}` : ""}` });
  return est;
}
