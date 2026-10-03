import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupCategory, groupOf, itemKind, kindOfLegacyCategory } from "./code-groups";

describe("item kinds and where they're filed", () => {
  it("an item's own kind wins over its category name", () => {
    assert.equal(itemKind({ kind: "trim", category: "5200 Interior Trim" }), "trim");
    assert.equal(itemKind({ kind: null, category: "5200 Interior Trim" }), null);
  });

  it("older items under a built-in name count as that kind", () => {
    assert.equal(itemKind({ category: "Framing Lumber" }), "framing lumber");
    assert.equal(kindOfLegacyCategory("  doors "), "doors");
    assert.equal(kindOfLegacyCategory("3100 Framing"), null);
  });

  it("doors split into interior and exterior", () => {
    assert.equal(groupOf("doors", true), "doors:exterior");
    assert.equal(groupOf("doors", false), "doors:interior");
    assert.equal(groupOf("windows"), "windows");
    assert.equal(groupOf(null), null);
  });

  it("new items go in your category, else the built-in name", () => {
    assert.equal(groupCategory("trim", { trim: { sameForAll: true, costCodeId: null, category: "5200 Interior Trim" } }), "5200 Interior Trim");
    assert.equal(groupCategory("trim", {}), "Trim");
    assert.equal(groupCategory("doors:exterior", { "doors:exterior": { sameForAll: true, costCodeId: null, category: null } }), "Doors");
  });
});
