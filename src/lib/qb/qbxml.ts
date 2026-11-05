import { child, children, escapeXml, parseXml, text, type XmlNode } from "./xml";
import { qbDate, type BillData, type BillLine, type InvoiceOut, type PaymentData } from "@/lib/qbo/shape";

/**
 * qbXML: what we ask QuickBooks for, and what its answers say. Plain functions — no database —
 * so they're tested on their own (qbxml.test.ts) with replies shaped like QuickBooks' own.
 *
 * Version 13.0 is understood by QuickBooks Desktop 2014 and later (Enterprise 24 included).
 */

export const QBXML_VERSION = "13.0";
const PAGE = 200; // list entries per request (QuickBooks hands big lists over in pages)

/** What a sync reads, in order. */
export const LIST_STEPS = ["company", "vendors", "customers", "items", "classes"] as const;
export type ListStep = (typeof LIST_STEPS)[number];

const QUERY: Record<ListStep, string> = {
  company: "CompanyQueryRq",
  vendors: "VendorQueryRq",
  customers: "CustomerQueryRq",
  items: "ItemQueryRq",
  classes: "ClassQueryRq",
};

/** Anything past plain ASCII (— é ½) as a character reference: QuickBooks can't parse it as it is. */
const ascii = (s: string) => s.replace(/[^\x00-\x7e]/gu, (c) => `&#${c.codePointAt(0)};`);

const wrap = (body: string) => `<?xml version="1.0" encoding="utf-8"?><?qbxml version="${QBXML_VERSION}"?><QBXML><QBXMLMsgsRq onError="stopOnError">${ascii(body)}</QBXMLMsgsRq></QBXML>`;

/** The request for one step: a list's first page, or (with an iterator id) its next page. */
export function listRequest(step: ListStep, iteratorId?: string | null): string {
  const rq = QUERY[step];
  if (step === "company") return wrap(`<${rq} requestID="1"/>`);
  // Classes come all at once (QuickBooks doesn't page them — it's always a short list).
  if (step === "classes") return wrap(`<${rq} requestID="1"><ActiveStatus>All</ActiveStatus></${rq}>`);
  if (iteratorId) return wrap(`<${rq} requestID="1" iterator="Continue" iteratorID="${escapeXml(iteratorId)}"><MaxReturned>${PAGE}</MaxReturned></${rq}>`);
  return wrap(`<${rq} requestID="1" iterator="Start"><MaxReturned>${PAGE}</MaxReturned><ActiveStatus>All</ActiveStatus></${rq}>`);
}

export type QbListRow = { kind: "VENDOR" | "CUSTOMER" | "ITEM" | "CLASS"; listId: string; name: string; fullName: string; parentListId: string | null; sublevel: number; active: boolean; detail: Record<string, string> };

export type ListReply = {
  ok: boolean;
  /** QuickBooks' own words when it refused. */
  error?: string;
  rows: QbListRow[];
  companyName?: string;
  /** More pages to come: ask again with this iterator id. */
  iteratorId?: string;
  remaining: number;
};

const ITEM_TYPES: Record<string, string> = {
  ItemServiceRet: "Service",
  ItemNonInventoryRet: "Non-inventory",
  ItemOtherChargeRet: "Other charge",
  ItemInventoryRet: "Inventory",
  ItemInventoryAssemblyRet: "Assembly",
  ItemGroupRet: "Group",
  ItemSubtotalRet: "Subtotal",
  ItemDiscountRet: "Discount",
  ItemPaymentRet: "Payment",
  ItemSalesTaxRet: "Sales tax",
  ItemSalesTaxGroupRet: "Sales tax group",
  ItemFixedAssetRet: "Fixed asset",
};

const bool = (s: string | undefined) => s !== "false";
const clean = (d: Record<string, string | undefined>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v)) as Record<string, string>;

function row(kind: QbListRow["kind"], r: XmlNode, detail: Record<string, string | undefined> = {}): QbListRow | null {
  const listId = text(r, "ListID");
  const name = text(r, "Name");
  if (!listId || !name) return null;
  return {
    kind,
    listId,
    name,
    fullName: text(r, "FullName") || name,
    parentListId: text(r, "ParentRef/ListID") || null,
    sublevel: Number(text(r, "Sublevel") ?? 0) || 0,
    active: bool(text(r, "IsActive")),
    detail: clean(detail),
  };
}

