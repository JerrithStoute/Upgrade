import "server-only";
import { db } from "./db";
import { logActivity } from "./activity";
import { lineTotals } from "./finance";
import { money } from "./utils";

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

export async function clientApprovesProposal(client: { id: string; clientId: string }, id: string, signature: string) {
  const est = await sentEstimate(client.clientId, id);
  const now = new Date();
  await db.estimate.update({ where: { id: est.id }, data: { status: "APPROVED", approvedAt: now, decidedAt: now, signedBy: signature.slice(0, 120), decisionNote: null } });
  if (["LEAD", "ESTIMATING", "PROPOSAL_SENT"].includes(est.project.status)) await db.project.update({ where: { id: est.projectId }, data: { status: "CONTRACTED" } });
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
