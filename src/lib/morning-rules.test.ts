import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPaperworkDay, morningWindow, ymd } from "./morning-rules";
import { fromLine, simpleEmail } from "./mail-layout";

describe("morning email rules", () => {
  it("goes out between 6 and noon only", () => {
    assert.equal(morningWindow(new Date(2026, 9, 13, 5, 59)), false);
    assert.equal(morningWindow(new Date(2026, 9, 13, 6, 0)), true);
    assert.equal(morningWindow(new Date(2026, 9, 13, 11, 59)), true);
    assert.equal(morningWindow(new Date(2026, 9, 13, 21, 0)), false);
    assert.equal(ymd(new Date(2026, 0, 5, 23)), "2026-01-05");
  });

  it("the paperwork email is Mondays", () => {
    assert.equal(isPaperworkDay(new Date(2026, 10, 2, 6)), true);
    assert.equal(isPaperworkDay(new Date(2026, 10, 3, 6)), false);
  });
});

describe("company emails", () => {
  it("puts the company's name on our sending address", () => {
    assert.equal(fromLine(undefined, "The Builder Station <no-reply@x.com>"), "The Builder Station <no-reply@x.com>");
    assert.equal(fromLine("JT&I Custom Homes via The Builder Station", "The Builder Station <no-reply@x.com>"), "JT&I Custom Homes via The Builder Station <no-reply@x.com>");
    assert.equal(fromLine('Evil <a@b.c>\n"', "no-reply@x.com"), "Evil a@b.c <no-reply@x.com>");
    // Bids go from a real-looking address on the same domain, not "no-reply".
    assert.equal(fromLine("JT&I Custom Homes via The Builder Station", "The Builder Station <no-reply@x.com>", "bids"), "JT&I Custom Homes via The Builder Station <bids@x.com>");
    assert.equal(fromLine("JT&I", "no-reply@x.com", "bids <evil>"), "JT&I <no-reply@x.com>", "only a plain first part");
  });

  it("lists sections with links, and escapes what people typed", () => {
    const m = simpleEmail({
      to: "a@b.c",
      subject: "s",
      heading: "Good morning",
      lines: ["Here's today."],
      sections: [{ title: "To-dos", items: [{ text: "Order <cabinets>", note: "Whitfield · due today", url: "https://x/y" }] }],
      brand: "JT&I",
      replyTo: "me@jti.com",
    });
    assert.match(m.html, /Order &lt;cabinets&gt;/);
    assert.match(m.html, /JT&amp;I/);
    assert.match(m.text, /To-dos\n {2}- Order <cabinets> \(Whitfield · due today\)\n {4}https:\/\/x\/y/);
    assert.equal(m.replyTo, "me@jti.com");
  });
});