/** Reads QuickBooks' reply to a list request. */
export function readListReply(step: ListStep, xml: string): ListReply {
  const rs = child(child(parseXml(xml), "QBXMLMsgsRs"), QUERY[step].replace(/Rq$/, "Rs"));
  if (!rs) return { ok: false, error: "QuickBooks' answer was missing", rows: [], remaining: 0 };
  const code = Number(rs.attrs.statusCode ?? 0);
  // 1: "nothing matched" — an empty list, not a problem.
  if (code !== 0 && code !== 1 && rs.attrs.statusSeverity === "Error") return { ok: false, error: rs.attrs.statusMessage || `QuickBooks error ${code}`, rows: [], remaining: 0 };
  const remaining = Number(rs.attrs.iteratorRemainingCount ?? 0) || 0;
  const more = remaining > 0 && rs.attrs.iteratorID ? { iteratorId: rs.attrs.iteratorID } : {};
  const rows: QbListRow[] = [];
  if (step === "company") return { ok: true, rows, companyName: text(rs, "CompanyRet/CompanyName"), remaining: 0 };
  for (const r of rs.children) {
    let out: QbListRow | null = null;
    if (step === "vendors" && r.name === "VendorRet")
      out = row("VENDOR", r, { companyName: text(r, "CompanyName"), phone: text(r, "Phone"), email: text(r, "Email"), contact: [text(r, "FirstName"), text(r, "LastName")].filter(Boolean).join(" ") });
    else if (step === "customers" && r.name === "CustomerRet") out = row("CUSTOMER", r, { jobStatus: text(r, "JobStatus") });
    else if (step === "classes" && r.name === "ClassRet") out = row("CLASS", r);
    else if (step === "items" && ITEM_TYPES[r.name]) {
      const sp = child(r, "SalesOrPurchase") ?? child(r, "SalesAndPurchase");
      out = row("ITEM", r, {
        type: ITEM_TYPES[r.name],
        description: text(sp, "Desc") ?? text(sp, "PurchaseDesc") ?? text(r, "ItemDesc") ?? text(r, "SalesDesc"),
        account: text(sp, "AccountRef/FullName") ?? text(sp, "ExpenseAccountRef/FullName") ?? text(r, "COGSAccountRef/FullName"),
      });
    }
    if (out) rows.push(out);
  }
  return { ok: true, rows, remaining, ...more };
}

// --- Bills (QuickBooks → here) ----------------------------------------------------------------

const BILL_PAGE = 100; // bills come with their lines, so fewer to a page

/**
 * Where a bill read starts: `changedSince` (a later update — bills added or changed from that day on)
 * or `datedFrom` (the first update — bills dated from that day on). Days as "2026-11-05".
 */
export type BillsFrom = { changedSince: string } | { datedFrom: string };

const fromFilter = (from: BillsFrom) =>
  "changedSince" in from
    ? `<ModifiedDateRangeFilter><FromModifiedDate>${escapeXml(from.changedSince)}T00:00:00</FromModifiedDate></ModifiedDateRangeFilter>`
    : `<TxnDateRangeFilter><FromTxnDate>${escapeXml(from.datedFrom)}</FromTxnDate></TxnDateRangeFilter>`;

/** Bills with their lines, a page at a time. (Going on, the whole query is asked again with the iterator.) */
export function billRequest(from: BillsFrom, iteratorId?: string | null): string {
  const it = iteratorId ? `iterator="Continue" iteratorID="${escapeXml(iteratorId)}"` : `iterator="Start"`;
  return wrap(`<BillQueryRq requestID="1" ${it}><MaxReturned>${BILL_PAGE}</MaxReturned>${fromFilter(from)}<IncludeLineItems>true</IncludeLineItems></BillQueryRq>`);
}

/** Bills and customer payments deleted in QuickBooks since that day. */
export function deletedRequest(since: string): string {
  return wrap(
    `<TxnDeletedQueryRq requestID="1"><TxnDelType>Bill</TxnDelType><TxnDelType>ReceivePayment</TxnDelType><DeletedDateRangeFilter><FromDeletedDate>${escapeXml(since)}T00:00:00</FromDeletedDate></DeletedDateRangeFilter></TxnDeletedQueryRq>`,
  );
}

