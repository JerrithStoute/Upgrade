import { test } from "node:test";
import assert from "node:assert/strict";
import { addressLine, buildMime, headerWord } from "./mime";

const unb64 = (s: string) => Buffer.from(s.replace(/\r\n/g, ""), "base64").toString("utf8");

test("headers: plain stays plain, anything else is encoded, nothing can add a line", () => {
  assert.equal(headerWord("Bid for Whitfield"), "Bid for Whitfield");
  assert.match(headerWord("Café bid"), /^=\?UTF-8\?B\?.+\?=$/);
  assert.equal(headerWord("Bid\r\nBcc: someone@x.com"), "Bid Bcc: someone@x.com");
  assert.equal(addressLine({ name: "JT&I Custom Homes", email: "jerrith.jti@gmail.com" }), '"JT&I Custom Homes" <jerrith.jti@gmail.com>');
  assert.equal(addressLine({ email: "a@b.com" }), "a@b.com");
});

test("a message with text, HTML and a file", () => {
  const raw = buildMime(
    {
      from: { name: "JT&I", email: "me@gmail.com" },
      to: "vendor@lumber.com",
      bcc: ["copy@x.com"],
      subject: "Lumber bid — Whitfield",
      text: "Hello — prices please",
      html: "<p>Hello</p>",
      attachments: [{ filename: "Bid 3.xlsx", content: Buffer.from("excel bytes").toString("base64") }],
    },
    "B",
  );
  assert.match(raw, /^From: "JT&I" <me@gmail\.com>\r\nTo: vendor@lumber\.com\r\nBcc: copy@x\.com\r\n/);
  assert.match(raw, /Content-Type: multipart\/mixed; boundary="mix_B"/);
  assert.match(raw, /filename="Bid 3\.xlsx"/);
  const parts = raw.split("--alt_B");
  assert.equal(unb64(parts[1].split("\r\n\r\n")[1]), "Hello — prices please");
  assert.ok(raw.trimEnd().endsWith("--mix_B--"));
});

test("no files: just the two versions", () => {
  const raw = buildMime({ from: { email: "me@gmail.com" }, to: "a@b.com", subject: "Hi", text: "t", html: "<b>h</b>" }, "B");
  assert.match(raw, /Content-Type: multipart\/alternative; boundary="alt_B"/);
  assert.doesNotMatch(raw, /mixed/);
});
