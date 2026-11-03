import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { db } from "./db";
import { companyClock } from "./company-zone";
import { estimateEscalation } from "./bid-snapshots";
import { drawable, fit } from "./bid-pdf";
import { parsePriceSheet, sheetCategories, sheetSummary, sheetTrigger, shownLines, type PriceSheetOptions } from "./price-sheet";
import { newChangeOrder } from "./billing-flow";
import { deleteUpload, readUpload, saveBuffer } from "./uploads";
import { fmtDate } from "./utils";

/**
 * Material price escalation as a change order: one click on the price change sheet makes a draft
 * change order for the increase the client's sheet shows — one line, no profit on it (the contract
 * lets you charge the increase itself) — with that sheet attached as a PDF the client sees. It's
 * a draft like any other: you look it over and send it. Clicking again while that draft is still a
 * draft brings it up to today's prices instead of making a second one.
 */

export const ESCALATION_TITLE = "Material price escalation";

export async function escalationChangeOrder(projectId: string, estimateId: string, userId: string) {
  const [e, estimate, company, clock] = await Promise.all([
    estimateEscalation(projectId, estimateId),
    db.estimate.findFirst({ where: { id: estimateId, projectId }, select: { version: true, name: true, priceSheetOptions: true } }),
    db.company.findFirst({ select: { priceSheetOptions: true } }),
    companyClock(),
  ]);
  if (!estimate) throw new Error("Estimate not found");
  if (!e) throw new Error("This version has no bid snapshot to measure from yet — it's saved when the proposal is marked sent.");
  const o = parsePriceSheet(estimate.priceSheetOptions ?? company?.priceSheetOptions);
  const s = sheetCategories(e.lines, o.leaveOut);
  if (!(s.change > 0.005)) throw new Error("Material prices haven't gone up on the sheet — there's nothing to charge.");
  const since = fmtDate(clock.wall(e.takenAt));
  const what = e.kind === "SENT" ? `your proposal of ${since}` : `your contract was signed on ${since}`;
  const description = `Material prices for your home have risen ${s.pct}% since ${what}${e.past ? `, more than the ${e.triggerPct}% your contract allows for` : ""}. The price change sheet attached shows each item.`;
  const line = { description: `Material price increase since ${what} (${s.pct}%)`, quantity: 1, unit: "ls", unitCost: s.change, markupPct: 0, profitMode: "NONE", profitValue: 0, taxed: false };

  // Still a draft from an earlier click: brought up to date, not made twice.
  const existing = await db.changeOrder.findFirst({ where: { projectId, title: ESCALATION_TITLE, status: "DRAFT" }, orderBy: { number: "desc" }, include: { items: true } });
  const co = existing
    ? await db.changeOrder.update({ where: { id: existing.id }, data: { description } })
    : await newChangeOrder(projectId, { title: ESCALATION_TITLE, description, reason: "Material price escalation" });
  if (existing) await db.changeOrderItem.deleteMany({ where: { changeOrderId: co.id } });
  await db.changeOrderItem.create({ data: { ...line, changeOrderId: co.id } });

  // The sheet, as the client sees it (an older copy on this draft is replaced).
  const old = await db.fileAsset.findMany({ where: { changeOrderId: co.id, name: { startsWith: "Material price change" } }, select: { id: true, storagePath: true } });
  for (const f of old) {
    await deleteUpload(f.storagePath).catch(() => {});
    await db.fileAsset.delete({ where: { id: f.id } });
  }
  const pdf = await priceSheetPdf(projectId, o, { ...e, since }, fmtDate(clock.now));
  const meta = await saveBuffer(Buffer.from(pdf), `Material price change ${fmtDate(clock.now, "MMM d, yyyy")}.pdf`, "application/pdf", projectId);
  await db.fileAsset.create({ data: { ...meta, projectId, changeOrderId: co.id, uploadedById: userId, folder: "Contracts", clientVisible: true } });
  return { co, updated: !!existing, amount: s.change };
}

