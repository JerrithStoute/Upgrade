/**
 * Reading a builder's vendor list, however it comes: pasted from Excel, a CSV, an export.
 * Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseVendorRows, splitLine, vendorKey } from "./vendors";

const rows = (text: string) => text.split("\n").map(splitLine);

describe("vendor lists", () => {
  it("reads rows pasted from Excel (tabs), picking out emails and phones wherever they are", () => {
    const v = parseVendorRows(rows("Beaumont Lumber\tMike\tmike@beaumontlumber.com\t409-555-0100\nBMC\tbids@bmc.com"));
    assert.deepEqual(v, [
      { name: "Beaumont Lumber", contact: "Mike", email: "mike@beaumontlumber.com", phone: "409-555-0100", notes: null },
      { name: "BMC", contact: null, email: "bids@bmc.com", phone: null, notes: null },
    ]);
  });

  it("uses a heading row when there is one, in any column order", () => {
    const v = parseVendorRows(rows('Email,Phone,Company Name,Contact\nsales@ferguson.com,(512) 555-0199,"Ferguson, Austin",Dana'));
    assert.deepEqual(v, [{ name: "Ferguson, Austin", contact: "Dana", email: "sales@ferguson.com", phone: "(512) 555-0199", notes: null }]);
  });

  it("one vendor listed twice is one vendor, details from both", () => {
    const v = parseVendorRows(rows("McCoy's\tmccoys@example.com\nmccoy's \t512-555-0111"));
    assert.equal(v.length, 1);
    assert.equal(v[0].email, "mccoys@example.com");
    assert.equal(v[0].phone, "512-555-0111");
  });

  it("skips blank lines and rows with no name", () => {
    assert.deepEqual(parseVendorRows(rows("\n\t\nnobody@example.com")), []);
  });

  it("case and spacing don't make a different vendor", () => {
    assert.equal(vendorKey("  BMC   West "), vendorKey("bmc west"));
  });
});
