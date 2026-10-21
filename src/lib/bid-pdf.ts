import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { isLadderLine } from "./bids";

/**
 * A bid as a PDF to print and fill in by hand (sent with the bid's email, next to the Excel file): who
 * it's from, the job and where it goes, then every item with blank Unit price and Total boxes to write
 * in — and, for lumber, the other lengths to price per board. Like the Print page, made on the server.
 */

type Line = { key: string; name: string; quantity: number; unit: string; codeLabel: string };

const PAGE = { w: 612, h: 792 }; // US letter
const M = 40;
const INK = rgb(0.06, 0.09, 0.16);
const GRAY = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.8, 0.83, 0.87);

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** Text the PDF's built-in fonts can draw: look-alikes for marks they don't have, "?" for the rest. */
function drawable(font: PDFFont, s: string) {
  const swapped = s
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/⅛/g, "1/8")
    .replace(/⅜/g, "3/8")
    .replace(/⅝/g, "5/8")
    .replace(/⅞/g, "7/8")
    .replace(/[\r\n\t]+/g, " ");
  let out = "";
  for (const ch of swapped) {
    try {
      font.widthOfTextAtSize(ch, 10);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** `s` cut to fit `width` (with "…"). */
function fit(font: PDFFont, s: string, size: number, width: number) {
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}

export async function bidPdf(o: {
  bid: { number: number; vendorName: string; notes: string | null; lines: Line[] };
  project: { number: number; name: string };
  address: string;
  from: string[];
  date: string;
  replyTo: string | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Bid ${o.bid.number} - ${o.bid.vendorName} - Job ${o.project.number}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;

  const text = (s: string, x: number, at: number, size = 10, f = font, color = INK) => page.drawText(drawable(f, s), { x, y: at, size, font: f, color });
  const right = (s: string, xRight: number, at: number, size = 10, f = font) => {
    const t = drawable(f, s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: at, size, font: f, color: INK });
  };
  const rule = (at: number, x1 = M, x2 = PAGE.w - M, color = RULE) => page.drawLine({ start: { x: x1, y: at }, end: { x: x2, y: at }, thickness: 0.6, color });

  // Columns: Qty | Unit | Item | Unit price | Total
  const col = { qty: M + 40, unit: M + 50, item: M + 92, price: PAGE.w - M - 150, total: PAGE.w - M - 72 };
  const itemWidth = col.price - col.item - 10;
  const ROW = 21;

  const tableHead = (title: string, perBoard = false) => {
    text(title, M, y, 11, bold);
    y -= 16;
    page.drawRectangle({ x: M, y: y - 5, width: PAGE.w - 2 * M, height: 17, color: rgb(0.95, 0.96, 0.97) });
    if (!perBoard) {
      right("Qty", col.qty, y, 9, bold);
      text("Unit", col.unit, y, 9, bold);
    }
    text("Item", perBoard ? M + 4 : col.item, y, 9, bold);
    text(perBoard ? "Price per board" : "Unit price", col.price, y, 9, bold);
    if (!perBoard) text("Total", col.total, y, 9, bold);
    y -= ROW;
  };
  const newPage = (title: string, perBoard: boolean) => {
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
    text(`Bid #${o.bid.number} — Job #${o.project.number} ${o.project.name} (continued)`, M, y, 9, font, GRAY);
    y -= 22;
    tableHead(title, perBoard);
  };

  // From, and what this is.
  o.from.forEach((l, i) => {
    text(l, M, y, i === 0 ? 13 : 9.5, i === 0 ? bold : font, i === 0 ? INK : GRAY);
    y -= i === 0 ? 16 : 12;
  });
  y -= 10;
  text("Request for prices", M, y, 18, bold);
  right(`Bid #${o.bid.number}`, PAGE.w - M, y + 2, 12, bold);
  y -= 20;
  text(`To: ${o.bid.vendorName}`, M, y, 10.5);
  right(o.date, PAGE.w - M, y, 10);
  y -= 15;
  text(`Job #${o.project.number} — ${o.project.name}`, M, y, 10.5);
  y -= 15;
  if (o.address) {
    text(`Deliver to: ${o.address}`, M, y, 10.5);
    y -= 15;
  }
  if (o.bid.notes) {
    text(`Note: ${fit(font, drawable(font, o.bid.notes), 10, PAGE.w - 2 * M - 30)}`, M, y, 10);
    y -= 15;
  }
  y -= 10;

  const items = o.bid.lines.filter((l) => !isLadderLine(l));
  const ladder = o.bid.lines.filter((l) => isLadderLine(l));
  const BOTTOM = M + 30;

  tableHead(`Items (${items.length})`);
  for (const l of items) {
    if (y < BOTTOM) newPage("Items", false);
    right(qty(l.quantity), col.qty, y);
    text(l.unit, col.unit, y, 10, font, GRAY);
    text(fit(font, drawable(font, l.name), 10, itemWidth), col.item, y);
    // Lines to write the prices on.
    rule(y - 3, col.price, col.price + 64, GRAY);
    rule(y - 3, col.total, PAGE.w - M, GRAY);
    y -= ROW;
  }
  if (y < BOTTOM + 24) newPage("Items", false);
  text("Total", col.price, y, 10, bold);
  rule(y - 3, col.total, PAGE.w - M, INK);
  y -= ROW + 6;

  if (ladder.length) {
    if (y < BOTTOM + 60) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M;
    }
    text("Other lengths — just a price per board, so we can order the lengths that cost least.", M, y, 9.5, font, GRAY);
    y -= 16;
    tableHead("Price list", true);
    for (const l of ladder) {
      if (y < BOTTOM) newPage("Price list", true);
      text(fit(font, drawable(font, l.name), 10, col.price - M - 14), M + 4, y);
      rule(y - 3, col.price, col.price + 64, GRAY);
      y -= ROW;
    }
    y -= 6;
  }

  // Who quoted it.
  if (y < BOTTOM + 70) {
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
  }
  y -= 8;
  for (const label of ["Quoted by", "Phone", "Prices good through"]) {
    text(label, M, y, 10);
    rule(y - 3, M + 110, M + 330, GRAY);
    y -= 24;
  }
  text(`Send it back${o.replyTo ? ` to ${o.replyTo}` : ""} — a photo or scan is fine.`, M, y, 10, font, GRAY);

  // Page numbers.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: PAGE.w - M - font.widthOfTextAtSize(t, 8), y: M - 14, size: 8, font, color: GRAY });
  });
  return doc.save();
}