/** Customer payments with what they paid on each invoice, a page at a time (the same window as bills). */
export function paymentRequest(from: BillsFrom, iteratorId?: string | null): string {
  const it = iteratorId ? `iterator="Continue" iteratorID="${escapeXml(iteratorId)}"` : `iterator="Start"`;
  return wrap(`<ReceivePaymentQueryRq requestID="1" ${it}><MaxReturned>${BILL_PAGE}</MaxReturned>${fromFilter(from)}<IncludeLineItems>true</IncludeLineItems></ReceivePaymentQueryRq>`);
}

const money = (s: string | undefined) => Math.round((Number(s) || 0) * 100) / 100;

/** One QuickBooks Desktop bill, kept the same way as a QuickBooks Online one (qbo/shape.ts). */
export function billFromXml(r: XmlNode): { txnId: string; data: BillData } | null {
  const txnId = text(r, "TxnID");
  if (!txnId) return null;
  const lines: BillLine[] = [];
  const line = (l: XmlNode, desc: string | undefined, fallback: string | undefined, itemId: string | null) =>
    lines.push({
      description: (desc || fallback || "Bill line").slice(0, 300),
      itemId,
      customerId: text(l, "CustomerRef/ListID") || null,
      customerName: text(l, "CustomerRef/FullName") || null,
      amount: money(text(l, "Amount")),
      classId: text(l, "ClassRef/ListID") || null,
    });
  for (const l of r.children) {
    if (l.name === "ExpenseLineRet") line(l, text(l, "Memo"), text(l, "AccountRef/FullName"), null);
    else if (l.name === "ItemLineRet") line(l, text(l, "Desc"), text(l, "ItemRef/FullName"), text(l, "ItemRef/ListID") || null);
    // A group of items: its lines, each on its own job and item.
    else if (l.name === "ItemGroupLineRet") for (const g of children(l, "ItemLineRet")) line(g, text(g, "Desc"), text(g, "ItemRef/FullName"), text(g, "ItemRef/ListID") || null);
  }
  // AmountDue is the bill's total; OpenAmount what's left to pay on it.
  const total = money(text(r, "AmountDue"));
  const open = text(r, "OpenAmount");
  return {
    txnId,
    data: {
      vendorId: text(r, "VendorRef/ListID") || null,
      vendorName: text(r, "VendorRef/FullName") || "QuickBooks vendor",
      number: text(r, "RefNumber") || null,
      date: text(r, "TxnDate") ?? "",
      due: text(r, "DueDate") || null,
      note: text(r, "Memo") || null,
      total,
      balance: text(r, "IsPaid") === "true" ? 0 : open !== undefined ? money(open) : total,
      lines,
    },
  };
}

export type BillReply = { ok: boolean; error?: string; bills: { txnId: string; data: BillData }[]; iteratorId?: string; remaining: number };

/** Reads QuickBooks' reply to a bill request. */
export function readBillReply(xml: string): BillReply {
  const rs = child(child(parseXml(xml), "QBXMLMsgsRs"), "BillQueryRs");
  if (!rs) return { ok: false, error: "QuickBooks' answer was missing", bills: [], remaining: 0 };
  const code = Number(rs.attrs.statusCode ?? 0);
  if (code !== 0 && code !== 1 && rs.attrs.statusSeverity === "Error") return { ok: false, error: rs.attrs.statusMessage || `QuickBooks error ${code}`, bills: [], remaining: 0 };
  const remaining = Number(rs.attrs.iteratorRemainingCount ?? 0) || 0;
  const bills = children(rs, "BillRet").flatMap((b) => billFromXml(b) ?? []);
  return { ok: true, bills, remaining, ...(remaining > 0 && rs.attrs.iteratorID ? { iteratorId: rs.attrs.iteratorID } : {}) };
}

/** The reply's one answer (…Rs) and whether QuickBooks refused (1, "nothing matched", isn't a refusal). */
function answerOf(xml: string, rsName: string) {
  const rs = child(child(parseXml(xml), "QBXMLMsgsRs"), rsName);
  if (!rs) return { rs, error: "QuickBooks' answer was missing" };
  const code = Number(rs.attrs.statusCode ?? 0);
  return { rs, error: code !== 0 && code !== 1 && rs.attrs.statusSeverity === "Error" ? rs.attrs.statusMessage || `QuickBooks error ${code}` : undefined };
}

