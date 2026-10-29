import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpen, showsWarranty, sortWarranty, warrantyEnds, warrantyLabel, warrantyWords } from "./warranty";

test("the warranty runs its months from the day the job was finished", () => {
  assert.equal(warrantyEnds(null, 12), null);
  assert.equal(warrantyEnds(new Date(2026, 2, 15), 12)!.toDateString(), new Date(2027, 2, 15).toDateString());
  // The end of a month stays in that month.
  assert.equal(warrantyEnds(new Date(2026, 0, 31), 1)!.toDateString(), new Date(2026, 1, 28).toDateString());
  assert.equal(warrantyEnds(new Date(2026, 5, 1), 24)!.toDateString(), new Date(2028, 5, 1).toDateString());
});

test("covered, ended, or not started — in words", () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date(2026, 9, 29);
  assert.equal(warrantyWords(null, 12, today, fmt).covered, null);
  assert.equal(warrantyWords(new Date(2026, 0, 10), 12, today, fmt).covered, true);
  assert.equal(warrantyWords(new Date(2025, 0, 10), 12, today, fmt).covered, false);
});

test("statuses read the same everywhere; open is New or Scheduled", () => {
  assert.equal(warrantyLabel("NEW"), "New");
  assert.equal(warrantyLabel("NOT_COVERED"), "Not covered");
  assert.ok(isOpen("SCHEDULED"));
  assert.ok(!isOpen("DONE"));
});

test("a job shows Warranty once it's finished, or has a request", () => {
  assert.ok(!showsWarranty({ status: "IN_PROGRESS", actualEndDate: null }, 0));
  assert.ok(showsWarranty({ status: "COMPLETED", actualEndDate: null }, 0));
  assert.ok(showsWarranty({ status: "IN_PROGRESS", actualEndDate: new Date() }, 0));
  assert.ok(showsWarranty({ status: "IN_PROGRESS", actualEndDate: null }, 1));
});

test("urgent and oldest open ones first; closed ones last, newest first", () => {
  const d = (n: number) => new Date(2026, 9, n);
  const rows = [
    { id: "done-old", status: "DONE", urgent: false, createdAt: d(1), closedAt: d(2) },
    { id: "new", status: "NEW", urgent: false, createdAt: d(3), closedAt: null },
    { id: "urgent", status: "NEW", urgent: true, createdAt: d(5), closedAt: null },
    { id: "older", status: "SCHEDULED", urgent: false, createdAt: d(2), closedAt: null },
    { id: "done-new", status: "NOT_COVERED", urgent: false, createdAt: d(1), closedAt: d(9) },
  ];
  assert.deepEqual(
    sortWarranty(rows).map((r) => r.id),
    ["urgent", "older", "new", "done-new", "done-old"],
  );
});
