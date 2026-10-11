import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, stageFromJob, stageLabel, winRate } from "./leads-math";

describe("lead stages from the job", () => {
  it("is being estimated until something's sent", () => {
    assert.equal(stageFromJob("ESTIMATING", ["DRAFT"]), "ESTIMATE");
    assert.equal(stageFromJob("LEAD", []), "ESTIMATE");
  });
  it("is a proposal once an estimate is sent", () => {
    assert.equal(stageFromJob("ESTIMATING", ["DRAFT", "SENT"]), "PROPOSAL");
    assert.equal(stageFromJob("PROPOSAL_SENT", []), "PROPOSAL");
  });
  it("is won once contracted (or later)", () => {
    for (const s of ["CONTRACTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"]) assert.equal(stageFromJob(s, []), "WON");
  });
  it("leaves a cancelled job's lead to you", () => {
    assert.equal(stageFromJob("CANCELLED", ["SENT"]), null);
  });
});

describe("win rate", () => {
  it("is won ÷ decided", () => {
    const r = winRate([{ stage: "WON" }, { stage: "LOST" }, { stage: "LOST" }, { stage: "WON" }, { stage: "INQUIRY" }]);
    assert.deepEqual(r, { won: 2, lost: 2, rate: 0.5 });
  });
  it("is nothing before anything's decided", () => {
    assert.equal(winRate([{ stage: "INQUIRY" }]).rate, null);
  });
});

describe("labels and days", () => {
  it("names stages", () => {
    assert.equal(stageLabel("PROPOSAL"), "Proposal sent");
    assert.equal(stageLabel("LOST"), "Lost");
  });
  it("counts days", () => {
    assert.equal(daysBetween(new Date("2026-10-01T12:00:00"), new Date("2026-10-08T12:00:00")), 7);
  });
});
