import "server-only";
import { db } from "./db";
import { getBrand } from "./company-brand";
import { approvedEstimateTotal } from "./projects";
import { changeOrderTotals, effectOnContract, parseApprovals, parseIds } from "./change-orders";

/** Everything the printed change order shows: your letterhead, the client and job, lines, totals, effect on contract, signatures. */
export async function loadChangeOrderDoc(projectId: string, coId: string) {
  const [co, company, brand, others, base, contract, files] = await Promise.all([
    db.changeOrder.findFirst({
      where: { id: coId, projectId },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, project: { include: { client: true } } },
    }),
    db.company.findFirst(),
    getBrand(),
    db.changeOrder.findMany({ where: { projectId, status: "APPROVED", id: { not: coId } }, include: { items: true } }),
    approvedEstimateTotal(projectId),
    // The contract date: when the estimate was approved.
    db.estimate.findFirst({ where: { projectId, status: "APPROVED" }, orderBy: { approvedAt: "desc" }, select: { approvedAt: true } }),
    db.fileAsset.findMany({ where: { changeOrderId: coId, clientVisible: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!co) return null;
  const approverIds = parseIds(co.approverIds);
  const approvers = approverIds.length ? await db.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } }) : [];
  const approvals = parseApprovals(co.teamApprovals);
  const totals = changeOrderTotals(co, co.items);
  const previous = others.reduce((n, o) => n + changeOrderTotals(o, o.items).total, 0);
  const project = co.project;
  const client = project.client;
  const cityLine = (c: { city: string | null; state: string | null; zip: string | null } | null | undefined) =>
    c ? [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";
  return {
    co,
    lines: co.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      category: i.category,
      description: i.description,
      choiceName: i.choiceName,
      clientPrice: i.clientPrice ?? i.quantity * i.unitCost * (1 + i.markupPct / 100),
      allowance: i.allowance,
      amount: totals.shown(i),
    })),
    totals,
    effect: effectOnContract(base || project.contractAmount, previous, totals.total),
    company: {
      name: company?.name ?? "Your Company",
      lines: [company?.address, cityLine(company), company?.phone, company?.email, company?.licenseNumber ? `License ${company.licenseNumber}` : null].filter(
        (x): x is string => !!x,
      ),
      logoUrl: brand.logoUrl,
    },
    client: client ? `${client.firstName} ${client.lastName}`.trim() : null,
    project: { name: project.name, number: project.number, lines: [project.address, cityLine(project)].filter((x): x is string => !!x) },
    contractDate: contract?.approvedAt ?? null,
    files,
    // Your team first, then the client.
    signers: [
      ...approvers.map((a) => ({ role: "Builder", name: a.name, approvedAt: approvals[a.id] ? new Date(approvals[a.id]) : null, as: null as string | null })),
      ...(co.clientApproval
        ? [{ role: "Client", name: client ? `${client.firstName} ${client.lastName}`.trim() : "Client", approvedAt: co.clientApprovedAt, as: co.decidedBy }]
        : []),
    ],
  };
}
export type ChangeOrderDoc = NonNullable<Awaited<ReturnType<typeof loadChangeOrderDoc>>>;
