import { test } from "node:test";
import assert from "node:assert/strict";
import { standardFromBody } from "./bid-email";

test("your standard message is what's between the greeting and the job — not the bid's own note", () => {
  const body = ["Hello Pat,", "", "Quote by Friday please.", "Prices good 30 days.", "", "Deliver ASAP", "", "Job #1001 — Whitfield", "Deliver to: Austin", "", "Thank you,", "JT&I"].join("\n");
  assert.equal(standardFromBody(body, "Deliver ASAP"), "Quote by Friday please.\nPrices good 30 days.");
  assert.equal(standardFromBody("Just my words.\n\nJob #3 — X", null), "Just my words.", "no greeting");
  assert.equal(standardFromBody("Hi,\nNothing else", null), "Nothing else", "no job line");
});
