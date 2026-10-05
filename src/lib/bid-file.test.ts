/**
 * The bid file round trip: the workbook we send, a vendor typing prices into it (and
 * shuffling it about), and reading it back. Run with `npm test`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { bidLineFor, bidWorkbook, parsePrice, readBidWorkbook } from "./bid-file";

const bid = {
  id: "bid_123",
  number: 2,
  vendorName: "Beaumont Lumber",
  sentAt: new Date("2026-10-05T12:00:00Z"),
  afterLock: false,
  lines: [
    { id: "line_a", codeKey: "c1", codeLabel: "06-100 Framing", name: "2x6 × 16'", sku: null, unit: "ea", quantity: 40, unitPrice: null },
    { id: "line_b", codeKey: "c1", codeLabel: "06-100 Framing", name: "2x6 × 20'", sku: "26-20", unit: "ea", quantity: 12, unitPrice: null },
    { id: "line_c", codeKey: "none", codeLabel: "No cost code", name: "Tech Shield", sku: null, unit: "ea", quantity: 30, unitPrice: null },
  ],
};
const project = { number: 1001, name: "Whitfield Kitchen", address: "418 Barton Creek Blvd", city: "Austin", state: "TX" };
const company = { name: "JT&I Custom Homes", address: "PO Box 8004", city: "Lumberton", state: "TX", zip: "77657", phone: null, email: null };

/** Fills prices the way a vendor would: finds each item by name, wherever it ended up. */
async function vendorFills(data: Buffer, prices: Record<string, number | string>, extra?: (ws: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Bid")!;
  ws.eachRow((row) => {
    const name = String(row.getCell(2).value ?? "");
    if (name in prices) row.getCell(6).value = prices[name];
  });
  extra?.(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("bid file", () => {
  it("reads back the bid and every price the vendor typed", async () => {
    const sent = await bidWorkbook(bid, project, company);
    const back = await vendorFills(sent, { "2x6 × 16'": 9.54, "2x6 × 20'": "$10.36" });
    const read = await readBidWorkbook(back);
    assert.equal(read.bidId, "bid_123");
    assert.deepEqual(
      read.lines.map((l) => [l.lineId, l.unitPrice]),
      [
        ["line_a", 9.54],
        ["line_b", 10.36],
        ["line_c", null],
      ],
    );
  });

  it("keeps substitutes and notes, and doesn't care if the vendor renames an item", async () => {
    const sent = await bidWorkbook(bid, project, company);
    const back = await vendorFills(sent, { "Tech Shield": 31.5 }, (ws) =>
      ws.eachRow((row) => {
        if (row.getCell(2).value === "Tech Shield") {
          row.getCell(2).value = "LP TechShield 7/16";
          row.getCell(8).value = "LP 7/16 radiant barrier";
          row.getCell(9).value = "2 week lead";
        }
      }),
    );
    const line = (await readBidWorkbook(back)).lines.find((l) => l.lineId === "line_c")!;
    assert.equal(line.unitPrice, 31.5);
    assert.equal(line.substitute, "LP 7/16 radiant barrier");
    assert.equal(line.note, "2 week lead");
  });

  it("the price list (other lengths, no quantity) comes back too, outside the totals", async () => {
    const withLadder = {
      ...bid,
      lines: [
        ...bid.lines,
        { id: "lad_18", key: "ladder:2x6 × 18'", codeKey: "c1", codeLabel: "06-100 Framing", name: "2x6 × 18'", sku: null, unit: "ea", quantity: 0, unitPrice: null },
      ],
    };
    const sent = await bidWorkbook(withLadder, project, company);
    const back = await vendorFills(sent, { "2x6 × 16'": 9.5, "2x6 × 18'": 10.25 });
    const read = await readBidWorkbook(back);
    assert.equal(read.lines.find((l) => l.lineId === "lad_18")?.unitPrice, 10.25);
    // The grand total adds the cost-code totals only — the price list isn't in it.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(back as unknown as ArrayBuffer);
    let grand = "";
    wb.getWorksheet("Bid")!.eachRow((row) => {
      if (row.getCell(2).value === "Total") grand = String((row.getCell(7).value as { formula: string }).formula);
    });
    assert.ok(grand && !grand.includes(":"), `grand total is ${grand}`);
  });

  it("a length the job switched to is priced from the bid's price list", () => {
    const lines = [
      { key: "item_16", name: "2x6 × 16'", unitPrice: 9.5 },
      { key: "ladder:2x6 × 18'", name: "2x6 × 18'", unitPrice: 10.25 },
      { key: "ladder:2x6 × 20'", name: "2x6 × 20'", unitPrice: null },
    ];
    assert.equal(bidLineFor(lines, { key: "item_16", name: "2x6 × 16'" })?.unitPrice, 9.5);
    assert.equal(bidLineFor(lines, { key: "item_18_new", name: "2x6 × 18'" })?.unitPrice, 10.25);
    assert.equal(bidLineFor(lines, { key: "item_20_new", name: "2x6 × 20'" }), null);
  });

  it("says so when the file isn't a workbook", async () => {
    await assert.rejects(readBidWorkbook(Buffer.from("not a spreadsheet")), /isn't an Excel workbook/);
  });

  it("reads prices however they were typed", () => {
    assert.equal(parsePrice("$1,234.50"), 1234.5);
    assert.equal(parsePrice(" 12 "), 12);
    assert.equal(parsePrice(""), null);
    assert.equal(parsePrice("call"), null);
    assert.equal(parsePrice(-3), null);
  });
});
