import { test } from "node:test";
import assert from "node:assert/strict";
import { readJobWindows, readSizeCode, sizeCode } from "./window-list";

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

test("a job's list reads safely", () => {
  assert.deepEqual(readJobWindows(null), { lines: [] });
  assert.deepEqual(readJobWindows('{"black":false,"lines":["a","a","b"]}'), { lines: ["a", "b"] });
  assert.deepEqual(readJobWindows("not json"), { lines: [] });
});
