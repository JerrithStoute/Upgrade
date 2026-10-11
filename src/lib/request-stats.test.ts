import { test } from "node:test";
import assert from "node:assert/strict";
import { slowLine } from "./request-stats";

test("the speed alarm's log line names the page, its time and its database questions", () => {
  assert.equal(slowLine("GET", "/projects/abc/estimate?_rsc=x1", 812.4, { queries: 41, dbMs: 612.2 }), "[slow] GET /projects/abc/estimate (page change) 812 ms · 41 database questions, 612 ms of database work added up");
  assert.equal(slowLine("POST", "/projects/abc/takeoff/p1", 950, { queries: 1, dbMs: 3 }), "[slow] POST /projects/abc/takeoff/p1 950 ms · 1 database question, 3 ms of database work added up");
});
