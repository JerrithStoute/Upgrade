import "server-only";
import { db } from "./db";
import { changeOrderTotals, parseCoDefaults } from "./change-orders";
import { parseMarkupTable, tableTaxLabel, tableTaxRate } from "./markup";
import { invoiceTotal } from "./finance";
import { nextChangeOrderNumber, nextInvoiceNumber } from "./projects";
import { noteChange } from "./selection-activity";
import { logActivity } from "./activity";

/**
 * Money flowing on by itself, when you've left it on (Settings → Billing):
 *  - a client's choice over (or under) its allowance goes on the job's draft "Selections"
 *    change order;
 *  - an approved change order goes on the job's next draft invoice — once.
 */

type Who = { id: string | null; name: string };

async function settings() {
  return (await db.company.findFirst({ select: { autoSelectionCO: true, autoInvoiceCO: true } })) ?? { autoSelectionCO: true, autoInvoiceCO: true };
}

/** A new draft change order with your defaults (intro, closing, terms, profit) and the estimate's sales tax. */
export async function newChangeOrder(
  projectId: string,
  data: { title: string; description?: string | null; reason?: string | null; scheduleImpactDays?: number; autoSelections?: boolean },
) {
  const [company, est] = await Promise.all([
    db.company.findFirst({ select: { changeOrderDefaults: true } }),
    db.estimate.findFirst({
      where: { projectId },
      orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { version: "desc" }],
      select: { markupTable: true, defaultMarkup: true },
    }),
  ]);
  const d = parseCoDefaults(company?.changeOrderDefaults);
  const rows = est ? parseMarkupTable(est.markupTable, est.defaultMarkup) : [];
  return db.changeOrder.create({
    data: {
      projectId,
      number: await nextChangeOrderNumber(projectId),
      title: data.title,
      description: data.description ?? null,
      reason: data.reason ?? null,
      scheduleImpactDays: data.scheduleImpactDays ?? 0,
      autoSelections: data.autoSelections ?? false,
      introText: d.introText ?? null,
      closingText: d.closingText ?? null,
      terms: d.terms ?? null,
      ifDeclined: d.ifDeclined === "CLEAR" ? "CLEAR" : "KEEP",
      profitMode: d.profitMode && ["NONE", "PCT", "AMOUNT"].includes(d.profitMode) ? d.profitMode : "NONE",
      profitValue: typeof d.profitValue === "number" ? d.profitValue : 0,
      profitShown: d.profitShown === "FOLDED" ? "FOLDED" : "LINE",
      // Tax starts at the estimate's — the sales tax you pay.
      taxPct: tableTaxRate(rows),
      taxLabel: tableTaxLabel(rows),
    },
  });
}

/**
 * After a selection's choice (or its price or allowance) changed: keeps its line on a draft
 * change order in step. Not on one yet → added to the job's draft "Selections" change
 * order (started if needed) when it's over or under the allowance. On a draft → updated, or
 * taken off when the choice is cleared. On a change order already sent or approved → left
 * alone. A line you took off yourself isn't put back until the choice changes again.
 */
