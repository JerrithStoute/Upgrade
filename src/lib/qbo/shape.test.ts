import { test } from "node:test";
import assert from "node:assert/strict";
import { billData, billPaid, billParts, fingerprint, invoiceBody, listRow, paymentData, paymentMethod, taxProblem, type InvoiceOut } from "./shape";
import { costableItem, jobChoices, planJobs } from "@/lib/qb/match";

test("lists read like the Desktop connection's, so jobs and cost codes link the same way", () => {
  const vendor = listRow("VENDOR", { Id: "56", DisplayName: "Emerson Electrical", Active: true, GivenName: "Ray", FamilyName: "Emerson", PrimaryPhone: { FreeFormNumber: "409-555-0100" } });
  assert.deepEqual(vendor, { kind: "VENDOR", listId: "56", name: "Emerson Electrical", fullName: "Emerson Electrical", parentListId: null, sublevel: 0, active: true, detail: { phone: "409-555-0100", contact: "Ray Emerson" } });

  const customer = listRow("CUSTOMER", { Id: "7", DisplayName: "Smith, Sam", FullyQualifiedName: "Smith, Sam", Active: true, Level: 0 })!;
  const job = listRow("CUSTOMER", { Id: "8", DisplayName: "Whitfield", FullyQualifiedName: "Smith, Sam:Whitfield", Job: true, ParentRef: { value: "7" }, Level: 1, Active: true })!;
  assert.equal(job.name, "Whitfield");
  assert.equal(job.parentListId, "7");
  // A customer with a job under it isn't a job choice; its job is.
  assert.deepEqual(
    jobChoices([customer, job].map((r) => ({ ...r }))).map((c) => c.listId),
    ["8"],
  );
  assert.deepEqual(planJobs([customer, job], [{ id: "p1", name: "whitfield", qbListId: null }]).link, [{ projectId: "p1", listId: "8" }]);

  const service = listRow("ITEM", { Id: "30", Name: "3720", FullyQualifiedName: "3720", Type: "Service", Active: true, Description: "Framing labor" })!;
  const category = listRow("ITEM", { Id: "31", Name: "Labor", Type: "Category", Active: true })!;
  assert.equal(service.detail.type, "Service");
  assert.ok(costableItem(service));
  assert.ok(!costableItem(category));
  assert.equal(listRow("CLASS", { Id: "1", Name: "2026 Construction", Active: false })!.active, false);
  assert.equal(listRow("VENDOR", { Id: "1" }), null);
});

const bill = billData({
  Id: "145",
  SyncToken: "2",
  VendorRef: { value: "56", name: "Emerson Electrical" },
  DocNumber: "INV-881",
  TxnDate: "2026-10-20",
  DueDate: "2026-11-19",
  TotalAmt: 1750,
  Balance: 1750,
  Line: [
    { Id: "1", Amount: 1200, Description: "Rough-in", DetailType: "ItemBasedExpenseLineDetail", ItemBasedExpenseLineDetail: { ItemRef: { value: "30", name: "3720" }, CustomerRef: { value: "8", name: "Smith, Sam:Whitfield" } } },
    { Id: "2", Amount: 300, DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: { AccountRef: { value: "90", name: "Job Materials" }, CustomerRef: { value: "8" } } },
    { Id: "3", Amount: 200, DetailType: "ItemBasedExpenseLineDetail", ItemBasedExpenseLineDetail: { ItemRef: { value: "30", name: "3720" }, CustomerRef: { value: "9", name: "Jones:Lake House" } } },
    { Id: "4", Amount: 50, Description: "Office supplies", DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: { AccountRef: { value: "91", name: "Office" } } },
  ],
});

test("a bill splits by job; lines on an unlinked customer wait; the office's own lines don't count", () => {
  assert.equal(bill.vendorName, "Emerson Electrical");
  assert.equal(bill.lines[1].description, "Job Materials");
  const jobOf = (id: string) => (id === "8" ? "whitfield" : null);
  const codeOf = (id: string) => (id === "30" ? "code3720" : null);
  const { parts, waiting } = billParts(bill, jobOf, codeOf);
  assert.deepEqual(parts, [
    {
      projectId: "whitfield",
      lines: [
        { description: "Rough-in", costCodeId: "code3720", amount: 1200 },
        { description: "Job Materials", costCodeId: null, amount: 300 },
      ],
    },
  ]);
  assert.deepEqual(waiting, [{ customerId: "9", customerName: "Jones:Lake House", amount: 200 }]);
  assert.equal(billPaid(bill), false);
  assert.equal(billPaid({ ...bill, balance: 0 }), true);
});

test("the fingerprint changes when the bill or where it lands changes", () => {
  const parts = billParts(bill, () => "a", () => null).parts;
  assert.equal(fingerprint({ bill, parts }), fingerprint({ bill, parts }));
  assert.notEqual(fingerprint({ bill, parts }), fingerprint({ bill: { ...bill, balance: 0 }, parts }));
  assert.notEqual(fingerprint({ bill, parts }), fingerprint({ bill, parts: billParts(bill, () => "b", () => null).parts }));
});

test("a payment: what it paid on each invoice, and how", () => {
  const p = paymentData({
    Id: "300",
    TxnDate: "2026-10-25",
    PaymentRefNum: "1042",
    PaymentMethodRef: { value: "2", name: "Check" },
    Line: [
      { Amount: 5000, LinkedTxn: [{ TxnId: "130", TxnType: "Invoice" }] },
      { Amount: 25, LinkedTxn: [{ TxnId: "9", TxnType: "CreditMemo" }] },
    ],
  });
  assert.deepEqual(p, { date: "2026-10-25", reference: "1042", method: "Check", links: [{ invoiceId: "130", amount: 5000 }] });
  assert.equal(paymentMethod("Check"), "CHECK");
  assert.equal(paymentMethod("Visa"), "CARD");
  assert.equal(paymentMethod("Bank transfer"), "ACH");
  assert.equal(paymentMethod(null), "OTHER");
});

const inv: InvoiceOut = {
  number: 1042,
  title: "Draw 3",
  issueDate: new Date(2026, 9, 28, 12),
  dueDate: new Date(2026, 10, 12, 12),
  notes: "Thank you!",
  items: [
    { description: "Progress draw (20%)", quantity: 1, unitPrice: 48000, isTax: false },
    { description: "Change Order #4 — Extra outlets", quantity: 2, unitPrice: 150.5, isTax: false },
  ],
};

test("an invoice goes out on the job's customer, every line on the item picked", () => {
  const body = invoiceBody(inv, "8", "40");
  assert.equal(body.CustomerRef.value, "8");
  assert.equal(body.DocNumber, "1042");
  assert.equal(body.TxnDate, "2026-10-28");
  assert.equal(body.DueDate, "2026-11-12");
  assert.deepEqual(body.CustomerMemo, { value: "Thank you!" });
  assert.deepEqual(body.Line[1], {
    DetailType: "SalesItemLineDetail",
    Amount: 301,
    Description: "Change Order #4 — Extra outlets",
    SalesItemLineDetail: { ItemRef: { value: "40" }, Qty: 2, UnitPrice: 150.5 },
  });
  assert.equal(taxProblem(inv), null);
  // Sales tax isn't sent — QuickBooks works out its own.
  assert.match(taxProblem({ ...inv, items: [...inv.items, { description: "Sales tax", quantity: 1, unitPrice: 12, isTax: true }] })!, /sales tax/);
  assert.equal(taxProblem({ ...inv, items: [...inv.items, { description: "Sales tax", quantity: 1, unitPrice: 0, isTax: true }] }), null);
});
