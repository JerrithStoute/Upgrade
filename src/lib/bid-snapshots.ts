import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { db } from "./db";
import { companyLines } from "./company";
import { companyClock } from "./company-zone";
import { guessCostType } from "./estimate-sheet";
import { escalationOf, parseSnapshotLines, type SnapshotLine } from "./escalation";
import { drawable, fit } from "./bid-pdf";
import { materialListFrom, type MaterialLine } from "./takeoff-materials";
import { loadConditions, parseHeldPrices, withHeldPrices } from "./takeoff-data";
import { syncAutoItemsIfChanged } from "./walls";
import { pullListPrices } from "./job-prices";
import { saveBuffer } from "./uploads";
import { fmtDate } from "./utils";

/**
 * Bid snapshots: the job's Material list as priced the day a proposal was sent and the day
 * it was signed, one of each per estimate version. Material price escalation is measured
 * from one of them (Settings: from sent or from signed). Each is also a PDF in the job's
 * Files → Bid snapshots, which the client never sees.
 */

export type SnapshotKind = "SENT" | "SIGNED";
export const SNAPSHOT_FOLDER = "Bid snapshots";

/** The Material list's materials (not labor, subs or equipment by their cost code) as snapshot lines. */
export function snapshotLinesOf(lines: MaterialLine[]): SnapshotLine[] {
  return lines
    .filter((l) => l.quantity > 0 && guessCostType(l.codeLabel) === "MATERIAL")
    .map((l) => ({
      key: l.key,
      materialItemId: l.materialItemId,
      name: l.name,
      category: l.category,
      unit: l.unit,
      qty: l.quantity,
      price: Math.round(l.unitCost * 10000) / 10000,
      pinned: l.pinned,
      vendor: l.vendor,
    }));
}

/**
 * Saves this version's snapshot (replacing one of the same kind) and its PDF. `lines` when
 * they're already worked out (a job coming off the old price lock); otherwise the Material
 * list as priced right now (a draft copied "exactly" at the prices it kept). A PDF that fails
 * doesn't stop the proposal going out.
 */
export async function takeBidSnapshot(projectId: string, estimateId: string, kind: SnapshotKind, opts: { at?: Date; lines?: SnapshotLine[]; userId?: string } = {}) {
  let lines = opts.lines;
  if (!lines) {
    await pullListPrices(projectId);
    await syncAutoItemsIfChanged(projectId);
    const est = await db.estimate.findUnique({ where: { id: estimateId }, select: { heldPrices: true } });
    lines = snapshotLinesOf(materialListFrom(withHeldPrices(await loadConditions(projectId), parseHeldPrices(est?.heldPrices))).lines);
  }
  const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
  const takenAt = opts.at ?? new Date();
  const old = await db.priceSnapshot.findUnique({ where: { estimateId_kind: { estimateId, kind } }, select: { fileId: true } });
  let fileId: string | null = null;
  try {
    fileId = await snapshotFile(projectId, estimateId, kind, lines, total, takenAt, opts.userId ?? null);
  } catch (e) {
    console.error("Bid snapshot PDF failed", e);
  }
  // A replaced snapshot's PDF goes with it (the file row; storage keeps nothing it can't reach).
  if (old?.fileId && old.fileId !== fileId) await db.fileAsset.deleteMany({ where: { id: old.fileId, folder: SNAPSHOT_FOLDER } });
  const json = JSON.stringify(lines);
  await db.priceSnapshot.upsert({
    where: { estimateId_kind: { estimateId, kind } },
    update: { takenAt, lines: json, total, fileId },
    create: { estimateId, kind, takenAt, lines: json, total, fileId },
  });
}

