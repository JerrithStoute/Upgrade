import { lineCost, linePrice } from "./utils";

/** A cost-based line (estimate item or change-order item). */
export type CostLine = {
  quantity: number;
  unitCost: number;
  markupPct: number;
  taxPct?: number | null;
  isOptional?: boolean;
};

/**
 * Cost / price / markup totals for a set of cost lines.
 * Optional items are excluded unless `includeOptional` is set.
 */
export function lineTotals(items: CostLine[], opts?: { includeOptional?: boolean }) {
  const included = opts?.includeOptional ? items : items.filter((i) => !i.isOptional);
  const cost = included.reduce((s, i) => s + lineCost(i), 0);
  const price = included.reduce((s, i) => s + linePrice(i), 0);
  return { cost, price, markup: price - cost };
}

/** Invoice line total = quantity * unit price (no markup concept on invoices). */
export function invoiceLineTotal(item: { quantity: number; unitPrice: number }) {
  return item.quantity * item.unitPrice;
}

export function invoiceTotal(items: { quantity: number; unitPrice: number }[]) {
  return items.reduce((s, i) => s + invoiceLineTotal(i), 0);
}

export function paymentsTotal(payments: { amount: number }[]) {
  return payments.reduce((s, p) => s + p.amount, 0);
}

export function invoiceBalance(inv: { items: { quantity: number; unitPrice: number }[]; payments: { amount: number }[] }) {
  return invoiceTotal(inv.items) - paymentsTotal(inv.payments);
}

/**
 * Status after a payment is recorded: paid >= total → PAID, 0 < paid < total → PARTIAL,
 * otherwise the current status is kept. VOID invoices never change.
 */
export function deriveInvoiceStatus(current: string, total: number, paid: number) {
  if (current === "VOID") return current;
  if (total > 0 && paid >= total - 0.005) return "PAID";
  if (paid > 0) return "PARTIAL";
  return current;
}

/** Stable group-by preserving first-seen order of keys. */
export function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return Array.from(map.entries());
}

export const CHANGE_ORDER_REASONS = ["Client request", "Unforeseen condition", "Design change", "Code requirement", "Other"] as const;

/** Invoice lines that bill a change order start with "Change Order #N". */
export function changeOrderNumberFromDescription(description: string): number | null {
  const m = /^Change Order #(\d+)\b/i.exec(description.trim());
  return m ? Number(m[1]) : null;
}

/** True when an invoice is unpaid past its due date. */
export function isOverdue(inv: { status: string; dueDate: Date | null }, now = new Date()) {
  if (!inv.dueDate) return false;
  if (inv.status !== "SENT" && inv.status !== "PARTIAL") return false;
  return inv.dueDate.getTime() < now.getTime();
}

/** Price (incl. markup) of a set of change-order lines — what the client is billed. */
export function linePriceOfChangeOrder(items: CostLine[]) {
  return lineTotals(items, { includeOptional: true }).price;
}
