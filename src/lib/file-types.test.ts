import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUpload } from "./file-types";

const B = (...parts: (string | number[])[]) => Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))));
const ok = (r: ReturnType<typeof checkUpload>) => ("type" in r ? r.type : null);

test("real files are recognized by their contents", () => {
  assert.equal(ok(checkUpload(B("%PDF-1.7\n…"), "plans.pdf", "plan")), "application/pdf");
  assert.equal(ok(checkUpload(B([0xff, 0xd8, 0xff, 0xe0]), "IMG_1234.JPG", "photo")), "image/jpeg");
  assert.equal(ok(checkUpload(B([0, 0, 0, 24], "ftypheic", [0, 0]), "IMG_1.HEIC", "photo")), "image/heic");
  assert.equal(ok(checkUpload(B("PK", [3, 4], "rest"), "bid.xlsx", "document")), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(ok(checkUpload(B("AC1032", [0, 0]), "site.dwg", "document")), "image/vnd.dwg");
  assert.equal(ok(checkUpload(B("code,name\n01-100,Permits\n"), "codes.csv", "document")), "text/csv");
});

test("disguised and risky files are refused", () => {
  assert.ok("error" in checkUpload(B("MZ", [0x90, 0, 3]), "invoice.pdf", "document")); // a Windows program named .pdf
  assert.ok("error" in checkUpload(B("<html><script>alert(1)</script>"), "page.html", "document"));
  assert.ok("error" in checkUpload(B("<svg onload=alert(1)></svg>"), "logo.svg", "document"));
  assert.ok("error" in checkUpload(B("PK", [3, 4]), "setup.jar", "document")); // a ZIP-shaped program
  assert.ok("error" in checkUpload(B("#!/bin/sh\nrm -rf /\n"), "notes.txt.sh", "document"));
});

test("each place takes only its own kinds", () => {
  assert.ok("error" in checkUpload(B("PK", [3, 4]), "photos.zip", "photo"));
  assert.ok("error" in checkUpload(B("%PDF-1.4"), "log.pdf", "photo"));
  assert.ok("error" in checkUpload(B("PK", [3, 4]), "estimate.xlsx", "plan"));
  assert.match((checkUpload(B("MZ"), "x.exe", "plan") as { error: string }).error, /PDF or a picture/);
});