async function snapshotFile(projectId: string, estimateId: string, kind: SnapshotKind, lines: SnapshotLine[], total: number, at: Date, userId: string | null) {
  const [project, estimate, company, clock] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { number: true, name: true, address: true, city: true, state: true } }),
    db.estimate.findUniqueOrThrow({ where: { id: estimateId }, select: { name: true, version: true } }),
    db.company.findFirst({ select: { name: true, address: true, city: true, state: true, zip: true, phone: true, email: true } }),
    companyClock(),
  ]);
  const day = fmtDate(clock.wall(at));
  const what = kind === "SENT" ? "proposal sent" : "contract signed";
  const pdf = await snapshotPdf({
    from: companyLines(company),
    title: `Material list — ${what} ${day}`,
    job: `Job #${project.number} — ${project.name}${[project.address, project.city, project.state].filter(Boolean).length ? ` · ${[project.address, project.city, project.state].filter(Boolean).join(", ")}` : ""}`,
    estimate: `${estimate.name} v${estimate.version}`,
    lines,
    total,
  });
  const meta = await saveBuffer(Buffer.from(pdf), `Material list v${estimate.version} - ${what} ${fmtDate(clock.wall(at), "MMM d, yyyy")}.pdf`, "application/pdf", projectId);
  const file = await db.fileAsset.create({ data: { ...meta, projectId, uploadedById: userId, folder: SNAPSHOT_FOLDER, clientVisible: false } });
  return file.id;
}

const PAGE = { w: 612, h: 792 };
const M = 40;
const INK = rgb(0.06, 0.09, 0.16);
const GRAY = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.8, 0.83, 0.87);

/** The snapshot on paper: every material by category — qty, unit, item, vendor, price, total. For you, not the client. */
async function snapshotPdf(o: { from: string[]; title: string; job: string; estimate: string; lines: SnapshotLine[]; total: number }) {
  const doc = await PDFDocument.create();
  doc.setTitle(o.title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;
  const BOTTOM = M + 30;
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  const text = (s: string, x: number, at: number, size = 9.5, f = font, color = INK) => page.drawText(drawable(f, s), { x, y: at, size, font: f, color });
  const right = (s: string, xRight: number, at: number, size = 9.5, f = font) => {
    const t = drawable(f, s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: at, size, font: f, color: INK });
  };
  const col = { qty: M + 38, unit: M + 46, item: M + 80, vendor: M + 300, price: PAGE.w - M - 70, total: PAGE.w - M };
  const head = () => {
    page.drawRectangle({ x: M, y: y - 5, width: PAGE.w - 2 * M, height: 16, color: rgb(0.95, 0.96, 0.97) });
    right("Qty", col.qty, y, 8.5, bold);
    text("Unit", col.unit, y, 8.5, bold);
    text("Item", col.item, y, 8.5, bold);
    text("Vendor", col.vendor, y, 8.5, bold);
    right("Price", col.price, y, 8.5, bold);
    right("Total", col.total, y, 8.5, bold);
    y -= 19;
  };
  const room = (need: number) => {
    if (y - need >= BOTTOM) return;
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
    text(`${o.title} (continued)`, M, y, 8.5, font, GRAY);
    y -= 20;
    head();
  };

  o.from.forEach((l, i) => {
    text(l, M, y, i === 0 ? 12 : 9, i === 0 ? bold : font, i === 0 ? INK : GRAY);
    y -= i === 0 ? 15 : 11;
  });
  y -= 10;
  text(o.title, M, y, 16, bold);
  y -= 18;
  text(o.job, M, y, 10);
  y -= 13;
  text(`${o.estimate} · materials only, at job cost · for your records, not the client`, M, y, 9, font, GRAY);
  y -= 22;
  head();

  const cats = new Map<string, SnapshotLine[]>();
  for (const l of o.lines) cats.set(l.category, [...(cats.get(l.category) ?? []), l]);
  for (const [cat, rows] of cats) {
    room(36);
    text(cat, M, y, 9.5, bold);
    right(money(rows.reduce((s, l) => s + l.qty * l.price, 0)), col.total, y, 9.5, bold);
    y -= 15;
    for (const l of rows) {
      room(15);
      right(qty(l.qty), col.qty, y);
      text(l.unit, col.unit, y, 9.5, font, GRAY);
      text(fit(font, drawable(font, l.name), 9.5, col.vendor - col.item - 8), col.item, y);
      text(fit(font, drawable(font, l.vendor ?? ""), 8.5, col.price - col.vendor - 50), col.vendor, y, 8.5, font, GRAY);
      right(money(l.price), col.price, y);
      right(money(l.qty * l.price), col.total, y);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: PAGE.w - M, y: y - 5 }, thickness: 0.3, color: RULE });
      y -= 15;
    }
    y -= 6;
  }
  room(24);
  text("Materials total", col.vendor, y, 10.5, bold);
  right(money(o.total), col.total, y, 10.5, bold);

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: PAGE.w - M - font.widthOfTextAtSize(t, 8), y: M - 14, size: 8, font, color: GRAY });
  });
  return doc.save();
}