const PAGE = { w: 612, h: 792 };
const M = 48;
const INK = rgb(0.06, 0.09, 0.16);
const GRAY = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.8, 0.83, 0.87);

/** A PNG or JPG logo the PDF can carry (anything else: the company's name instead). */
async function logoImage(doc: PDFDocument, path: string | null) {
  if (!path) return null;
  try {
    const bytes = await readUpload(path);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
  } catch {
    /* no logo: the name */
  }
  return null;
}

/** The client's price change sheet on paper: the same choices as on screen (price-sheet.ts). */
export async function priceSheetPdf(projectId: string, o: PriceSheetOptions, e: { kind: "SENT" | "SIGNED"; since: string; triggerPct: number; lines: Parameters<typeof sheetCategories>[0] }, today: string) {
  const [project, company] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, include: { client: true } }),
    db.company.findFirst({ select: { name: true, address: true, city: true, state: true, zip: true, phone: true, email: true, licenseNumber: true, logoPath: true } }),
  ]);
  const s = sheetCategories(e.lines, o.leaveOut);
  const doc = await PDFDocument.create();
  doc.setTitle(o.heading || "Material price change");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo: PDFImage | null = await logoImage(doc, company?.logoPath ?? null);
  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;
  const BOTTOM = M + 24;
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const signed = (n: number) => (Math.abs(n) < 0.005 ? "—" : `${n > 0 ? "+" : "-"}${money(Math.abs(n))}`);
  const qty = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const text = (t: string, x: number, at: number, size = 10, f = font, color = INK) => page.drawText(drawable(f, t), { x, y: at, size, font: f, color });
  const right = (t: string, xRight: number, at: number, size = 10, f = font, color = INK) => {
    const d = drawable(f, t);
    page.drawText(d, { x: xRight - f.widthOfTextAtSize(d, size), y: at, size, font: f, color });
  };
  const wrap = (t: string, size: number, width: number) => {
    const out: string[] = [];
    for (const para of drawable(font, t).split("\n")) {
      let ln = "";
      for (const w of para.split(" ")) {
        const next = ln ? `${ln} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width && ln) {
          out.push(ln);
          ln = w;
        } else ln = next;
      }
      out.push(ln);
    }
    return out;
  };
  const room = (need: number) => {
    if (y - need >= BOTTOM) return;
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
  };
  const para = (t: string) => {
    for (const l of wrap(t, 10.5, PAGE.w - 2 * M)) {
      room(15);
      text(l, M, y, 10.5);
      y -= 15;
    }
    y -= 8;
  };

  // Letterhead: logo (or name) left; address, then RE: the client, right.
  const top = y;
  if (logo) {
    const sc = Math.min(200 / logo.width, 80 / logo.height, 1);
    page.drawImage(logo, { x: M, y: top - logo.height * sc + 10, width: logo.width * sc, height: logo.height * sc });
  } else text(company?.name ?? "", M, top - 8, 18, bold);
  const city = (c: { city: string | null; state: string | null; zip: string | null } | null | undefined) =>
    c ? [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";
  const clientName = project.client ? `${project.client.firstName} ${project.client.lastName}`.trim() : null;
  const rightLines = [
    company?.address ?? "",
    city(company),
    company?.phone ?? "",
    company?.email ?? "",
    company?.licenseNumber ? `License ${company.licenseNumber}` : "",
  ].filter(Boolean);
  let ry = top;
  for (const l of rightLines) {
    right(l, PAGE.w - M, ry, 9.5, font, GRAY);
    ry -= 12;
  }
  ry -= 8;
  for (const l of [clientName ? `RE: ${clientName}` : "RE:", project.address || project.name, city(project)].filter(Boolean)) {
    right(l, PAGE.w - M, ry, 9.5);
    ry -= 12;
  }
  right(today, PAGE.w - M, ry - 4, 8.5, font, GRAY);
  y = Math.min(ry - 30, top - 100);

  text(o.heading.trim() || "Material price change", M, y, 18, bold);
  y -= 26;
  if (o.intro.trim()) para(o.intro.trim());
  const sentence = [o.summary ? sheetSummary(e.kind, e.since, s) : "", o.trigger ? sheetTrigger(e.triggerPct) : ""].filter(Boolean).join(" ");
  if (sentence) para(sentence);
  y -= 6;

  // The table: Item / Category | (Qty) | (Was | Now) | Change
  const col = { change: PAGE.w - M, now: PAGE.w - M - 90, was: PAGE.w - M - 160, qty: PAGE.w - M - (o.prices ? 230 : 100) };
  const nameWidth = (o.items && o.qty ? col.qty - 50 : o.prices ? col.was - 60 : col.change - 90) - M;
  const head = () => {
    page.drawRectangle({ x: M, y: y - 5, width: PAGE.w - 2 * M, height: 17, color: rgb(0.95, 0.96, 0.97) });
    text(o.items ? "Item" : "Category", M + 4, y, 8.5, bold);
    if (o.items && o.qty) right("Qty", col.qty, y, 8.5, bold);
    if (o.prices) {
      right("Was", col.was, y, 8.5, bold);
      right("Now", col.now, y, 8.5, bold);
    }
    right("Change", col.change, y, 8.5, bold);
    y -= 20;
  };
  room(60);
  head();
  const cats = s.categories.filter((c) => o.unchanged || Math.abs(c.change) >= 0.005 || !o.items);
  for (const c of cats) {
    room(32);
    text(fit(bold, drawable(bold, c.name), 10, nameWidth), M + 4, y, 10, o.items ? bold : font);
    if (!o.items && o.prices) {
      right(money(c.then), col.was, y);
      right(money(c.now), col.now, y);
    }
    right(signed(c.change), col.change, y, 10, o.items ? bold : font);
    y -= 15;
    if (o.items) {
      for (const l of shownLines(c, o.unchanged)) {
        room(15);
        text(fit(font, drawable(font, l.name), 9.5, nameWidth - 12), M + 16, y, 9.5);
        if (o.qty) right(`${qty(l.qty)} ${l.unit}`, col.qty, y, 9.5, font, GRAY);
        if (o.prices) {
          right(money(l.price), col.was, y, 9.5);
          right(money(l.today), col.now, y, 9.5);
        }
        right(signed(l.change), col.change, y, 9.5);
        y -= 14;
      }
      if (!o.unchanged && c.unchanged) {
        room(13);
        text(`+ ${c.unchanged} item${c.unchanged === 1 ? "" : "s"} with no change`, M + 16, y, 8.5, font, GRAY);
        y -= 13;
      }
    }
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: PAGE.w - M, y: y + 6 }, thickness: 0.4, color: RULE });
    y -= 6;
  }
  room(30);
  page.drawLine({ start: { x: M, y: y + 8 }, end: { x: PAGE.w - M, y: y + 8 }, thickness: 1.2, color: INK });
  y -= 6;
  text(`Materials: was ${money(s.then)}, now ${money(s.now)}`, M + 4, y, 10.5, bold);
  right(signed(s.change), col.change, y, 11, bold);
  y -= 30;
  if (o.closing.trim()) para(o.closing.trim());
  if (o.signature) {
    room(60);
    y -= 30;
    page.drawLine({ start: { x: M, y }, end: { x: M + 230, y }, thickness: 0.6, color: GRAY });
    page.drawLine({ start: { x: M + 280, y }, end: { x: PAGE.w - M, y }, thickness: 0.6, color: GRAY });
    text(clientName ?? "Client", M, y - 12, 9, font, GRAY);
    text("Date", M + 280, y - 12, 9, font, GRAY);
  }
  const pages = doc.getPages();
  if (pages.length > 1)
    pages.forEach((p, i) => {
      const t = `Page ${i + 1} of ${pages.length}`;
      p.drawText(t, { x: PAGE.w - M - font.widthOfTextAtSize(t, 8), y: M - 20, size: 8, font, color: GRAY });
    });
  return doc.save();
}