export async function syncSelectionChangeOrder(selectionId: string, who: Who) {
  if (!(await settings()).autoSelectionCO) return;
  const sel = await db.selection.findUnique({
    where: { id: selectionId },
    include: { options: true, estimateSpecs: { select: { items: { select: { costCodeId: true }, take: 1 } }, take: 1 } },
  });
  if (!sel) return;
  const line = await db.changeOrderItem.findFirst({
    where: { selectionId: sel.id, changeOrder: { status: { notIn: ["DECLINED", "VOID"] } } },
    include: { changeOrder: { select: { id: true, status: true, number: true, autoSelections: true } } },
  });
  const chosen = sel.status === "CHOSEN" || sel.status === "DECLINED";
  const opt = sel.options.find((o) => o.id === sel.chosenOptionId);
  const clientPrice = sel.status === "DECLINED" ? 0 : (opt?.price ?? 0);
  const difference = Math.round((clientPrice - sel.allowance) * 100) / 100;
  const choiceName = sel.status === "DECLINED" ? "I do not want this selection" : (opt?.name ?? "");

  if (line) {
    if (line.changeOrder.status !== "DRAFT") return;
    if (!chosen || difference === 0) {
      await db.changeOrderItem.delete({ where: { id: line.id } });
      await noteChange(sel.id, who, `Taken off change order #${line.changeOrder.number}`);
      // The app's own Selections change order, now empty: it goes too.
      if (line.changeOrder.autoSelections && (await db.changeOrderItem.count({ where: { changeOrderId: line.changeOrder.id } })) === 0)
        await db.changeOrder.delete({ where: { id: line.changeOrder.id } });
      return;
    }
    await db.changeOrderItem.update({
      where: { id: line.id },
      data: { choiceName, clientPrice, allowance: sel.allowance, unitCost: difference, description: sel.title, category: sel.category },
    });
    return;
  }
  if (!chosen || difference === 0) return;

  const open = await db.changeOrder.findFirst({ where: { projectId: sel.projectId, status: "DRAFT", autoSelections: true }, orderBy: { number: "desc" }, include: { items: true } });
  const co = open ?? { ...(await newChangeOrder(sel.projectId, { title: "Selections", reason: "Client selections", autoSelections: true })), items: [] as { sortOrder: number }[] };
  await db.changeOrderItem.create({
    data: {
      changeOrderId: co.id,
      kind: "SELECTION",
      selectionId: sel.id,
      category: sel.category,
      description: sel.title,
      choiceName,
      clientPrice,
      allowance: sel.allowance,
      quantity: 1,
      unit: "ls",
      unitCost: difference,
      markupPct: 0,
      costCodeId: sel.costCodeId ?? sel.estimateSpecs[0]?.items[0]?.costCodeId ?? null,
      // Taxed like any item when the change order has tax.
      taxed: co.taxPct > 0,
      sortOrder: co.items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1,
    },
  });
  await noteChange(sel.id, who, `Added to change order #${co.number} (${difference > 0 ? "overage" : "credit"})`);
  await logActivity({
    projectId: sel.projectId,
    userId: who.id,
    type: "change_order.updated",
    description: `"${sel.title}" ${difference > 0 ? "overage" : "credit"} added to change order #${co.number}`,
  });
}

/**
 * The invoice's tax line: rate × the other lines, kept last. Off (taxPct null) removes it.
 * Runs after anything changes the lines.
 */
export async function syncInvoiceTax(invoiceId: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
  if (!inv) return;
  const taxLines = inv.items.filter((i) => i.isTax);
  const others = inv.items.filter((i) => !i.isTax);
  if (inv.taxPct === null) {
    if (taxLines.length) await db.invoiceItem.deleteMany({ where: { invoiceId, isTax: true } });
    return;
  }
  const amount = Math.round(((invoiceTotal(others) * inv.taxPct) / 100) * 100) / 100;
  const data = {
    description: `${inv.taxLabel || "Sales tax"} (${Math.round(inv.taxPct * 1000) / 1000}%)`,
    quantity: 1,
    unitPrice: amount,
    sortOrder: others.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1,
  };
  const [first, ...extra] = taxLines;
  if (first) await db.invoiceItem.update({ where: { id: first.id }, data });
  else await db.invoiceItem.create({ data: { invoiceId, isTax: true, ...data } });
  if (extra.length) await db.invoiceItem.deleteMany({ where: { id: { in: extra.map((i) => i.id) } } });
}

/** Change orders already on an invoice (not a voided one) — never billed twice. */
export async function billedChangeOrderIds(projectId: string) {
  const items = await db.invoiceItem.findMany({ where: { changeOrderId: { not: null }, invoice: { projectId, status: { not: "VOID" } } }, select: { changeOrderId: true } });
  return new Set(items.map((i) => i.changeOrderId!));
}

/** An approved change order onto the job's next draft invoice (started if needed) — once. */
export async function billApprovedChangeOrder(coId: string, who: Who) {
  if (!(await settings()).autoInvoiceCO) return null;
  const co = await db.changeOrder.findUnique({ where: { id: coId }, include: { items: true } });
  if (!co || co.status !== "APPROVED" || (await billedChangeOrderIds(co.projectId)).has(co.id)) return null;
  const inv =
    (await db.invoice.findFirst({ where: { projectId: co.projectId, status: "DRAFT" }, orderBy: { number: "desc" }, include: { items: true } })) ??
    (await db.invoice.create({ data: { projectId: co.projectId, number: await nextInvoiceNumber(), title: "Invoice" }, include: { items: true } }));
  await db.invoiceItem.create({
    data: {
      invoiceId: inv.id,
      changeOrderId: co.id,
      description: `Change Order #${co.number} — ${co.title}`,
      quantity: 1,
      unitPrice: changeOrderTotals(co, co.items).total,
      sortOrder: inv.items.filter((i) => !i.isTax).reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1,
    },
  });
  await syncInvoiceTax(inv.id);
  await logActivity({ projectId: co.projectId, userId: who.id, type: "invoice.updated", description: `Change order #${co.number} added to invoice #${inv.number}` });
  return inv;
}
