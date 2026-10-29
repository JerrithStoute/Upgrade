import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSlug, firstFree, slugFromName, validSlug } from "./sign-in-slug";

test("a builder's sign-in address comes from its name", () => {
  assert.equal(slugFromName("JT&I Custom Homes"), "jti");
  assert.equal(slugFromName("Stoute Builders LLC"), "stoute");
  assert.equal(slugFromName("A B Construction"), "a-b-construction");
  assert.equal(slugFromName("Ébène Homes"), "ebene");
  assert.equal(slugFromName("!!!"), "builder");
});

test("only usable addresses, never the program's own pages", () => {
  assert.ok(validSlug("jti"));
  assert.ok(!validSlug("two-step"));
  assert.ok(!validSlug("ab"));
  assert.ok(!validSlug("-jti"));
  assert.ok(!validSlug("JTI"));
  assert.ok(!validSlug(null));
  assert.equal(cleanSlug("  JT&I Homes! "), "jt-i-homes");
  assert.equal(cleanSlug("---"), null);
});

test("a taken address gets a number", () => {
  const taken = new Set(["jti", "jti-2"]);
  assert.equal(firstFree("jti", (s) => taken.has(s)), "jti-3");
  assert.equal(firstFree("stoute", (s) => taken.has(s)), "stoute");
});
