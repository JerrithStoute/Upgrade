import ExcelJS from "exceljs";
import { companyLines } from "./company";
import { fmtDate } from "./utils";
import { itemNameKey } from "./takeoff";

/**
 * The bid file a vendor fills in: an Excel workbook (bidWorkbook) and reading it back
 * (readBidWorkbook). No database here — bids.ts does that.
 */

const META_SHEET = "_upgrade";
const COLS = { code: 1, item: 2, sku: 3, qty: 4, unit: 5, price: 6, total: 7, substitute: 8, note: 9, id: 10 } as const;

type BidForFile = {
  id: string;
  number: number;
  vendorName: string;
  sentAt: Date;
  afterLock: boolean;
  notes?: string | null;
  /** `key` "ladder:…" = a price list line (another length, no quantity). */
  lines: { id: string; key?: string; codeKey: string; codeLabel: string; name: string; sku: string | null; unit: string; quantity: number; unitPrice: number | null }[];
};

/**
 * The bid as an Excel workbook: your company and the job at the top, the items grouped by
 * cost code with totals that add themselves up. Only Unit price, Substitute and Notes can be
 * typed in (the sheet is protected, no password). A hidden column holds each line's id and a
 * hidden sheet the bid's, so the returned file finds its way back whatever the vendor renames.
 */
export async function bidWorkbook(
  bid: BidForFile,
  project: { number: number; name: string; address: string | null; city: string | null; state: string | null },
  company: Parameters<typeof companyLines>[0],
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = company?.name ?? "Upgrade";
  wb.created = new Date();
  const ws = wb.addWorksheet("Bid", { views: [{ state: "frozen", ySplit: 9 }], pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [
    { key: "code", width: 22 },
    { key: "item", width: 42 },
    { key: "sku", width: 14 },
    { key: "qty", width: 9 },
    { key: "unit", width: 7 },
    { key: "price", width: 13 },
    { key: "total", width: 14 },
    { key: "substitute", width: 24 },
    { key: "note", width: 30 },
    { key: "id", width: 4, hidden: true },
  ];
  const lines = companyLines(company);
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  ws.getCell("A1").value = `${lines[0] ?? "Request for prices"} — Request for prices`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = lines.slice(1).join(" · ");
  ws.getCell("A3").value = `To: ${bid.vendorName}`;
  ws.getCell("A3").font = { bold: true };
  ws.getCell("A4").value = `Job #${project.number} — ${project.name}${address ? ` · Deliver to: ${address}` : ""}`;
  ws.getCell("A5").value = `Bid #${bid.number}${bid.afterLock ? " (re-bid)" : ""} · Sent ${fmtDate(bid.sentAt)}`;
  if (bid.notes) {
    ws.getCell("A6").value = bid.notes;
    ws.getCell("A6").font = { bold: true };
  }
  ws.getCell("A7").value =
    "Fill in your price per unit in the yellow column, then save this file and send it back. (Total fills itself in. Quoting a different product? Note it under Substitute.)";
  ws.getCell("A7").font = { italic: true, color: { argb: "FF475569" } };

  const head = ws.getRow(9);
  head.values = ["Cost code", "Item", "SKU", "Qty", "Unit", "Unit price", "Total", "Substitute / your SKU", "Notes", "Line ID"];
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    c.border = { bottom: { style: "thin" } };
  });

  const money = '"$"#,##0.00';
  let r = 10;
  const subtotalRows: number[] = [];
  const isLadder = (l: { key?: string }) => !!l.key?.startsWith("ladder:");
  const ordered = bid.lines.filter((l) => !isLadder(l));
  const ladder = bid.lines.filter(isLadder);
  const codes = Array.from(new Map(ordered.map((l) => [l.codeKey, l.codeLabel])).entries());
  const priceCell = (row: ExcelJS.Row, value: number | null) => {
    const price = row.getCell(COLS.price);
    price.value = value;
    price.numFmt = money;
    price.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
    price.protection = { locked: false };
    for (const k of [COLS.substitute, COLS.note]) row.getCell(k).protection = { locked: false };
  };
  for (const [codeKey, codeLabel] of codes) {
    const groupRow = ws.getRow(r++);
    groupRow.getCell(COLS.code).value = codeLabel;
    groupRow.font = { bold: true };
    const first = r;
    for (const l of ordered.filter((x) => x.codeKey === codeKey)) {
      const row = ws.getRow(r);
      row.getCell(COLS.code).value = codeLabel;
      row.getCell(COLS.code).font = { color: { argb: "FF94A3B8" } };
      row.getCell(COLS.item).value = l.name;
      row.getCell(COLS.sku).value = l.sku ?? "";
      row.getCell(COLS.qty).value = l.quantity;
      row.getCell(COLS.unit).value = l.unit;
      priceCell(row, l.unitPrice ?? null);
      const total = row.getCell(COLS.total);
      total.value = { formula: `IF(ISNUMBER(F${r}),D${r}*F${r},"")` };
      total.numFmt = money;
      row.getCell(COLS.id).value = l.id;
      r++;
    }
    const sub = ws.getRow(r);
    sub.getCell(COLS.item).value = `Total — ${codeLabel}`;
    sub.getCell(COLS.total).value = { formula: `SUM(G${first}:G${r - 1})` };
    sub.getCell(COLS.total).numFmt = money;
    sub.font = { bold: true };
    subtotalRows.push(r);
    r += 2;
  }
  const grand = ws.getRow(r);
  grand.getCell(COLS.item).value = "Total";
  grand.getCell(COLS.total).value = { formula: subtotalRows.length ? subtotalRows.map((n) => `G${n}`).join("+") : "0" };
  grand.getCell(COLS.total).numFmt = money;
  grand.font = { bold: true, size: 12 };

  // The price list: other lengths of the lumber, one price per board — so the cheapest
  // way to cut the job can be worked out with real prices. Not in the totals.
  if (ladder.length) {
    r += 3;
    const head2 = ws.getRow(r++);
    head2.getCell(COLS.code).value = "Price list — other lengths";
    head2.getCell(COLS.item).value = "No quantity — just your price per board, so we can order the lengths that cost least.";
    head2.font = { bold: true };
    head2.getCell(COLS.item).font = { italic: true, color: { argb: "FF475569" } };
    for (const l of ladder) {
      const row = ws.getRow(r++);
      row.getCell(COLS.code).value = l.codeLabel;
      row.getCell(COLS.code).font = { color: { argb: "FF94A3B8" } };
      row.getCell(COLS.item).value = l.name;
      row.getCell(COLS.unit).value = l.unit;
      priceCell(row, l.unitPrice ?? null);
      row.getCell(COLS.id).value = l.id;
    }
  }
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true });

  const meta = wb.addWorksheet(META_SHEET, { state: "veryHidden" });
  meta.getCell("A1").value = "bid";
  meta.getCell("B1").value = bid.id;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A cell's text, whatever Excel stored (rich text, a formula's result, a hyperlink…). */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
  }
  return "";
}

