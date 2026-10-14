import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_ACCESS, NO_ACCESS, STAFF_ACCESS, STARTER_POSITIONS, accessFromForm, allows, areaForPath, diffAccess, navPages, positionAccess, resolveAccess, savedAccess, summarizeAccess } from "./access";

const pm = STARTER_POSITIONS.find((p) => p.key === "PM")!.access;

describe("positions", () => {
  it("admins get everything, whatever is saved", () => {
    assert.deepEqual(resolveAccess("ADMIN", JSON.stringify({ ...pm, budget: 0 }), JSON.stringify({ reports: 0 })), ADMIN_ACCESS);
  });

  it("Staff is what staff could do before positions: every job area, no reports, settings or other people's time", () => {
    assert.deepEqual(resolveAccess("STAFF", null, null), STAFF_ACCESS);
    assert.equal(STAFF_ACCESS.estimates, 2);
    assert.equal(STAFF_ACCESS.invoices, 2);
    assert.equal(STAFF_ACCESS.reports, 0);
    assert.equal(STAFF_ACCESS.time, 0);
    assert.equal(STAFF_ACCESS.lists, 0);
    assert.equal(STAFF_ACCESS.jobs, "ALL");
  });

  it("a person's own changes go on top of their position", () => {
    const a = resolveAccess("STAFF", JSON.stringify(pm), JSON.stringify({ invoices: 0, approveBills: true }));
    assert.equal(a.invoices, 0);
    assert.equal(a.approveBills, true);
    assert.equal(a.estimates, pm.estimates);
    assert.equal(a.jobs, "MINE");
  });

  it("only what differs from the position is saved for a person", () => {
    assert.deepEqual(diffAccess(pm, pm), {});
    assert.deepEqual(diffAccess(pm, { ...pm, reports: 1, jobs: "ALL" }), { reports: 1, jobs: "ALL" });
  });

  it("the old four permissions read as a person's changes", () => {
    const a = resolveAccess("STAFF", null, JSON.stringify({ reports: 1, time: 2, delay: true, approveBills: true }));
    assert.deepEqual([a.reports, a.time, a.delay, a.approveBills], [1, 2, true, true]);
  });

  it("anything unreadable is ignored, not trusted", () => {
    assert.deepEqual(positionAccess("not json"), STAFF_ACCESS);
    assert.deepEqual(resolveAccess("STAFF", null, JSON.stringify({ reports: 7, jobs: "SOME", hacker: 2 })), STAFF_ACCESS);
  });

  it("reads the grid from a form", () => {
    const form: Record<string, string> = { area_leads: "2", area_reports: "1", jobs: "MINE", delay: "on" };
    const a = accessFromForm((k) => form[k] ?? null);
    assert.equal(a.leads, 2);
    assert.equal(a.reports, 1);
    assert.equal(a.budget, 0);
    assert.equal(a.jobs, "MINE");
    assert.equal(a.delay, true);
    assert.equal(a.approveBills, false);
  });
});

describe("which area a page is in", () => {
  it("a job's tabs and the main pages", () => {
    assert.equal(areaForPath("/projects/abc/estimate"), "estimates");
    assert.equal(areaForPath("/projects/abc/estimate/x/proposal"), "estimates");
    assert.equal(areaForPath("/projects/abc/takeoff/p1"), "takeoffs");
    assert.equal(areaForPath("/projects/abc/change-orders/c1"), "selections");
    assert.equal(areaForPath("/projects/abc/todos"), "field");
    assert.equal(areaForPath("/bills"), "purchasing");
    assert.equal(areaForPath("/clients/1"), "leads");
    assert.equal(areaForPath("/reports/wip"), "reports");
  });

  it("everyone's pages: the dashboard, the job list and overview, their own to-dos and time clock", () => {
    for (const p of ["/dashboard", "/projects", "/projects/abc", "/projects/abc/edit", "/projects/new", "/todos", "/time", "/account"]) assert.equal(areaForPath(p), null, p);
  });

  it("Settings: lists and QuickBooks can be given out; company, team and billing stay admin-only", () => {
    assert.equal(areaForPath("/settings/items"), "lists");
    assert.equal(areaForPath("/settings/cost-codes"), "lists");
    assert.equal(areaForPath("/settings/quickbooks"), "quickbooks");
    assert.equal(areaForPath("/settings/team"), null);
    assert.equal(areaForPath("/settings"), null);
  });

  it("the menu shows what the position shows", () => {
    const est = STARTER_POSITIONS.find((p) => p.key === "ESTIMATOR")!.access;
    const pages = ["/dashboard", "/leads", "/invoices", "/reports", "/settings", "/time"];
    assert.deepEqual(navPages("STAFF", est, pages), ["/dashboard", "/leads", "/settings", "/time"]);
    assert.deepEqual(navPages("STAFF", STAFF_ACCESS, pages), ["/dashboard", "/leads", "/invoices", "/time"]);
    assert.deepEqual(navPages("ADMIN", ADMIN_ACCESS, pages), pages);
  });

  it("clients and vendors have nothing inside the program", () => {
    assert.equal(allows(NO_ACCESS, "estimates", 1), false);
    assert.equal(allows(NO_ACCESS, null, 1), true); // pages for everyone still check the role first (requireStaff)
  });
});

describe("costs and profit", () => {
  it("everyone saw them before positions, and positions saved without the switch still do", () => {
    assert.equal(STAFF_ACCESS.costs, true);
    assert.equal(positionAccess(JSON.stringify({ leads: 2 })).costs, true);
  });

  it("off hides the areas that are mostly costs, whatever they're set to — the grid keeps what was set", () => {
    const pm = JSON.stringify(STARTER_POSITIONS.find((p) => p.key === "PM")!.access);
    const a = resolveAccess("STAFF", pm, JSON.stringify({ costs: false }));
    assert.deepEqual([a.takeoffs, a.budget, a.purchasing, a.reports, a.lists], [0, 0, 0, 0, 0]);
    assert.equal(a.estimates, 2); // estimates open as the proposal (the page sends them there)
    assert.equal(a.selections, 2);
    assert.equal(savedAccess(pm, JSON.stringify({ costs: false })).budget, 2);
  });

  it("Field crew: the schedule, logs and to-dos, files to look at — no money", () => {
    const f = resolveAccess("STAFF", JSON.stringify(STARTER_POSITIONS.find((p) => p.key === "FIELD")!.access), null);
    assert.equal(f.field, 2);
    assert.equal(f.files, 1);
    assert.equal(f.costs, false);
    assert.equal(f.invoices, 0);
    assert.equal(summarizeAccess(f), "Edits: Schedule & logs · Views: Files · Every job · No costs or profit");
  });

  it("a position in a line", () => {
    assert.equal(summarizeAccess(STAFF_ACCESS), "Edits: Leads, Estimates, Takeoffs, Selections & COs, Schedule & logs, Files, Purchasing, Budget, Invoices · Every job");
    assert.equal(summarizeAccess(NO_ACCESS), "Only their own time clock and to-dos · Only their jobs · No costs or profit");
    assert.match(summarizeAccess(ADMIN_ACCESS), /Can delay · Approves bills$/);
  });
});
