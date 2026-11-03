import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { billingSummary } from "./billing-summary";

describe("what you can bill", () => {
  const cos = [
    { id: "a", number: 1, title: "Covered patio", total: 18400 },
    { id: "b", number: 2, title: "Black windows", total: 6250 },
    { id: "c", number: 3, title: "Selections", total: -500 },
  ];
  const s = billingSummary(485000, cos, [
    { number: 1011, status: "PAID", paid: 97000, items: [{ description: "Progress draw (20%)", changeOrderId: null, isTax: false, amount: 97000 }] },
    {
      number: 1012,
      status: "SENT",
      paid: 0,
      items: [
        { description: "Progress draw (20%)", changeOrderId: null, isTax: false, amount: 97000 },
        // Split by cost code, and an older line named for its change order.
        { description: "Change Order #1 — Covered patio — Concrete", changeOrderId: "a", isTax: false, amount: 8000 },
        { description: "Change Order #1 — Covered patio — Framing", changeOrderId: null, isTax: false, amount: 10400 },
      ],
    },
    { number: 1013, status: "DRAFT", paid: 0, items: [{ description: "Change Order #2 — Black windows", changeOrderId: "b", isTax: false, amount: 6250 }] },
    { number: 1009, status: "VOID", paid: 0, items: [{ description: "Deposit", changeOrderId: null, isTax: false, amount: 50000 }] },
  ]);

  it("bills draws against the contract and change order lines against their change order", () => {
    assert.deepEqual([s.contract.billed, s.contract.left], [194000, 291000]);
    assert.deepEqual(
      s.changeOrders.map((r) => [r.label, r.billed, r.left, r.drafts]),
      [
        ["#1 Covered patio", 18400, 0, []],
        ["#2 Black windows", 0, 6250, [1013]],
        ["#3 Selections", 0, -500, []],
      ],
    );
  });

  it("adds it all up, leaving out void invoices and drafts", () => {
    assert.deepEqual(s.total, { amount: 509150, billed: 212400, left: 296750 });
    assert.deepEqual([s.paid, s.balance], [97000, 115400]);
  });
});