/** "$1,234.50", "1234.5", 1234.5 → 1234.5; blank or not a price → null. */
export function parsePrice(v: ExcelJS.CellValue | string): number | null {
  const t = (typeof v === "string" ? v : cellText(v)).replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : null;
}

export type ReturnedLine = { lineId: string; unitPrice: number | null; substitute: string | null; note: string | null };

/** Reads a returned bid workbook: the bid it belongs to (if the hidden sheet survived) and each line's price. */
export async function readBidWorkbook(data: Buffer): Promise<{ bidId: string | null; lines: ReturnedLine[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw new Error("That file isn't an Excel workbook (.xlsx). Ask the vendor to send back the file you sent them.");
  }
  const meta = wb.getWorksheet(META_SHEET);
  const bidId = meta && cellText(meta.getCell("A1").value) === "bid" ? cellText(meta.getCell("B1").value) || null : null;
  const ws = wb.getWorksheet("Bid") ?? wb.worksheets.find((w) => w.name !== META_SHEET);
  if (!ws) throw new Error("The file has no bid sheet.");
  const lines: ReturnedLine[] = [];
  ws.eachRow((row) => {
    const lineId = cellText(row.getCell(COLS.id).value).trim();
    if (!lineId || lineId === "Line ID") return;
    const sub = cellText(row.getCell(COLS.substitute).value).trim();
    const note = cellText(row.getCell(COLS.note).value).trim();
    lines.push({ lineId, unitPrice: parsePrice(row.getCell(COLS.price).value), substitute: sub || null, note: note || null });
  });
  return { bidId, lines };
}

/**
 * A bid's priced line for an item on the Material list now: the line sent for it, or — when
 * the job has changed lengths since — the bid's price list line of the same name
 * (a "2x6 × 18'" priced on the price ladder).
 */
export function bidLineFor<T extends { key: string; name: string; unitPrice: number | null }>(bidLines: T[], line: { key: string; name: string }) {
  const same = bidLines.find((bl) => bl.key === line.key && bl.unitPrice != null);
  if (same) return same;
  const k = itemNameKey(line.name);
  return bidLines.find((bl) => bl.unitPrice != null && itemNameKey(bl.name) === k) ?? null;
}
