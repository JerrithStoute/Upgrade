import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { isLadderLine } from "./bid-ladder";
import { asSent } from "./bid-beams";

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
export function drawable(font: PDFFont, s: string) {
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
export function fit(font: PDFFont, s: string, size: number, width: number) {
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * A record of what a vendor or sub typed online — kept in the job's Files → Bids like a quote they emailed:
 * who, when, each line with their price (and anything they offered instead, or said is or isn't included),
 * the total and their note.
 */
export async function bidRecordPdf(o: {
  bid: { number: number; vendorName: string; kind: string; lines: (Line & { unitPrice: number | null; substitute: string | null; note: string | null })[] };
  project: { number: number; name: string };
  from: string[];
  at: string;
  message: string | null;
  quoteFile: string | null;
}): Promise<Uint8Array> {
  const sub = o.bid.kind === "SUB";
  const doc = await PDFDocument.create();
  doc.setTitle(`Bid ${o.bid.number} - ${o.bid.vendorName} - typed online`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;
  const BOTTOM = M + 30;
  const text = (s: string, x: number, at: number, size = 10, f = font, color = INK) => page.drawText(drawable(f, s), { x, y: at, size, font: f, color });
  const right = (s: string, xRight: number, at: number, size = 10, f = font) => {
    const t = drawable(f, s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: at, size, font: f, color: INK });
  };
  const room = (need: number) => {
    if (y - need >= BOTTOM) return;
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
  };
  /** Long text in lines that fit. */
  const wrap = (s: string, size: number, width: number) => {
    const out: string[] = [];
    for (const para of drawable(font, s).split(/ {2,}|\n/)) {
      let line = "";
      for (const w of para.split(" ")) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = w;
        } else line = next;
      }
      if (line) out.push(line);
    }
    return out;
  };
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  o.from.forEach((l, i) => {
    text(l, M, y, i === 0 ? 13 : 9.5, i === 0 ? bold : font, i === 0 ? INK : GRAY);
    y -= i === 0 ? 16 : 12;
  });
  y -= 10;
  text(sub ? `Bid from ${o.bid.vendorName}` : `Prices from ${o.bid.vendorName}`, M, y, 18, bold);
  right(`Bid #${o.bid.number}`, PAGE.w - M, y + 2, 12, bold);
  y -= 20;
  text(`Job #${o.project.number} — ${o.project.name}`, M, y, 10.5);
  y -= 15;
  text(`Typed online by ${o.bid.vendorName} on ${o.at}`, M, y, 10, font, GRAY);
  y -= 24;

  const col = { qty: M + 40, unit: M + 50, item: M + 92, price: PAGE.w - M - 150, total: PAGE.w - M };
  const itemX = sub ? M + 4 : col.item;
  const itemWidth = col.price - itemX - 10;
  page.drawRectangle({ x: M, y: y - 5, width: PAGE.w - 2 * M, height: 17, color: rgb(0.95, 0.96, 0.97) });
  if (!sub) {
    right("Qty", col.qty, y, 9, bold);
    text("Unit", col.unit, y, 9, bold);
  }
  text(sub ? "Trade" : "Item", itemX, y, 9, bold);
  text(sub ? "" : "Unit price", col.price, y, 9, bold);
  right(sub ? "Price" : "Total", col.total, y, 9, bold);
  y -= 21;
  let total = 0;
  for (const l of o.bid.lines) {
    const sent = asSent(l);
    const extra = [sent.len && l.unitPrice != null ? `${money(l.unitPrice)}/lf` : "", l.substitute ? `Instead: ${l.substitute}` : "", l.note ?? ""]
      .filter(Boolean)
      .join(" · ");
    const notes = extra ? wrap(extra, 8.5, itemWidth) : [];
    room(21 + notes.length * 11);
    if (!sub && !isLadderLine(l)) {
      right(qty(sent.quantity), col.qty, y);
      text(sent.unit, col.unit, y, 10, font, GRAY);
    }
    text(fit(font, drawable(font, l.name), 10, itemWidth), itemX, y);
    if (l.unitPrice != null) {
      if (!sub) right(money(sent.unitPrice ?? l.unitPrice), col.price + 64, y);
      if (!isLadderLine(l)) {
        right(money(l.unitPrice * l.quantity), col.total, y);
        total += l.unitPrice * l.quantity;
      }
    } else right("—", col.total, y, 10, font);
    for (const n of notes) {
      y -= 11;
      text(n, itemX, y, 8.5, font, GRAY);
    }
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: PAGE.w - M, y: y - 6 }, thickness: 0.4, color: RULE });
    y -= 21;
  }
  room(30);
  text("Total", col.price, y, 11, bold);
  right(money(total), col.total, y, 11, bold);
  y -= 28;
  if (o.message) {
    const lines = wrap(o.message, 10, PAGE.w - 2 * M);
    room(16 + lines.length * 13);
    text("Their note", M, y, 10, bold);
    y -= 14;
    for (const l of lines) {
      text(l, M, y, 10);
      y -= 13;
    }
    y -= 8;
  }
  if (o.quoteFile) {
    room(14);
    text(`They attached their own quote too: ${o.quoteFile} (in Files → Bids).`, M, y, 9.5, font, GRAY);
  }
  return doc.save();
}

