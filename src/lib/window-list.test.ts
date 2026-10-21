import { test } from "node:test";
import assert from "node:assert/strict";
import { readColor, readJobWindows, readSizeCode, readWindowDetails, sizeCode, windowName } from "./window-list";

test("sizes read the way builders write them", () => {
  assert.deepEqual(readSizeCode("3050"), { widthIn: 36, heightIn: 60 });
  assert.deepEqual(readSizeCode("2868"), { widthIn: 32, heightIn: 80 });
  assert.deepEqual(readSizeCode(" 5040 "), { widthIn: 60, heightIn: 48 });
  assert.deepEqual(readSizeCode('36" x 60"'), { widthIn: 36, heightIn: 60 });
  assert.equal(readSizeCode("big one"), null);
  assert.equal(readSizeCode("0000"), null);
  assert.equal(sizeCode(36, 60), "3050");
  assert.equal(sizeCode(32, 80), "2868");
});

test("a window's name: size, type, color, then the company's own details", () => {
  assert.equal(windowName({ widthIn: 36, heightIn: 60, type: "Single Hung", color: "Standard" }), "3050 Single Hung");
  assert.equal(windowName({ widthIn: 36, heightIn: 60, type: "Single Hung", color: "White/Black" }), "3050 Single Hung White/Black");
  assert.equal(windowName({ widthIn: 60, heightIn: 48, type: "Picture", color: "Black/Black" }), "5040 Picture Black/Black");
  const details = readWindowDetails(JSON.stringify([{ name: "Grids", kind: "yesno" }, { name: "Glass", kind: "text" }]));
  assert.equal(windowName({ widthIn: 60, heightIn: 48, type: "Picture", color: "Black/Black", details, values: { Grids: "Yes", Glass: "Low-E" } }), "5040 Picture Black/Black Grids Glass Low-E");
  assert.equal(windowName({ widthIn: 60, heightIn: 48, type: "Picture", color: "Black/Black", details, values: { Grids: "No" } }), "5040 Picture Black/Black", "a no isn't in the name");
  assert.equal(readColor("purple"), "Standard", "anything unknown is Standard");
});

test("a job's list reads safely", () => {
  assert.deepEqual(readJobWindows(null), { lines: [] });
  assert.deepEqual(readJobWindows('{"black":false,"lines":["a","a","b"]}'), { lines: ["a", "b"] });
  assert.deepEqual(readJobWindows("not json"), { lines: [] });
  assert.deepEqual(readWindowDetails('[{"name":"  "},{"name":"Grids","kind":"odd"}]'), [{ name: "Grids", kind: "yesno" }]);
});
