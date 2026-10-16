import { test } from "node:test";
import assert from "node:assert/strict";
import { changeSections, parseSections, sectionKey, sectionsJson } from "./joist-sections";

test("a bay's size and run-through walls: set, cleared, stored only when there's something", () => {
  let s = parseSections(null);
  assert.equal(sectionsJson(s), null);
  const bay = sectionKey("wall-a", "wall-b", 1);
  s = changeSections(s, { section: bay, size: "2x8" });
  s = changeSections(s, { wall: "wall-b", through: true });
  const back = parseSections(sectionsJson(s));
  assert.deepEqual(back, { sizes: { "wall-a|wall-b|1": "2x8" }, through: ["wall-b"], breaks: [] });
  s = changeSections(back, { section: bay, size: null });
  s = changeSections(s, { wall: "wall-b", through: false });
  assert.deepEqual(s.breaks, ["wall-b"], "broken again — and kept broken (Cheapest packing won't join it)");
  s = changeSections(s, { wall: "wall-b", through: true });
  s = changeSections(s, { wall: "wall-b", through: false });
  s = { ...s, breaks: [] };
  assert.equal(sectionsJson(s), null, "back to the table: nothing stored");
});

test("anything odd in storage is dropped, not trusted", () => {
  assert.deepEqual(parseSections("not json"), { sizes: {}, through: [], breaks: [] });
  assert.deepEqual(parseSections(JSON.stringify({ sizes: { nobar: "2x8", "a|b": 5, "c|d": " 2x10 " }, through: ["edge", "w", "w", 3] })), { sizes: { "c|d": "2x10" }, through: ["w"], breaks: [] });
});