/**
 * A job still on the old price lock comes off it: its locked prices (what it was bid at) are
 * saved as its newest estimate's "sent" snapshot, dated the day it locked (and "signed" too when
 * that estimate is approved), then the job follows the Item List like every other job.
 * Returns true when it was locked.
 */
export async function releaseOldPriceLock(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { pricesLockedAt: true } });
  if (!p?.pricesLockedAt) return false;
  // Off first, once: nothing else converts it twice, and nothing below pulls prices back in.
  const off = await db.project.updateMany({ where: { id: projectId, pricesLockedAt: { not: null } }, data: { pricesLockedAt: null } });
  if (!off.count) return false;
  const est =
    (await db.estimate.findFirst({ where: { projectId, status: { in: ["SENT", "APPROVED"] } }, orderBy: { version: "desc" }, select: { id: true, status: true, approvedAt: true } })) ??
    (await db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { id: true, status: true, approvedAt: true } }));
  if (est) {
    const lines = snapshotLinesOf(materialListFrom(await loadConditions(projectId)).lines);
    const have = new Set((await db.priceSnapshot.findMany({ where: { estimateId: est.id }, select: { kind: true } })).map((s) => s.kind));
    if (!have.has("SENT")) await takeBidSnapshot(projectId, est.id, "SENT", { at: p.pricesLockedAt, lines });
    if (est.status === "APPROVED" && !have.has("SIGNED")) await takeBidSnapshot(projectId, est.id, "SIGNED", { at: est.approvedAt ?? p.pricesLockedAt, lines });
  }
  await pullListPrices(projectId);
  return true;
}

export type EscalationSetting = { pct: number; from: SnapshotKind };

export async function escalationSetting(): Promise<EscalationSetting> {
  const c = await db.company.findFirst({ select: { escalationPct: true, escalationFrom: true } });
  return { pct: c?.escalationPct ?? 10, from: c?.escalationFrom === "SIGNED" ? "SIGNED" : "SENT" };
}

/**
 * An estimate version's material price change since its snapshot — the one the company
 * measures from, else the other one (a proposal not signed yet: since it was sent). Today's
 * price: the Item List's, or this job's own for an item kept at "This job only".
 */
export async function estimateEscalation(projectId: string, estimateId: string) {
  const [snaps, setting] = await Promise.all([db.priceSnapshot.findMany({ where: { estimateId } }), escalationSetting()]);
  const snap = snaps.find((s) => s.kind === setting.from) ?? snaps.find((s) => s.kind !== setting.from);
  if (!snap) return null;
  const lines = parseSnapshotLines(snap.lines);
  const listIds = [...new Set(lines.flatMap((l) => (l.materialItemId ? [l.materialItemId] : [])))];
  const [items, pinned] = await Promise.all([
    db.materialItem.findMany({ where: { id: { in: listIds } }, select: { id: true, unitCost: true, priceCheckedAt: true } }),
    db.takeoffAssemblyItem.findMany({ where: { condition: { projectId }, pricePinned: true, materialItemId: { in: listIds } }, select: { materialItemId: true, unitCost: true } }),
  ]);
  const list = new Map(items.map((i) => [i.id, i.unitCost]));
  const own = new Map(pinned.map((p) => [p.materialItemId!, p.unitCost]));
  const result = escalationOf(lines, (l) => (l.materialItemId ? (own.get(l.materialItemId) ?? list.get(l.materialItemId) ?? null) : null), setting.pct);
  return {
    ...result,
    kind: snap.kind as SnapshotKind,
    takenAt: snap.takenAt,
    fileId: snap.fileId,
    checkedAt: Object.fromEntries(items.map((i) => [i.id, i.priceCheckedAt])),
  };
}
