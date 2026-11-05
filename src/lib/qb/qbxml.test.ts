import { test } from "node:test";
import assert from "node:assert/strict";
import { billRequest, deletedBillsRequest, listRequest, qwcFile, readBillReply, readDeletedReply, readListReply, readSoapCall, soapResponse } from "./qbxml";
import { escapeXml, parseXml } from "./xml";

const reply = (body: string) => `<?xml version="1.0" ?><QBXML><QBXMLMsgsRs>${body}</QBXMLMsgsRs></QBXML>`;

test("asks for a list a page at a time, then the next page by its iterator", () => {
  const first = listRequest("vendors");
  assert.match(first, /<\?qbxml version="13\.0"\?>/);
  assert.match(first, /<VendorQueryRq requestID="1" iterator="Start"><MaxReturned>200<\/MaxReturned><ActiveStatus>All<\/ActiveStatus><\/VendorQueryRq>/);
  assert.match(listRequest("vendors", "{abc-1}"), /iterator="Continue" iteratorID="\{abc-1\}"/);
  assert.doesNotMatch(listRequest("classes"), /iterator/, "QuickBooks doesn't page classes");
  parseXml(first); // well-formed
});

test("reads vendors, with more pages to come", () => {
  const r = readListReply(
    "vendors",
    reply(`<VendorQueryRs requestID="1" statusCode="0" statusSeverity="Info" statusMessage="Status OK" iteratorRemainingCount="3" iteratorID="{it-9}">
      <VendorRet><ListID>80000001-1</ListID><Name>Emerson Electrical Services LLC</Name><IsActive>true</IsActive><CompanyName>Emerson Electrical</CompanyName><FirstName>Jim</FirstName><LastName>Emerson</LastName><Phone>409-555-0100</Phone><Email>jim@emerson.com</Email></VendorRet>
      <VendorRet><ListID>80000002-1</ListID><Name>Old Lumber &amp; Supply</Name><IsActive>false</IsActive></VendorRet>
    </VendorQueryRs>`),
  );
  assert.ok(r.ok);
  assert.equal(r.iteratorId, "{it-9}");
  assert.equal(r.remaining, 3);
  assert.deepEqual(r.rows[0], {
    kind: "VENDOR",
    listId: "80000001-1",
    name: "Emerson Electrical Services LLC",
    fullName: "Emerson Electrical Services LLC",
    parentListId: null,
    sublevel: 0,
    active: true,
    detail: { companyName: "Emerson Electrical", phone: "409-555-0100", email: "jim@emerson.com", contact: "Jim Emerson" },
  });
  assert.equal(r.rows[1].name, "Old Lumber & Supply");
  assert.equal(r.rows[1].active, false);
});

test("reads customers and their jobs, and items of every kind with their cost account", () => {
  const c = readListReply(
    "customers",
    reply(`<CustomerQueryRs requestID="1" statusCode="0" statusSeverity="Info" statusMessage="Status OK" iteratorRemainingCount="0" iteratorID="{x}">
      <CustomerRet><ListID>C1</ListID><Name>Robert Kimura -370 Fletcher</Name><FullName>Robert Kimura -370 Fletcher</FullName><IsActive>true</IsActive><Sublevel>0</Sublevel></CustomerRet>
      <CustomerRet><ListID>C2</ListID><Name>370 Fletcher</Name><FullName>Robert Kimura -370 Fletcher:370 Fletcher</FullName><IsActive>true</IsActive><ParentRef><ListID>C1</ListID><FullName>Robert Kimura -370 Fletcher</FullName></ParentRef><Sublevel>1</Sublevel><JobStatus>InProgress</JobStatus></CustomerRet>
    </CustomerQueryRs>`),
  );
  assert.equal(c.iteratorId, undefined, "no more pages");
  assert.equal(c.rows[1].parentListId, "C1");
  assert.equal(c.rows[1].sublevel, 1);
  assert.equal(c.rows[1].fullName, "Robert Kimura -370 Fletcher:370 Fletcher");

  const i = readListReply(
    "items",
    reply(`<ItemQueryRs requestID="1" statusCode="0" statusSeverity="Info" statusMessage="Status OK">
      <ItemServiceRet><ListID>I1</ListID><Name>3720</Name><FullName>3720</FullName><IsActive>true</IsActive><SalesOrPurchase><Desc>Electrical Rough In</Desc><AccountRef><FullName>Work In Progress</FullName></AccountRef></SalesOrPurchase></ItemServiceRet>
      <ItemNonInventoryRet><ListID>I2</ListID><Name>Lumber</Name><IsActive>true</IsActive><SalesAndPurchase><PurchaseDesc>Framing lumber</PurchaseDesc><ExpenseAccountRef><FullName>Job Materials</FullName></ExpenseAccountRef></SalesAndPurchase></ItemNonInventoryRet>
      <ItemSubtotalRet><ListID>I3</ListID><Name>Subtotal</Name><IsActive>true</IsActive></ItemSubtotalRet>
    </ItemQueryRs>`),
  );
  assert.deepEqual(
    i.rows.map((r) => [r.name, r.detail]),
    [
      ["3720", { type: "Service", description: "Electrical Rough In", account: "Work In Progress" }],
      ["Lumber", { type: "Non-inventory", description: "Framing lumber", account: "Job Materials" }],
      ["Subtotal", { type: "Subtotal" }],
    ],
  );
});

