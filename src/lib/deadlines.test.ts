import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, deadlineState, tiedDeadline } from "./deadlines";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("selection deadlines", () => {
  it("counts days before a schedule item", () => {
    assert.equal(tiedDeadline(d("2026-07-24"), 0).toDateString(), d("2026-07-24").toDateString());
    assert.equal(tiedDeadline(d("2026-07-24"), 14).toDateString(), d("2026-07-10").toDateString());
  });

  it("is overdue only when past and nothing is chosen yet", () => {
    const today = d("2026-07-25");
    assert.equal(deadlineState(d("2026-07-24"), "PENDING", today), "overdue");
    assert.equal(deadlineState(d("2026-07-24"), "CHOSEN", today), null);
    assert.equal(deadlineState(d("2026-07-24"), "DECLINED", today), null);
    assert.equal(deadlineState(d("2026-07-25"), "PENDING", today), "soon"); // due today
    assert.equal(deadlineState(d("2026-08-01"), "PENDING", today), "soon");
    assert.equal(deadlineState(d("2026-08-10"), "PENDING", today), null);
    assert.equal(deadlineState(null, "PENDING", today), null);
    assert.equal(daysUntil(d("2026-07-28"), today), 3);
  });
});
