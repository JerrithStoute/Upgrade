import { test } from "node:test";
import assert from "node:assert/strict";
import { isStale, recheckFields, recheckOf, recheckText, staleOn } from "./price-recheck";

test("recheck: blank or bad = never", () => {
  assert.equal(recheckOf({ priceRecheckEvery: null, priceRecheckUnit: null }), null);
  assert.equal(recheckOf({ priceRecheckEvery: 3, priceRecheckUnit: "years" }), null);
  assert.equal(recheckOf(null), null);
  assert.deepEqual(recheckOf({ priceRecheckEvery: 3, priceRecheckUnit: "weeks" }), { every: 3, unit: "weeks" });
});

test("recheck: text", () => {
  assert.equal(recheckText({ every: 1, unit: "months" }), "1 month");
  assert.equal(recheckText({ every: 3, unit: "weeks" }), "3 weeks");
});

test("recheck: stale dates", () => {
  const checked = new Date(2026, 0, 31);
  assert.equal(staleOn(checked, { every: 3, unit: "weeks" }).getDate(), 21);
  assert.equal(staleOn(checked, { every: 6, unit: "months" }).getMonth(), 6);
  const lumber = { every: 3, unit: "weeks" } as const;
  assert.equal(isStale({ unitCost: 5, priceCheckedAt: checked }, lumber, new Date(2026, 1, 20)), false);
  assert.equal(isStale({ unitCost: 5, priceCheckedAt: checked }, lumber, new Date(2026, 1, 21)), true);
  // No price is "needs a price", not stale; no recheck time = never stale.
  assert.equal(isStale({ unitCost: 0, priceCheckedAt: checked }, lumber, new Date(2027, 0, 1)), false);
  assert.equal(isStale({ unitCost: 5, priceCheckedAt: checked }, null, new Date(2030, 0, 1)), false);
});

test("recheck: form fields", () => {
  const fd = new FormData();
  fd.set("priceRecheckEvery", "6");
  fd.set("priceRecheckUnit", "months");
  assert.deepEqual(recheckFields(fd), { priceRecheckEvery: 6, priceRecheckUnit: "months" });
  fd.set("priceRecheckEvery", "");
  assert.deepEqual(recheckFields(fd), { priceRecheckEvery: null, priceRecheckUnit: null });
});
