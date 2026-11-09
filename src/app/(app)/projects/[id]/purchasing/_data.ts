import "server-only";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { costCodeLabel, lineCost } from "@/lib/utils";
import { awardCode } from "@/lib/sub-bids";
import { billTotal, poTotal } from "@/lib/purchasing";
import type { PoChoice } from "./_components/bill-form";

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What a bill can be matched to: the job's POs that take bills, each with what's left and
 * the lines a new bill fills in with — the PO's lines if nothing's billed yet, else what's
 * left of each cost code.
 */
export async function billChoices(projectId: string, vendorId?: string) {
  const [pos, codes, vendors] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { projectId, status: { in: ["SENT", "ACCEPTED"] }, ...(vendorId ? { vendorId } : {}) },
      orderBy: { number: "asc" },
      include: { lines: { orderBy: { sortOrder: "asc" } }, bills: { where: { status: { not: "REJECTED" } }, include: { lines: true } } },
    }),
    activeCostCodes(),
    vendorId ? Promise.resolve([]) : db.vendor.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const choices: PoChoice[] = pos.map((po) => {
    const total = poTotal(po.lines);
    const billed = po.bills.reduce((n, b) => n + billTotal(b.lines), 0);
    let lines: PoChoice["lines"];
    if (!po.bills.length) lines = po.lines.map((l) => ({ description: l.description, costCodeId: l.costCodeId, amount: cents(l.quantity * l.unitCost) }));
    else {
      const left = new Map<string, number>();
      for (const l of po.lines) left.set(l.costCodeId ?? "", (left.get(l.costCodeId ?? "") ?? 0) + l.quantity * l.unitCost);
      for (const b of po.bills) for (const l of b.lines) left.set(l.costCodeId ?? "", (left.get(l.costCodeId ?? "") ?? 0) - l.amount);
      lines = [...left.entries()].filter(([, n]) => n > 0.004).map(([code, n]) => ({ description: `Balance of PO-${po.number}`, costCodeId: code || null, amount: cents(n) }));
    }
    return { id: po.id, label: `PO-${po.number} · ${po.vendorName} · ${po.title}`, vendor: po.vendorName, left: cents(total - billed), lines };
  });
  return { choices, codes: codes.map((c) => ({ id: c.id, label: costCodeLabel(c) })), vendors: vendors.map((v) => v.name) };
}

/**
 * What a new PO can start from: the budget's cost codes (the job's latest estimate, at cost)
 * and the bids you took. Used on Purchasing and on the Budget.
 */
export async function newPoChoices(projectId: string) {
  const [estimate, awards, vendors, codes] = await Promise.all([
    db.estimate.findFirst({
      where: { projectId },
      orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { version: "desc" }],
      include: { items: { where: { isOptional: false } } },
    }),
    db.bidAward.findMany({ where: { projectId }, include: { bid: { include: { lines: true } } } }),
    db.vendor.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    activeCostCodes(),
  ]);
  const codeName = (k: string) => {
    const c = codes.find((x) => x.id === k);
    return c ? costCodeLabel(c) : "No cost code";
  };
  const byCode = new Map<string, { cost: number; lines: number }>();
  for (const i of estimate?.items ?? []) {
    const k = i.costCodeId ?? "none";
    const row = byCode.get(k) ?? { cost: 0, lines: 0 };
    row.cost += lineCost(i);
    row.lines += 1;
    byCode.set(k, row);
  }
  const budget = [...byCode.entries()]
    .map(([codeKey, r]) => ({ codeKey, label: codeName(codeKey), ...r }))
    .sort((a, b) => (codes.findIndex((c) => c.id === a.codeKey) + 1 || 1e9) - (codes.findIndex((c) => c.id === b.codeKey) + 1 || 1e9));
  const awardOptions = awards.map((a) => {
    // (A sub's bid is filed as "sub:<code>" — its line is the plain code.)
    const code = awardCode(a.codeKey);
    const lines = a.bid.lines.filter((l) => l.codeKey === code && l.unitPrice != null);
    return {
      value: `${a.bidId}|${code}`,
      label: `${a.bid.vendorName} · ${lines[0]?.codeLabel ?? codeName(code)} (Bid #${a.bid.number})`,
      total: lines.reduce((n, l) => n + l.quantity * (l.unitPrice ?? 0), 0),
    };
  });
  return { budget, awards: awardOptions, vendors: vendors.map((v) => v.name) };
}
