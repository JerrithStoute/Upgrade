/**
 * QuickBooks Online's records, turned into what The Builder Station keeps — and the other way for
 * invoices. Plain functions (no database, no network) — tested in shape.test.ts.
 *
 * Lists come in as the same rows the Desktop connection reads (QbListRow), so vendors, jobs and cost
 * codes link up exactly the same way (src/lib/qb/match.ts).
 */
import { createHash } from "crypto";
import type { QbListRow } from "@/lib/qb/qbxml";

export type Ref = { value: string; name?: string };
type Obj = Record<string, unknown>;

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
const ref = (v: unknown): Ref | undefined => {
  const r = v as Ref | undefined;
  return r && typeof r === "object" && s(r.value) ? { value: s(r.value)!, name: s(r.name) } : undefined;
};
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const cents = (n: number) => Math.round(n * 100) / 100;
const clean = (d: Record<string, string | undefined>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v)) as Record<string, string>;
const at = (o: unknown, path: string) => path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Obj)[k] : undefined), o);

/** Item types as the Desktop connection names them, so the same ones count as cost lines. */
const ITEM_TYPES: Record<string, string> = {
  Service: "Service",
  NonInventory: "Non-inventory",
  Inventory: "Inventory",
  Group: "Group",
  Category: "Category",
};

/** A QuickBooks Online list entry as a list row. */
export function listRow(kind: QbListRow["kind"], e: Obj): QbListRow | null {
  const id = s(e.Id);
  const name = kind === "VENDOR" || kind === "CUSTOMER" ? s(e.DisplayName) : s(e.Name);
  if (!id || !name) return null;
  const parent = ref(e.ParentRef);
  const detail =
    kind === "VENDOR"
      ? {
          companyName: s(e.CompanyName),
          phone: s(at(e, "PrimaryPhone.FreeFormNumber")),
          email: s(at(e, "PrimaryEmailAddr.Address")),
          contact: [s(e.GivenName), s(e.FamilyName)].filter(Boolean).join(" ") || undefined,
        }
      : kind === "ITEM"
        ? { type: ITEM_TYPES[s(e.Type) ?? ""] ?? s(e.Type), description: s(e.Description) ?? s(e.PurchaseDesc) }
        : {};
  return {
    kind,
    listId: id,
    // A job is shown by its own name; "Customer:Job" is its full name.
    name: kind === "CUSTOMER" && parent ? name.split(":").pop()!.trim() || name : name,
    fullName: s(e.FullyQualifiedName) ?? name,
    parentListId: parent?.value ?? null,
    sublevel: num(e.Level),
    active: e.Active !== false,
    detail: clean(detail),
  };
}

// --- Bills -------------------------------------------------------------------------------------------

export type BillLine = { description: string; itemId: string | null; customerId: string | null; customerName: string | null; amount: number };
export type BillData = {
  vendorId: string | null;
  vendorName: string;
  number: string | null;
  date: string;
  due: string | null;
  note: string | null;
  total: number;
  balance: number;
  lines: BillLine[];
};

/** What's kept of a bill: who, when, how much is left to pay, and each line's job and item. */
export function billData(b: Obj): BillData {
  const lines: BillLine[] = [];
  for (const l of (b.Line as Obj[] | undefined) ?? []) {
    const type = s(l.DetailType);
    const d = (type && (l[type] as Obj | undefined)) || {};
    if (type !== "ItemBasedExpenseLineDetail" && type !== "AccountBasedExpenseLineDetail") continue;
    const item = ref(d.ItemRef);
    const account = ref(d.AccountRef);
    const customer = ref(d.CustomerRef);
    lines.push({
      description: (s(l.Description) || item?.name || account?.name || "Bill line").slice(0, 300),
      itemId: item?.value ?? null,
      customerId: customer?.value ?? null,
      customerName: customer?.name ?? null,
      amount: cents(num(l.Amount)),
    });
  }
  const vendor = ref(b.VendorRef);
  return {
    vendorId: vendor?.value ?? null,
    vendorName: vendor?.name || "QuickBooks vendor",
    number: s(b.DocNumber) || null,
    date: s(b.TxnDate) ?? "",
    due: s(b.DueDate) || null,
    note: s(b.PrivateNote) || null,
    total: cents(num(b.TotalAmt)),
    balance: cents(num(b.Balance)),
    lines,
  };
}

export type BillPart = { projectId: string; lines: { description: string; costCodeId: string | null; amount: number }[] };
export type BillWaiting = { customerId: string; customerName: string; amount: number };