/** What the bid's PDF is drawn from (bid-pdf-input.ts gathers it). */
export type BidPdfInput = {
  bid: { number: number; vendorName: string; notes: string | null; kind?: string; lines: Line[] };
  project: { number: number; name: string };
  company: { name: string; lines: string[]; footer: string };
  vendorLines: string[];
  site: string;
  sent: string;
  due: string | null;
  replyTo: string | null;
  /** The document color (#rrggbb). */
  accent: string;
  logo: { bytes: Uint8Array; png: boolean } | null;
};

const UNIT_WORDS: Record<string, string> = {
  ea: "each",
  lf: "per lf",
  sf: "per sf",
  sy: "per sy",
  cy: "per cy",
  bf: "per bf",
  hr: "per hour",
  day: "per day",
  sq: "per square",
  ls: "lump sum",
  gal: "per gal",
  lb: "per lb",
  ton: "per ton",
};

const hexRgb = (hex: string) => {
  const n = parseInt(/^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "334155", 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * A bid as a PDF to print and fill in by hand (sent with the bid's email, next to the Excel file), in the
 * same look as its Print page and your other documents: your logo, the request's number, sent and needed-by
 * dates; From, To and Job; your note; the items under shaded cost-code bands with a blank for their price
 * and one for a substitute (a sub's bid: a blank per trade); the other lengths to price per board; and
 * "Your quote" — how long the prices are good and who quoted.
 */
export async function bidPdf(o: BidPdfInput): Promise<Uint8Array> {
  const sub = o.bid.kind === "SUB";
  const doc = await PDFDocument.create();
  doc.setTitle(`Bid ${o.bid.number} - ${o.bid.vendorName} - Job ${o.project.number}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const accent = hexRgb(o.accent);
  const tint = rgb(0.96, 0.965, 0.97);
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (o.logo) {
    try {
      logo = o.logo.png ? await doc.embedPng(o.logo.bytes) : await doc.embedJpg(o.logo.bytes);
    } catch {
      logo = null;
    }
  }
  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;
  const BOTTOM = M + 34;
  const W = PAGE.w - 2 * M;

  const text = (s: string, x: number, at: number, size = 10, f = font, color = INK) => page.drawText(drawable(f, s), { x, y: at, size, font: f, color });
  const right = (s: string, xRight: number, at: number, size = 10, f = font, color = INK) => {
    const t = drawable(f, s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: at, size, font: f, color });
  };
  const rule = (at: number, x1 = M, x2 = PAGE.w - M, color = RULE, thickness = 0.6) => page.drawLine({ start: { x: x1, y: at }, end: { x: x2, y: at }, thickness, color });
  const wrap = (s: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of drawable(f, s).split(/\n/)) {
      let line = "";
      for (const w of para.split(" ")) {
        const next = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = w;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  };
  /** A blank to write a price on: "$ ________ each". */
  const blank = (x1: number, x2: number, at: number, unit: string) => {
    text("$", x1, at, 8, font, GRAY);
    const t = drawable(font, unit);
    page.drawText(t, { x: x2 - font.widthOfTextAtSize(t, 7), y: at, size: 7, font, color: GRAY });
    rule(at - 3, x1, x2, GRAY, 0.6);
  };
  const section = (title: string) => {
    room(40);
    y -= 14;
    const t = drawable(serif, title);
    page.drawText(t, { x: M, y, size: 14, font: serif, color: INK });
    rule(y + 4, M + serif.widthOfTextAtSize(t, 14) + 10, PAGE.w - M, RULE, 0.6);
    y -= 18;
  };
  const room = (need: number) => {
    if (y - need >= BOTTOM) return;
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
    text(`Request for prices No. ${o.bid.number} — ${o.bid.vendorName} — Job #${o.project.number} ${o.project.name} (continued)`, M, y, 8.5, font, GRAY);
    y -= 20;
  };

  // The header: logo on the left; what it is, its number and dates on the right.
  const top = y;
  if (logo) {
    const k = Math.min(160 / logo.width, 64 / logo.height);
    page.drawImage(logo, { x: M, y: top - logo.height * k + 6, width: logo.width * k, height: logo.height * k });
  } else text(o.company.name, M, top - 14, 18, bold, accent);
  right("REQUEST FOR PRICES", PAGE.w - M, top, 7.5, bold, GRAY);
  right(`No. ${o.bid.number}`, PAGE.w - M, top - 24, 22, serif);
  let ry = top - 40;
  right(`Sent ${o.sent}`, PAGE.w - M, ry, 8.5, font, GRAY);
  if (o.due) {
    ry -= 11;
    right(`Prices needed by ${o.due}`, PAGE.w - M, ry, 8.5, font, GRAY);
  }
  y = Math.min(top - 70, ry - 14);
  page.drawRectangle({ x: M, y, width: W, height: 2.4, color: accent });
  page.drawRectangle({ x: M, y: y - 3.4, width: W, height: 0.6, color: accent, opacity: 0.35 });
  y -= 22;

  // From / To / Job.
  const cols = [
    { label: "FROM", name: o.company.name, lines: o.company.lines },
    { label: "TO", name: o.bid.vendorName, lines: o.vendorLines },
    { label: "JOB", name: o.project.name, lines: [o.site, `Job #${o.project.number}`].filter(Boolean) },
  ];
  const colW = (W - 2 * 18) / 3;
  let lowest = y;
  cols.forEach((c, i) => {
    const x = M + i * (colW + 18);
    let cy = y;
    text(c.label, x, cy, 7.5, bold, accent);
    cy -= 13;
    for (const l of wrap(c.name, bold, 9.5, colW)) {
      text(l, x, cy, 9.5, bold);
      cy -= 12;
    }
    for (const line of c.lines) {
      for (const l of wrap(line, font, 8.5, colW)) {
        text(l, x, cy, 8.5, font, GRAY);
        cy -= 11;
      }
    }
    lowest = Math.min(lowest, cy);
  });
  y = lowest - 8;

  if (o.bid.notes) {
    for (const l of wrap(o.bid.notes, font, 10, W)) {
      room(14);
      text(l, M, y, 10);
      y -= 13;
    }
    y -= 2;
  }
  text(`Write your prices in and email this back${o.replyTo ? ` to ${o.replyTo}` : ""}, or use the link in our email.`, M, y, 8.5, font, GRAY);
  y -= 8;

  const items = o.bid.lines.filter((l) => !isLadderLine(l));
  const ladder = o.bid.lines.filter((l) => isLadderLine(l));
  // Columns: Item | Qty | Unit | Your price | Substitute / note (a sub: Trade | Your price | Includes / excludes).
  const col = sub
    ? { item: M, price: PAGE.w - M - 280, priceEnd: PAGE.w - M - 160, note: PAGE.w - M - 145 }
    : { item: M, qty: PAGE.w - M - 255, unit: PAGE.w - M - 248, price: PAGE.w - M - 210, priceEnd: PAGE.w - M - 115, note: PAGE.w - M - 100 };
  const itemWidth = (sub ? col.price : (col as { qty: number }).qty - 30) - col.item - 12;
  const headRow = () => {
    room(30);
    text(sub ? "TRADE" : "ITEM", col.item, y, 7.5, bold, GRAY);
    if (!sub) {
      right("QTY", (col as { qty: number }).qty, y, 7.5, bold, GRAY);
      text("UNIT", (col as { unit: number }).unit, y, 7.5, bold, GRAY);
    }
    text("YOUR PRICE", col.price, y, 7.5, bold, GRAY);
    text(sub ? "INCLUDES / EXCLUDES" : "SUBSTITUTE / NOTE", col.note, y, 7.5, bold, GRAY);
    rule(y - 5, M, PAGE.w - M, INK, 1.1);
    y -= 22;
  };

  section(sub ? "Trades" : "Items");
  headRow();
  const codes = Array.from(new Map(items.map((l) => [l.codeLabel, l.codeLabel])).keys());
  for (const code of sub ? [""] : codes) {
    if (!sub) {
      room(46);
      page.drawRectangle({ x: M, y: y - 5, width: W, height: 17, color: tint });
      page.drawRectangle({ x: M, y: y - 5, width: 2.4, height: 17, color: accent });
      text(code || "Other", M + 9, y, 9.5, bold);
      y -= 22;
    }
    for (const l of sub ? items : items.filter((x) => x.codeLabel === code)) {
      room(24);
      const sent = asSent({ ...l, unitPrice: null });
      text(fit(font, drawable(font, l.name), 10, itemWidth), col.item + (sub ? 0 : 9), y);
      if (!sub) {
        right(qty(sent.quantity), (col as { qty: number }).qty, y, 10, bold);
        text(sent.unit, (col as { unit: number }).unit, y, 9.5, font, GRAY);
      }
      blank(col.price, col.priceEnd, y, sub ? "lump sum" : sent.len ? "per beam" : (UNIT_WORDS[l.unit] ?? `per ${l.unit}`));
      rule(y - 3, col.note, PAGE.w - M, RULE);
      rule(y - 9, M, PAGE.w - M, rgb(0.93, 0.94, 0.95), 0.4);
      y -= 22;
    }
  }
  if (!sub) {
    text(`${items.length} item${items.length === 1 ? "" : "s"} · quantities include waste · if you'd quote a different product, note it next to the item.`, M, y, 8.5, font, GRAY);
    y -= 6;
  }

  if (ladder.length) {
    section("Price list — other lengths");
    text("No quantity — just your price per board, so we can order the lengths that cost least.", M, y, 8.5, font, GRAY);
    y -= 18;
    const per = 3;
    const w = (W - 2 * 24) / per;
    for (let i = 0; i < ladder.length; i += per) {
      room(22);
      ladder.slice(i, i + per).forEach((l, j) => {
        const x = M + j * (w + 24);
        text(fit(font, drawable(font, l.name), 10, 76), x, y);
        blank(x + 80, x + w, y, "each");
      });
      y -= 22;
    }
  }

  // Your quote.
  room(120);
  y -= 16;
  const boxTop = y;
  const boxH = 104;
  page.drawRectangle({ x: M, y: boxTop - boxH, width: W, height: boxH, borderColor: RULE, borderWidth: 0.8 });
  text("Your quote", M + 16, boxTop - 18, 10.5, bold);
  const half = (W - 32 - 24) / 2;
  const fields = ["Prices good through", sub ? "Start date you can make" : "Delivery charge (if any)", "Quoted by", "Date"];
  fields.forEach((label, i) => {
    const x = M + 16 + (i % 2) * (half + 24);
    const at = boxTop - 50 - Math.floor(i / 2) * 34;
    rule(at, x, x + half, INK, 0.8);
    text(label, x, at - 10, 8, font, GRAY);
  });
  y = boxTop - boxH - 10;

  // Each page's footer: your company, what this is, and the page.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 4 }, end: { x: PAGE.w - M, y: M - 4 }, thickness: 0.5, color: RULE });
    p.drawText(drawable(font, o.company.footer), { x: M, y: M - 15, size: 7.5, font, color: GRAY });
    const t = `Request for prices No. ${o.bid.number} · Job #${o.project.number} · Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: PAGE.w - M - font.widthOfTextAtSize(t, 7.5), y: M - 15, size: 7.5, font, color: GRAY });
  });
  return doc.save();
}
