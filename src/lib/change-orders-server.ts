import "server-only";
import { db } from "./db";
import { changeOrderTotals, isFullyApproved } from "./change-orders";
import { noteChange } from "./selection-activity";

/** A change order's total (lines + profit + tax). */
export function coTotal(co: { profitMode: string; profitValue: number; profitShown: string; taxPct: number; items: { quantity: number; unitCost: number; markupPct: number }[] }) {
  return changeOrderTotals(co, co.items).total;
}

/**
 * Client choices (and "I do not want this selection") not on a change order yet —
 * the blue "There are client choices … not added to change orders yet" bar. A
 * choice on a declined or voided change order counts as not added.
 */
export async function unaddedChoices(projectId: string) {
  const sels = await db.selection.findMany({
    where: {
      projectId,
      status: { in: ["CHOSEN", "DECLINED"] },
      changeOrderItems: { none: { changeOrder: { status: { notIn: ["DECLINED", "VOID"] } } } },
    },
    include: { options: true, estimateSpecs: { select: { items: { select: { costCodeId: true }, take: 1 } }, take: 1 } },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return sels.map((s) => {
    const opt = s.options.find((o) => o.id === s.chosenOptionId);
    const clientPrice = s.status === "DECLINED" ? 0 : (opt?.price ?? 0);
    return {
      selectionId: s.id,
      category: s.category,
      title: s.title,
      choiceName: s.status === "DECLINED" ? "I do not want this selection" : (opt?.name ?? ""),
      clientPrice,
      allowance: s.allowance,
      difference: Math.round((clientPrice - s.allowance) * 100) / 100,
      costCodeId: s.costCodeId ?? s.estimateSpecs[0]?.items[0]?.costCodeId ?? null,
    };
  });
}
export type UnaddedChoice = Awaited<ReturnType<typeof unaddedChoices>>[number];

/**
 * Approved once the client (if they must) and every listed team member have
 * approved. Its client choices become final then (the client can't change them).
 */
export async function finalizeIfApproved(coId: string, who: { id: string | null; name: string }) {
  const co = await db.changeOrder.findUnique({ where: { id: coId }, include: { items: { select: { selectionId: true } } } });
  if (!co || co.status !== "PENDING_APPROVAL" || !isFullyApproved(co)) return false;
  await db.changeOrder.update({ where: { id: co.id }, data: { status: "APPROVED", decidedAt: new Date() } });
  for (const id of new Set(co.items.map((i) => i.selectionId).filter((x): x is string => !!x))) {
    await db.selection.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
    await noteChange(id, who, `Approved on change order #${co.number}`);
  }
  return true;
}

/** Declined: its choices come off it; "CLEAR" also clears what the client chose. */
export async function applyDecline(coId: string, who: { id: string | null; name: string }) {
  const co = await db.changeOrder.findUnique({ where: { id: coId }, include: { items: { select: { selectionId: true } } } });
  if (!co) return;
  for (const id of new Set(co.items.map((i) => i.selectionId).filter((x): x is string => !!x))) {
    if (co.ifDeclined === "CLEAR") {
      await db.selection.update({ where: { id }, data: { status: "PENDING", chosenOptionId: null, chosenAt: null, approvedAt: null } });
      await noteChange(id, who, `Change order #${co.number} declined — choice cleared`);
    } else await noteChange(id, who, `Change order #${co.number} declined — choice kept`);
  }
}
