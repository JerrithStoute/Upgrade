import { test } from "node:test";
import assert from "node:assert/strict";
import { standardFromBody } from "./bid-email";

test("your standard message is what's between the greeting and the job — not the bid's own note", () => {
  const body = ["Hello Pat,", "", "Quote by Friday please.", "Prices good 30 days.", "", "Deliver ASAP", "", "Job #1001 — Whitfield", "Deliver to: Austin", "", "Thank you,", "JT&I"].join("\n");
  assert.equal(standardFromBody(body, "Deliver ASAP"), "Quote by Friday please.\nPrices good 30 days.");
  assert.equal(standardFromBody("Just my words.\n\nJob #3 — X", null), "Just my words.", "no greeting");
  assert.equal(standardFromBody("Hi,\nNothing else", null), "Nothing else", "no job line");
});

test("a sub's bid email: the trades and due date, the plans named, nothing attached", async () => {
  const { bidEmail, subBidEmailText } = await import("./bid-email");
  const bid = { number: 7, notes: "Include permit.", dueAt: new Date("2026-11-05T00:00:00Z"), lines: [{ key: "trade:x", name: "15-100 Plumbing", quantity: 1, unit: "ls", codeLabel: "15-100 Plumbing" }] };
  const t = subBidEmailText({ bid, project: { number: 12, name: "Whitfield" }, address: "1 Main", contact: "Pat Smith", from: ["JT&I"], plans: 2 });
  assert.match(t.subject, /Request for bid — 15-100 Plumbing — Job #12 Whitfield \(Bid #7\)/);
  assert.match(t.body, /^Hello Pat,/);
  assert.match(t.body, /Please have it to us by Thursday, November 5\./);
  assert.match(t.body, /Include permit\./);
  const m = bidEmail({ to: "sub@x.com", ...t, companyName: "JT&I", replyTo: "me@x.com", lines: bid.lines, attachments: [], onlineUrl: "https://x/prices/t", plans: ["A1 Floor plan.pdf", "Specs.pdf"], copyTo: "me@x.com" });
  assert.match(m.html, /See the plans and send your bid/);
  assert.match(m.text, /A1 Floor plan\.pdf/);
  assert.equal(m.attachments, undefined);
  assert.equal(m.fromLocal, "bids");
  assert.deepEqual(m.bcc, ["me@x.com"]);
});
