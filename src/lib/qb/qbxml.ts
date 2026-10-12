import { child, escapeXml, parseXml, text, type XmlNode } from "./xml";

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

const wrap = (body: string) => `<?xml version="1.0" encoding="utf-8"?><?qbxml version="${QBXML_VERSION}"?><QBXML><QBXMLMsgsRq onError="stopOnError">${body}</QBXMLMsgsRq></QBXML>`;

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
  <AppDescription>Links your vendors, jobs and cost codes with The Builder Station.</AppDescription>
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