test("an empty list is fine; a refusal says why", () => {
  const empty = readListReply("classes", reply(`<ClassQueryRs requestID="1" statusCode="1" statusSeverity="Info" statusMessage="A query request did not find a matching object in QuickBooks"/>`));
  assert.ok(empty.ok);
  assert.deepEqual(empty.rows, []);
  const no = readListReply("items", reply(`<ItemQueryRs requestID="1" statusCode="3200" statusSeverity="Error" statusMessage="The provided edit sequence is out-of-date."/>`));
  assert.equal(no.ok, false);
  assert.equal(no.error, "The provided edit sequence is out-of-date.");
  assert.equal(readListReply("company", reply(`<CompanyQueryRs requestID="1" statusCode="0" statusSeverity="Info"><CompanyRet><CompanyName>Sample Quality-Built Construction</CompanyName></CompanyRet></CompanyQueryRs>`)).companyName, "Sample Quality-Built Construction");
});

test("reads the Web Connector's SOAP calls and answers them", () => {
  const call = readSoapCall(`<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <receiveResponseXML xmlns="http://developer.intuit.com/"><ticket>t1</ticket><response>${escapeXml("<QBXML><x>a &amp; b</x></QBXML>")}</response><hresult /><message /></receiveResponseXML>
    </soap:Body></soap:Envelope>`);
  assert.equal(call?.method, "receiveResponseXML");
  assert.equal(call?.args.ticket, "t1");
  assert.equal(call?.args.response, "<QBXML><x>a &amp; b</x></QBXML>", "the qbXML inside comes out as it was sent");
  assert.equal(call?.args.hresult, "");

  const auth = soapResponse("authenticate", ["abc", "nvu"]);
  assert.match(auth, /<authenticateResult><string>abc<\/string><string>nvu<\/string><\/authenticateResult>/);
  const req = soapResponse("sendRequestXML", "<QBXML/>");
  assert.match(req, /<sendRequestXMLResult>&lt;QBXML\/&gt;<\/sendRequestXMLResult>/, "the request goes inside as text");
  assert.equal(parseXml(req).name, "Envelope");
});

test("the connection file has the address, the username and no password", () => {
  const f = qwcFile({ appName: "The Builder Station (JT&I Custom Homes)", url: "https://app.example.com/api/qbwc", supportUrl: "https://app.example.com/api/qbwc", username: "tbs-1", ownerId: "{O}", fileId: "{F}" });
  const x = parseXml(f);
  assert.equal(x.name, "QBWCXML");
  assert.equal(x.children.find((c) => c.name === "AppName")?.text, "The Builder Station (JT&I Custom Homes)");
  assert.equal(x.children.find((c) => c.name === "UserName")?.text, "tbs-1");
  assert.doesNotMatch(f, /password/i);
});

test("asks for bills: the last 12 months the first time, then what changed, then what was deleted", () => {
  const first = billRequest({ datedFrom: "2025-11-05" });
  assert.match(first, /<BillQueryRq requestID="1" iterator="Start"><MaxReturned>100<\/MaxReturned><TxnDateRangeFilter><FromTxnDate>2025-11-05<\/FromTxnDate><\/TxnDateRangeFilter><IncludeLineItems>true<\/IncludeLineItems><\/BillQueryRq>/);
  const next = billRequest({ changedSince: "2026-11-04" }, "{it-2}");
  assert.match(next, /iterator="Continue" iteratorID="\{it-2\}"/);
  assert.match(next, /<ModifiedDateRangeFilter><FromModifiedDate>2026-11-04T00:00:00<\/FromModifiedDate><\/ModifiedDateRangeFilter>/);
  assert.match(deletedBillsRequest("2026-11-04"), /<TxnDeletedQueryRq requestID="1"><TxnDelType>Bill<\/TxnDelType><DeletedDateRangeFilter><FromDeletedDate>2026-11-04T00:00:00<\/FromDeletedDate>/);
  parseXml(first);
});