/**
 * A bill split by job: one part per job its lines are on. Lines on a customer that isn't linked to a
 * job here wait for one; lines on no customer at all (the office's own costs) aren't a job's cost.
 */
export function billParts(b: BillData, jobOf: (customerId: string) => string | null, codeOf: (itemId: string) => string | null) {
  const parts = new Map<string, BillPart>();
  const waiting = new Map<string, BillWaiting>();
  for (const l of b.lines) {
    if (!l.customerId) continue;
    const projectId = jobOf(l.customerId);
    if (!projectId) {
      const w = waiting.get(l.customerId) ?? { customerId: l.customerId, customerName: l.customerName ?? "QuickBooks customer", amount: 0 };
      w.amount = cents(w.amount + l.amount);
      waiting.set(l.customerId, w);
      continue;
    }
    const part = parts.get(projectId) ?? { projectId, lines: [] };
    part.lines.push({ description: l.description, costCodeId: l.itemId ? codeOf(l.itemId) : null, amount: l.amount });
    parts.set(projectId, part);
  }
  return { parts: [...parts.values()], waiting: [...waiting.values()] };
}

/** Paid in full in QuickBooks. */
export const billPaid = (b: BillData) => b.total > 0 && b.balance <= 0.004;

// --- Payments ----------------------------------------------------------------------------------------

export type PaymentData = { date: string; reference: string | null; method: string | null; links: { invoiceId: string; amount: number }[] };

/** A customer payment: what it paid on each invoice. */
export function paymentData(p: Obj): PaymentData {
  const links: PaymentData["links"] = [];
  for (const l of (p.Line as Obj[] | undefined) ?? [])
    for (const t of (l.LinkedTxn as Obj[] | undefined) ?? []) if (s(t.TxnType) === "Invoice" && s(t.TxnId)) links.push({ invoiceId: s(t.TxnId)!, amount: cents(num(l.Amount)) });
  return { date: s(p.TxnDate) ?? "", reference: s(p.PaymentRefNum) || null, method: ref(p.PaymentMethodRef)?.name ?? null, links };
}

/** QuickBooks' payment method, as one of ours. */
export function paymentMethod(name: string | null) {
  const n = (name ?? "").toLowerCase();
  if (/check|cheque/.test(n)) return "CHECK";
  if (/ach|bank|transfer|wire|e-?check/.test(n)) return "ACH";
  if (/card|visa|master|amex|american express|discover/.test(n)) return "CARD";
  if (/cash/.test(n)) return "CASH";
  return "OTHER";
}

/** A short fingerprint: when it changes, what was put in from QuickBooks is put in again. */
export const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("base64url").slice(0, 22);

// --- Invoices out ------------------------------------------------------------------------------------

export type InvoiceOut = {
  number: number;
  title: string;
  issueDate: Date;
  dueDate: Date | null;
  notes: string | null;
  items: { description: string; quantity: number; unitPrice: number; isTax: boolean }[];
};

/** A date as QuickBooks wants it (the day as it reads here). */
export const qbDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The invoice as QuickBooks Online takes it: on the job's customer, each line on the one item you
 * picked for invoice lines. Tax isn't sent — QuickBooks works out its own (see `taxProblem`).
 */
export function invoiceBody(inv: InvoiceOut, customerId: string, itemId: string) {
  return {
    CustomerRef: { value: customerId },
    DocNumber: String(inv.number),
    TxnDate: qbDate(inv.issueDate),
    ...(inv.dueDate ? { DueDate: qbDate(inv.dueDate) } : {}),
    ...(inv.notes ? { CustomerMemo: { value: inv.notes.slice(0, 1000) } } : {}),
    PrivateNote: `${inv.title} — from The Builder Station`.slice(0, 4000),
    Line: inv.items
      .filter((i) => !i.isTax)
      .map((i) => ({
        DetailType: "SalesItemLineDetail",
        Amount: cents(i.quantity * i.unitPrice),
        Description: i.description.slice(0, 4000),
        SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: i.quantity, UnitPrice: i.unitPrice },
      })),
  };
}

/** Why an invoice can't go to QuickBooks as it is (null: it can). */
export function taxProblem(inv: InvoiceOut) {
  const tax = inv.items.filter((i) => i.isTax).reduce((n, i) => n + i.quantity * i.unitPrice, 0);
  return Math.abs(tax) > 0.004
    ? "This invoice has sales tax on it, and QuickBooks Online works out its own sales tax, so it wasn't sent there. Enter it in QuickBooks with its tax. (Next time, leave the tax off here and add it in QuickBooks.)"
    : null;
}
