// @ts-nocheck
/** Clicks where the app (src) moves a doorway to the middle and the copy (stub trim) no longer does: pictures. */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import * as A from "../../src/lib/room-detect";
import * as B from "./candidate/room-detect";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ where: { ok: true, isDeduction: false }, orderBy: { createdAt: "desc" }, take: 600, select: { clickX: true, clickY: true, unitsPerFoot: true, sheet: { select: { pageNumber: true, plan: { select: { name: true, file: { select: { storagePath: true } } } } } } } });
await db.$disconnect();
const cache = new Map(); let n = 0, lost = 0, less = 0, pics = 0;
for (const l of logs) {
  const key = l.sheet.plan.file.storagePath + "#" + l.sheet.pageNumber;
  if (!cache.has(key)) { try { const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise; const page = await doc.getPage(l.sheet.pageNumber); const fills = [], sw = []; const segs = await extractSegments(pdfjs, page, undefined, fills, sw); cache.set(key, { segs, fills, sw }); } catch { cache.set(key, null); } }
  const c = cache.get(key); if (!c) continue;
  const o = { unitsPerFoot: l.unitsPerFoot, fills: c.fills, doors: c.sw }, k = [l.clickX, l.clickY];
  const f = A.findRoom(c.segs, k, { ...o, middle: false }), a = A.findRoom(c.segs, k, o), b = B.findRoom(c.segs, k, o);
  if (!f.ok || !a.ok || !b.ok) continue; n++;
  const ga = a.areaSf - f.areaSf, gb = b.areaSf - f.areaSf;
  if (ga > 0.3 && gb < 0.05) lost++; else if (ga - gb > 0.3) less++; else continue;
  if (pics >= +(process.env.PICS ?? 12)) continue;
  console.log(pics, l.sheet.plan.name, "p" + l.sheet.pageNumber, Math.round(l.clickX), Math.round(l.clickY), "face", f.areaSf.toFixed(1), "app", a.areaSf.toFixed(1), "trim", b.areaSf.toFixed(1));
  const Q = a.outline, xs = Q.map((q) => q[0]), ys = Q.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 1.5 * l.unitsPerFoot;
  const Z = 700, sc = Z / (2 * R), x0 = cx - R, y0 = cy - R;
  const cv = createCanvas(Z, Z), g = cv.getContext("2d");
  g.fillStyle = "white"; g.fillRect(0, 0, Z, Z); g.strokeStyle = "#444"; g.lineWidth = 0.8; g.beginPath();
  for (let i = 0; i + 3 < c.segs.length; i += 4) { g.moveTo((c.segs[i] - x0) * sc, (c.segs[i + 1] - y0) * sc); g.lineTo((c.segs[i + 2] - x0) * sc, (c.segs[i + 3] - y0) * sc); }
  g.stroke();
  const ring = (P, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); P.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.closePath(); g.stroke(); };
  ring(a.outline, "rgba(230,0,0,0.8)", 4); ring(b.outline, "rgba(0,0,255,0.9)", 1.5);
  writeFileSync(`test-plans/_lab/midpics/trim-${pics++}.png`, await cv.encode("png"));
}
console.log("rooms", n, "lost all", lost, "lost some", less);
