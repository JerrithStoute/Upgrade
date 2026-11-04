import { test } from "node:test";
import assert from "node:assert/strict";
import { markDifferences, namePairs, namesMatch, numbersOf } from "./item-duplicates";

test("pairs names that are one item typed twice", () => {
  assert.equal(namesMatch("2x4 × 16'", "2x4x16"), "size");
  assert.equal(namesMatch("2x4 x 16", "2X4X16"), "size");
  assert.equal(namesMatch('Casing, Colonial 2-1/4"', 'Colonial Casing 2-1/4"'), "order");
  assert.equal(namesMatch('Colonial Baseboard 3-1/4"', 'Colonial Baseoard 3-1/4"'), "letters");
  assert.equal(namesMatch("Construction Adhesive", "Constrution Adhesive"), "letters");
});

test("never pairs different numbers or different words", () => {
  assert.equal(namesMatch("2x4x16", "2x4x14"), null);
  assert.equal(namesMatch("1x4 Pine", "1x6 Pine"), null);
  assert.equal(namesMatch('Casing 2-1/4"', 'Casing 2-1/2"'), null);
  assert.equal(namesMatch("2x4 Treated", "2x4 Untreated"), null);
  assert.equal(namesMatch("Stud", "Studs"), null, "short names are too easy to mix up");
  assert.equal(namesMatch("Joist hanger", "Ridge vent"), null);
  assert.equal(numbersOf('LVL 1-3/4" x 11-7/8"'), "1-3/4 11-7/8");
});

test("finds each pair once, skips doors, windows and pairs marked not the same", () => {
  const items = [
    { id: "b", name: "2x4x16", kind: "framing lumber" },
    { id: "a", name: "2x4 × 16'", kind: "framing lumber" },
    { id: "c", name: "2x4x14", kind: "framing lumber" },
    { id: "d", name: "2868 Hollow Core", kind: "doors" },
    { id: "e", name: "2868 Hollow Cor", kind: "doors" },
  ];
  assert.deepEqual(namePairs(items).map((p) => p.key), ["a|b"]);
  assert.deepEqual(namePairs(items, ["a|b"]), []);
});

test("marks the letters that differ", () => {
  const [a, b] = markDifferences("Baseboard", "Baseoard");
  assert.deepEqual(a, [{ text: "Base", off: false }, { text: "b", off: true }, { text: "oard", off: false }]);
  assert.deepEqual(b, [{ text: "Baseoard", off: false }]);
});
