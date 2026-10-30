import { test } from "node:test";
import assert from "node:assert/strict";
import { readJobDoors } from "./door-list";

test("a job's door list reads safely", () => {
  assert.deepEqual(readJobDoors(null), { lines: [] });
  assert.deepEqual(readJobDoors('{"lines":["a","a","b",3]}'), { lines: ["a", "b"] });
  assert.deepEqual(readJobDoors("not json"), { lines: [] });
});
