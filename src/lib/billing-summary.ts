import { changeOrderNumberFromDescription } from "./finance";

/**
 * "What you can bill" on a job's Invoices tab: the contract (its approved estimate) and each
 * approved change order, with what's been billed on each and what's left. Billed = on an invoice
 * that's gone out (sent, part paid or paid); a draft invoice only tags its row ("on draft #1013");
 * void invoices never count. A line tied to a change order (or, on older invoices, named for one)
 * bills that change order; every other line — draws, deposits, lines typed in — bills the contract.
 * Plain function (no database) — tested in billing-summary.test.ts.
 */

type Inv = { number: number; status: string; items: { description: string; changeOrderId: string | null; isTax: boolean; amount: number }[]; paid: number };
type Co = { id: string; number: number; title: string; total: number };

export type BillingRow = { key: string; label: string; amount: number; billed: number; left: number; drafts: number[] };

const cents = (n: number) => Math.round(n * 100) / 100;

export function billingSummary(contract: number, approved: Co[], invoices: Inv[]) {
  const byNumber = new Map(approved.map((c) => [c.number, c.id]));
  const billed = new Map<string, number>();
  const drafts = new Map<string, Set<number>>();
  let tax = 0;
  for (const inv of invoices) {
    if (inv.status === "VOID") continue;
    const out = inv.status !== "DRAFT";
    for (const i of inv.items) {
      if (i.isTax) {
        if (out) tax += i.amount;
        continue;
      }
      const n = changeOrderNumberFromDescription(i.description);
      const key = i.changeOrderId ?? (n !== null ? byNumber.get(n) : undefined) ?? "contract";
      if (out) billed.set(key, (billed.get(key) ?? 0) + i.amount);
      else if (i.amount) drafts.set(key, (drafts.get(key) ?? new Set()).add(inv.number));
    }
  }
  const row = (key: string, label: string, amount: number): BillingRow => {
    const b = cents(billed.get(key) ?? 0);
    return { key, label, amount: cents(amount), billed: b, left: cents(amount - b), drafts: [...(drafts.get(key) ?? [])].sort((a, b) => a - b) };
  };
  const contractRow = row("contract", "Contract (approved estimate)", contract);
  const coRows = approved.map((c) => row(c.id, `#${c.number} ${c.title}`, c.total));
  const rows = [contractRow, ...coRows];
  const paid = cents(invoices.filter((i) => i.status !== "VOID" && i.status !== "DRAFT").reduce((n, i) => n + i.paid, 0));
  const totalBilled = cents(rows.reduce((n, r) => n + r.billed, 0) + tax);
  return {
    contract: contractRow,
    changeOrders: coRows,
    tax: cents(tax),
    total: { amount: cents(rows.reduce((n, r) => n + r.amount, 0)), billed: totalBilled, left: cents(rows.reduce((n, r) => n + r.left, 0)) },
    paid,
    balance: cents(totalBilled - paid),
  };
}
