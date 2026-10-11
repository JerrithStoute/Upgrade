import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKey } from "./storage-key";

test("file keys use forward slashes, old Windows ones too", () => {
  assert.equal(normalizeKey("proj1\\abc.pdf"), "proj1/abc.pdf");
  assert.equal(normalizeKey("company/logo-1.png"), "company/logo-1.png");
  assert.equal(normalizeKey("/vendors/v1/coi.pdf"), "vendors/v1/coi.pdf");
});

test("keys can't climb out of the storage area", () => {
  for (const bad of ["../secret", "a/../../b", "a\\..\\b", "", "a//b", "./a"]) assert.throws(() => normalizeKey(bad), bad);
});
