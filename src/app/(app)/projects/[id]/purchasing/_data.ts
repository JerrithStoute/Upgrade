import "server-only";
import { db } from "@/lib/db";
import { activeCostCodes } from "@/lib/projects";
import { costCodeLabel } from "@/lib/utils";
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
