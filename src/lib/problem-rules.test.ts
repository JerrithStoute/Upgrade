import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_EVERY_MS, errorKey, isBrowserNoise, isServerProblem, pagePattern, plainMessage, shouldAlert } from "./problem-rules";

test("a page's address leaves out which job it was", () => {
  assert.equal(pagePattern("/projects/cmuojxca70018ith8o59fkxy1/estimate?tab=2"), "/projects/[id]/estimate");
  assert.equal(pagePattern("/invoices/42"), "/invoices/[id]");
  assert.equal(pagePattern("/dashboard"), "/dashboard");
  assert.equal(pagePattern(""), "/");
});

test("the same error on two jobs is one error", () => {
  const a = errorKey("server", 'No line "Framing" on cmuojxca70018ith8o59fkxy1 (row 12)', "/projects/cmuojxca70018ith8o59fkxy1/estimate");
  const b = errorKey("server", 'No line "Roofing" on cmvst7s1m0000it6o6qof38xo (row 3)', "/projects/cmvst7s1m0000it6o6qof38xo/estimate");
  assert.equal(a, b);
  assert.notEqual(a, errorKey("browser", 'No line "Framing" on x (row 12)', "/projects/x/estimate"));
  assert.equal(plainMessage("Took 1500 ms"), "Took # ms");
});

test("a phone losing signal or a browser add-on isn't the program's problem", () => {
  assert.equal(isBrowserNoise("TypeError: Failed to fetch"), true);
  assert.equal(isBrowserNoise("ResizeObserver loop completed with undelivered notifications."), true);
  assert.equal(isBrowserNoise("Script error."), true);
  assert.equal(isBrowserNoise("x is undefined", "at foo (chrome-extension://abc/content.js:1:2)"), true);
  assert.equal(isBrowserNoise("Cannot read properties of undefined (reading 'length')", "at plan-viewer.tsx:12"), false);
});

test("a form's own message isn't a problem; a broken one is", () => {
  assert.equal(isServerProblem({ constructorName: "Error" }, "action"), false);
  assert.equal(isServerProblem({ constructorName: "TypeError" }, "action"), true);
  assert.equal(isServerProblem({ constructorName: "PrismaClientKnownRequestError" }, "action"), true);
  assert.equal(isServerProblem({ constructorName: "Error" }, "render"), true);
});

test("the owner hears about it the first time, when it comes back, and every few hours while it lasts", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  assert.equal(shouldAlert(null, now), true);
  assert.equal(shouldAlert({ alertedAt: new Date(now.getTime() - 60_000), fixedAt: null }, now), false);
  assert.equal(shouldAlert({ alertedAt: new Date(now.getTime() - ALERT_EVERY_MS), fixedAt: null }, now), true);
  assert.equal(shouldAlert({ alertedAt: new Date(now.getTime() - 60_000), fixedAt: new Date(now.getTime() - 30_000) }, now), true);
});