/** Reads QuickBooks' reply to "what was deleted": bills and payments, by id. */
export function readDeletedReply(xml: string): { ok: boolean; error?: string; deleted: { kind: "BILL" | "PAYMENT"; txnId: string }[] } {
  const { rs, error } = answerOf(xml, "TxnDeletedQueryRs");
  if (error) return { ok: false, error, deleted: [] };
  return {
    ok: true,
    deleted: children(rs, "TxnDeletedRet").flatMap((d) => {
      const txnId = text(d, "TxnID");
      const type = text(d, "TxnDelType");
      return txnId && (type === "Bill" || type === "ReceivePayment") ? [{ kind: type === "Bill" ? ("BILL" as const) : ("PAYMENT" as const), txnId }] : [];
    }),
  };
}

/** One customer payment: what it paid on each invoice (kept like a QuickBooks Online one). */
export function paymentFromXml(r: XmlNode): { txnId: string; data: PaymentData } | null {
  const txnId = text(r, "TxnID");
  if (!txnId) return null;
  return {
    txnId,
    data: {
      date: text(r, "TxnDate") ?? "",
      reference: text(r, "RefNumber") || null,
      method: text(r, "PaymentMethodRef/FullName") || null,
      links: children(r, "AppliedToTxnRet").flatMap((t) => {
        const invoiceId = text(t, "TxnID");
        // Amount: what this payment put on that invoice (BalanceRemaining is what's still owed on it).
        const amount = money(text(t, "Amount"));
        return invoiceId && text(t, "TxnType") === "Invoice" && amount ? [{ invoiceId, amount }] : [];
      }),
    },
  };
}

/** Reads QuickBooks' reply to a payment request. */
export function readPaymentReply(xml: string): { ok: boolean; error?: string; payments: { txnId: string; data: PaymentData }[]; iteratorId?: string } {
  const { rs, error } = answerOf(xml, "ReceivePaymentQueryRs");
  if (error || !rs) return { ok: false, error, payments: [] };
  const remaining = Number(rs.attrs.iteratorRemainingCount ?? 0) || 0;
  return { ok: true, payments: children(rs, "ReceivePaymentRet").flatMap((p) => paymentFromXml(p) ?? []), ...(remaining > 0 && rs.attrs.iteratorID ? { iteratorId: rs.attrs.iteratorID } : {}) };
}

// --- Invoices (here → QuickBooks) -------------------------------------------------------------

const ref = (tag: string, listId: string | null | undefined) => (listId ? `<${tag}><ListID>${escapeXml(listId)}</ListID></${tag}>` : "");
/** A number as QuickBooks takes it (up to 5 decimals, no trailing zeros). */
const num = (n: number) => String(Math.round(n * 100000) / 100000);
const memo = (inv: InvoiceOut) => `<Memo>${escapeXml(`${inv.title} — from The Builder Station`.slice(0, 4000))}</Memo>`;
const header = (inv: InvoiceOut) => `<TxnDate>${qbDate(inv.issueDate)}</TxnDate><RefNumber>${escapeXml(String(inv.number).slice(0, 11))}</RefNumber>${inv.dueDate ? `<DueDate>${qbDate(inv.dueDate)}</DueDate>` : ""}`;

/**
 * A new invoice: on the job's Customer:Job, each line on its cost code's item (or, without one, the
 * item picked for invoice lines), with the job's class — the one on its bills — on it and each line.
 * Tax lines aren't sent (taxProblem stops an invoice with tax first).
 */
export function invoiceAddRequest(inv: InvoiceOut, o: { customerId: string; itemId: string | null; classId: string | null }): string {
  const lines = inv.items
    .filter((i) => !i.isTax)
    .map((i) => `<InvoiceLineAdd>${ref("ItemRef", i.itemId || o.itemId)}<Desc>${escapeXml(i.description.slice(0, 4000))}</Desc><Quantity>${num(i.quantity)}</Quantity><Rate>${num(i.unitPrice)}</Rate>${ref("ClassRef", o.classId)}</InvoiceLineAdd>`)
    .join("");
  return wrap(`<InvoiceAddRq requestID="1"><InvoiceAdd>${ref("CustomerRef", o.customerId)}${ref("ClassRef", o.classId)}${header(inv)}${memo(inv)}${lines}</InvoiceAdd></InvoiceAddRq>`);
}

