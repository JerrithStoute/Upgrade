// @ts-nocheck
/** The last N Find area clicks redrawn: the room found now (blue) on the plan. test-plans/_lab/midpics/last-K.png */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import * as A from "../../src/lib/room-detect";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ orderBy: { createdAt: "desc" }, take: +(process.argv[2] ?? 4), select: { clickX: true, clickY: true, unitsPerFoot: true, outline: true, sheet: { select: { pageNumber: true, plan: { select: { file: { select: { storagePath: true } } } } } } } });
await db.$disconnect();
let k = 0;
for (const l of logs) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise;
  const page = await doc.getPage(l.sheet.pageNumber); const fills = [], sw = [];
  const segs = await extractSegments(pdfjs, page, undefined, fills, sw);
  const o = { unitsPerFoot: l.unitsPerFoot, fills, doors: sw };
  const r = A.findRoom(segs, [l.clickX, l.clickY], o), f = A.findRoom(segs, [l.clickX, l.clickY], { ...o, middle: false });
  const Q = r.ok ? r.outline : [[l.clickX - 50, l.clickY - 50], [l.clickX + 50, l.clickY + 50]];
  const xs = Q.map((q) => q[0]), ys = Q.map((q) => q[1]), upf = l.unitsPerFoot;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 2 * upf;
  const Z = 900, sc = Z / (2 * R), x0 = cx - R, y0 = cy - R;
  const cv = createCanvas(Z, Z), g = cv.getContext("2d");
  g.fillStyle = "white"; g.fillRect(0, 0, Z, Z); g.strokeStyle = "#444"; g.lineWidth = 0.8; g.beginPath();
  for (let i = 0; i + 3 < segs.length; i += 4) { g.moveTo((segs[i] - x0) * sc, (segs[i + 1] - y0) * sc); g.lineTo((segs[i + 2] - x0) * sc, (segs[i + 3] - y0) * sc); }
  g.stroke();
  const ring = (P, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); P.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.closePath(); g.stroke(); };
  if (f.ok) ring(f.outline, "rgba(230,0,0,0.8)", 4);
  if (r.ok) ring(r.outline, "rgba(0,0,255,0.9)", 2);
  writeFileSync(`test-plans/_lab/midpics/last-${k++}.png`, await cv.encode("png"));
  console.log(k - 1, r.ok && r.areaSf.toFixed(1), f.ok && f.areaSf.toFixed(1), "doors on sheet:", sw.length);
}
