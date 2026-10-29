import { test } from "node:test";
import assert from "node:assert/strict";
import { kindsFor, pushOffList, sitePath } from "./push-kinds";

test("each person gets the notifications that are theirs", () => {
  assert.deepEqual(kindsFor("CLIENT"), ["SELECTIONS", "APPROVALS", "INVOICES", "MESSAGES", "WARRANTY"]);
  assert.deepEqual(kindsFor("VENDOR"), ["POS", "MESSAGES", "WARRANTY"]);
  assert.deepEqual(kindsFor("ADMIN"), ["CLIENT_ANSWERS", "VENDOR_ANSWERS", "MESSAGES", "WARRANTY"]);
  assert.deepEqual(kindsFor("STAFF"), kindsFor("ADMIN"));
});

test("what's turned off is read safely", () => {
  assert.deepEqual(pushOffList(null), []);
  assert.deepEqual(pushOffList('["MESSAGES","NOT_A_KIND"]'), ["MESSAGES"]);
  assert.deepEqual(pushOffList("not json"), []);
  assert.deepEqual(pushOffList('{"MESSAGES":true}'), []);
});

test("a notification opens a page on this site, never somewhere else", () => {
  assert.equal(sitePath("https://app.thebuilderstation.com/portal/invoices/abc?x=1"), "/portal/invoices/abc?x=1");
  assert.equal(sitePath("/projects/1/messages?thread=2"), "/projects/1/messages?thread=2");
  assert.equal(sitePath("https://evil.example.com/steal"), "/steal");
});