/** An invoice already there is asked for first: its EditSequence changes whenever anyone edits it there. */
export const invoiceQueryRequest = (txnId: string) => wrap(`<InvoiceQueryRq requestID="1"><TxnID>${escapeXml(txnId)}</TxnID></InvoiceQueryRq>`);

/** Its number, dates and memo follow (its lines can't change here once sent — and anything added in QuickBooks stays). */
export const invoiceModRequest = (inv: InvoiceOut, txnId: string, editSequence: string) =>
  wrap(`<InvoiceModRq requestID="1"><InvoiceMod><TxnID>${escapeXml(txnId)}</TxnID><EditSequence>${escapeXml(editSequence)}</EditSequence>${header(inv)}${memo(inv)}</InvoiceMod></InvoiceModRq>`);

export const invoiceVoidRequest = (txnId: string) => wrap(`<TxnVoidRq requestID="1"><TxnVoidType>Invoice</TxnVoidType><TxnID>${escapeXml(txnId)}</TxnID></TxnVoidRq>`);

/** QuickBooks' answer to any of those four: the invoice's id and EditSequence there, or why it refused. */
export function readInvoiceReply(xml: string): { ok: boolean; error?: string; txnId?: string; editSequence?: string } {
  const rs = child(parseXml(xml), "QBXMLMsgsRs")?.children[0];
  if (!rs) return { ok: false, error: "QuickBooks' answer was missing" };
  const { error } = answerOf(xml, rs.name);
  if (error) return { ok: false, error };
  if (rs.name === "InvoiceQueryRs" && !child(rs, "InvoiceRet")) return { ok: false, error: "It isn't in QuickBooks any more" };
  return { ok: true, txnId: text(rs, "InvoiceRet/TxnID") ?? text(rs, "TxnID"), editSequence: text(rs, "InvoiceRet/EditSequence") };
}

// --- The Web Connector's side: SOAP ------------------------------------------------------

export type SoapCall = { method: string; args: Record<string, string> };

/** The Web Connector's call: which method, with what. */
export function readSoapCall(xml: string): SoapCall | null {
  const body = child(parseXml(xml), "Body");
  const call = body?.children[0];
  if (!call) return null;
  return { method: call.name, args: Object.fromEntries(call.children.map((c) => [c.name, c.text])) };
}

/** Our answer to a Web Connector method: one value, or a list of strings (authenticate). */
export function soapResponse(method: string, result: string | number | string[]) {
  const value = Array.isArray(result) ? result.map((s) => `<string>${escapeXml(s)}</string>`).join("") : escapeXml(result);
  return (
    `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<soap:Body><${method}Response xmlns="http://developer.intuit.com/"><${method}Result>${value}</${method}Result></${method}Response></soap:Body></soap:Envelope>`
  );
}

/** The .qwc file the Web Connector is given ("Add an application"). */
export function qwcFile(o: { appName: string; url: string; supportUrl: string; username: string; ownerId: string; fileId: string; everyMinutes?: number }) {
  return `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${escapeXml(o.appName)}</AppName>
  <AppID></AppID>
  <AppURL>${escapeXml(o.url)}</AppURL>
  <AppDescription>Brings your QuickBooks bills into The Builder Station, and links vendors, jobs and cost codes.</AppDescription>
  <AppSupport>${escapeXml(o.supportUrl)}</AppSupport>
  <UserName>${escapeXml(o.username)}</UserName>
  <OwnerID>${escapeXml(o.ownerId)}</OwnerID>
  <FileID>${escapeXml(o.fileId)}</FileID>
  <QBType>QBFS</QBType>
  <Scheduler>
    <RunEveryNMinutes>${o.everyMinutes ?? 15}</RunEveryNMinutes>
  </Scheduler>
  <IsReadOnly>false</IsReadOnly>
</QBWCXML>
`;
}

