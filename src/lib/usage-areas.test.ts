import { test } from "node:test";
import assert from "node:assert/strict";
import { areaOf } from "./usage-areas";

test("a job's tabs are their own areas; the job itself is Jobs", () => {
  assert.equal(areaOf("/projects/cmuojxca70018ith8o59fkxy1/takeoff/cmabc123"), "Takeoff");
  assert.equal(areaOf("/projects/cmuojxca70018ith8o59fkxy1/estimate?v=2"), "Estimates");
  assert.equal(areaOf("/projects/cmuojxca70018ith8o59fkxy1/change-orders/new"), "Change orders");
  assert.equal(areaOf("/projects/cmuojxca70018ith8o59fkxy1"), "Jobs");
  assert.equal(areaOf("/projects/cmuojxca70018ith8o59fkxy1/edit"), "Jobs");
  assert.equal(areaOf("/projects"), "Jobs");
});

test("the program's pages, and the portals", () => {
  assert.equal(areaOf("/dashboard"), "Dashboard");
  assert.equal(areaOf("/settings/cost-codes"), "Settings");
  assert.equal(areaOf("/time/sheets"), "Time clock");
  assert.equal(areaOf("/portal/selections"), "Client portal");
  assert.equal(areaOf("/vendor"), "Sub portal");
});

test("pages that aren't part of using the program aren't counted", () => {
  assert.equal(areaOf("/"), null);
  assert.equal(areaOf("/login/jti"), null);
  assert.equal(areaOf("/station/builders"), null);
  assert.equal(areaOf("/account"), null);
});
