import { test } from "node:test";
import assert from "node:assert/strict";
import { planCostCodes, planJobs, planVendors, type QbEntry } from "./match";

const q = (listId: string, name: string, more: Partial<QbEntry> = {}): QbEntry => ({ listId, name, fullName: name, parentListId: null, sublevel: 0, active: true, detail: {}, ...more });

test("vendors come from QuickBooks: linked by name, added, or renamed", () => {
  const plan = planVendors(
    [
      q("V1", "Emerson Electrical Services LLC", { detail: { phone: "409-555-0100" } }),
      q("V2", "BMC"),
      q("V3", "Old Supplier", { active: false }),
      q("V4", "Beaumont Lumber Co"),
    ],
    [
      { id: "a", name: "bmc ", qbListId: null }, // same vendor, typed differently
      { id: "b", name: "Beaumont Lumber", qbListId: "V4" }, // linked; renamed in QuickBooks
    ],
  );
  assert.deepEqual(plan.link, [{ vendorId: "a", listId: "V2" }]);
  assert.deepEqual(plan.rename, [{ vendorId: "b", from: "Beaumont Lumber", name: "Beaumont Lumber Co" }]);
  assert.deepEqual(plan.create, [{ listId: "V1", name: "Emerson Electrical Services LLC", contact: null, phone: "409-555-0100", email: null }], "inactive vendors aren't added");
});

test("a QuickBooks rename doesn't clash with another vendor here", () => {
  const plan = planVendors([q("V1", "BMC")], [
    { id: "a", name: "BMC West", qbListId: "V1" },
    { id: "b", name: "BMC", qbListId: null },
  ]);
  assert.deepEqual(plan.rename, []);
});

test("jobs link to the Customer:Job of exactly the same name — never guessed", () => {
  const customers = [
    q("C1", "Robert Kimura -370 Fletcher"),
    q("C2", "370 Fletcher", { fullName: "Robert Kimura -370 Fletcher:370 Fletcher", parentListId: "C1", sublevel: 1 }),
    q("C3", "Smith Remodel"), // a customer with no jobs is a job itself
    q("C4", "Lake House", { fullName: "Ann Lee:Lake House", parentListId: "C9", sublevel: 1 }),
    q("C5", "Lake House", { fullName: "Bo Park:Lake House", parentListId: "C8", sublevel: 1 }),
    q("C6", "Whitfield"),
  ];
  const plan = planJobs(customers, [
    { id: "p1", name: "370  fletcher", qbListId: null },
    { id: "p2", name: "Smith Remodel", qbListId: null },
    { id: "p3", name: "Lake House", qbListId: null }, // two in QuickBooks: you pick
    { id: "p4", name: "Robert Kimura -370 Fletcher", qbListId: null }, // the customer above a job isn't a job
    { id: "p5", name: "Whitfield", qbListId: "C6" }, // already linked
    { id: "p6", name: "New Build", qbListId: null }, // not in QuickBooks yet
  ]);
  assert.deepEqual(plan.link, [
    { projectId: "p1", listId: "C2" },
    { projectId: "p2", listId: "C3" },
  ]);
  assert.deepEqual(plan.ambiguous, ["p3"]);
});

test("two jobs here can't take the same Customer:Job", () => {
  const plan = planJobs([q("C1", "Barn")], [
    { id: "p1", name: "Barn", qbListId: null },
    { id: "p2", name: "barn", qbListId: null },
  ]);
  assert.deepEqual(plan.link, [{ projectId: "p1", listId: "C1" }]);
});

test("cost codes link to the item named with their code (cost items only)", () => {
  const items = [
    q("I1", "3720", { detail: { type: "Service" } }),
    q("I2", "3721", { detail: { type: "Service" } }),
    q("I3", "1000", { detail: { type: "Subtotal" } }), // not a cost item
    q("I4", "1001", { detail: { type: "Service" }, active: false }),
  ];
  const { link } = planCostCodes(items, [
    { id: "a", code: "3720", qbListId: null },
    { id: "b", code: " 3721 ", qbListId: null },
    { id: "c", code: "1000", qbListId: null },
    { id: "d", code: "1001", qbListId: null },
    { id: "e", code: null, qbListId: null },
  ]);
  assert.deepEqual(link, [
    { costCodeId: "a", listId: "I1" },
    { costCodeId: "b", listId: "I2" },
  ]);
});
