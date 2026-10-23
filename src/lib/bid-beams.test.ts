import { test } from "node:test";
import assert from "node:assert/strict";
import { asSent, beamLength, toPerLf } from "./bid-beams";

test("a beam goes out by the piece and its price comes back per lf", () => {
  const beam = { key: "item1|pieces:18", unit: "lf", quantity: 36, unitPrice: null };
  assert.equal(beamLength(beam), 18);
  assert.deepEqual(asSent(beam), { quantity: 2, unit: "ea", unitPrice: null, len: 18 });
  assert.equal(toPerLf(540, "beam", 18), 30, "$540 a beam, 18' long = $30/lf");
  assert.equal(toPerLf(30, "lf", 18), 30, "already per lf");
  assert.deepEqual(asSent({ ...beam, unitPrice: 30 }).unitPrice, 540);
  assert.equal(beamLength({ key: "item1|pieces:18.0833", unit: "lf" }), 18.0833, "18'-1\"");
});

test("anything else is left as it is", () => {
  assert.equal(beamLength({ key: "item2", unit: "lf" }), null);
  assert.equal(beamLength({ key: "item3|pieces:18", unit: "ea" }), null);
  assert.deepEqual(asSent({ key: "item2", unit: "sf", quantity: 120, unitPrice: 2 }), { quantity: 120, unit: "sf", unitPrice: 2, len: null });
  assert.equal(toPerLf(12, "beam", null), 12);
});