test("reads a bill: item lines, expense lines and a group, each on its own job", () => {
  const r = readBillReply(
    reply(`<BillQueryRs requestID="1" statusCode="0" statusSeverity="Info" statusMessage="Status OK" iteratorRemainingCount="0" iteratorID="{it-3}">
      <BillRet><TxnID>1A2-1730000000</TxnID><VendorRef><ListID>80000001-1</ListID><FullName>Parker Lumber</FullName></VendorRef><TxnDate>2026-11-02</TxnDate><DueDate>2026-12-02</DueDate><AmountDue>1500.50</AmountDue><Memo>Framing pkg</Memo><RefNumber>INV-88</RefNumber><IsPaid>false</IsPaid><OpenAmount>500.50</OpenAmount>
        <ExpenseLineRet><TxnLineID>1</TxnLineID><AccountRef><FullName>Permits</FullName></AccountRef><Amount>100.00</Amount><CustomerRef><ListID>C-1</ListID><FullName>Smith:Smith House</FullName></CustomerRef></ExpenseLineRet>
        <ItemLineRet><TxnLineID>2</TxnLineID><ItemRef><ListID>I-2102</ListID><FullName>2102</FullName></ItemRef><Desc>2x6 studs</Desc><Amount>1200.50</Amount><CustomerRef><ListID>C-1</ListID><FullName>Smith:Smith House</FullName></CustomerRef></ItemLineRet>
        <ItemGroupLineRet><TxnLineID>3</TxnLineID><ItemGroupRef><FullName>Kit</FullName></ItemGroupRef>
          <ItemLineRet><TxnLineID>4</TxnLineID><ItemRef><ListID>I-2200</ListID><FullName>2200</FullName></ItemRef><Amount>200.00</Amount><CustomerRef><ListID>C-2</ListID><FullName>Jones</FullName></CustomerRef></ItemLineRet>
        </ItemGroupLineRet>
      </BillRet>
      <BillRet><TxnID>1A3-1730000001</TxnID><VendorRef><ListID>80000002-1</ListID><FullName>Emerson Electrical</FullName></VendorRef><TxnDate>2026-11-03</TxnDate><AmountDue>50</AmountDue><IsPaid>true</IsPaid><OpenAmount>0.00</OpenAmount></BillRet>
    </BillQueryRs>`),
  );
  assert.ok(r.ok);
  assert.equal(r.iteratorId, undefined, "nothing left: no next page");
  assert.equal(r.bills.length, 2);
  assert.deepEqual(r.bills[0], {
    txnId: "1A2-1730000000",
    data: {
      vendorId: "80000001-1",
      vendorName: "Parker Lumber",
      number: "INV-88",
      date: "2026-11-02",
      due: "2026-12-02",
      note: "Framing pkg",
      total: 1500.5,
      balance: 500.5,
      lines: [
        { description: "Permits", itemId: null, customerId: "C-1", customerName: "Smith:Smith House", amount: 100 },
        { description: "2x6 studs", itemId: "I-2102", customerId: "C-1", customerName: "Smith:Smith House", amount: 1200.5 },
        { description: "2200", itemId: "I-2200", customerId: "C-2", customerName: "Jones", amount: 200 },
      ],
    },
  });
  assert.equal(r.bills[1].data.balance, 0, "paid");
  assert.deepEqual(r.bills[1].data.lines, []);
});

test("reads deleted bills, and QuickBooks' refusals", () => {
  const d = readDeletedReply(
    reply(`<TxnDeletedQueryRs requestID="1" statusCode="0" statusSeverity="Info" statusMessage="Status OK"><TxnDeletedRet><TxnDelType>Bill</TxnDelType><TxnID>1A2-1730000000</TxnID></TxnDeletedRet></TxnDeletedQueryRs>`),
  );
  assert.deepEqual(d, { ok: true, txnIds: ["1A2-1730000000"] });
  assert.deepEqual(readDeletedReply(reply(`<TxnDeletedQueryRs requestID="1" statusCode="1" statusSeverity="Info" statusMessage="No match"/>`)), { ok: true, txnIds: [] });
  const bad = readBillReply(reply(`<BillQueryRs requestID="1" statusCode="3120" statusSeverity="Error" statusMessage="Object not found"/>`));
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "Object not found");
});
