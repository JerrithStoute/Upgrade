// @ts-nocheck
/** Pictures of area-fixes.json rows of one kind of fix (FIX, HOW optional): red = what Find area gave, green = the room now. */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
const rows = JSON.parse(readFileSync("test-plans/_lab/area-fixes.json", "utf8")).filter((r) => r.fix === process.env.FIX && (!process.env.HOW || r.how === process.env.HOW));
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
mkdirSync("test-plans/_lab/fixpics", { recursive: true });
const N = +(process.env.N ?? 8), out = [];
const cache = new Map();
for (const r of rows.slice(0, N)) {
  const l = await db.areaFindLog.findUnique({ where: { id: r.logId }, select: { outline: true, measurementId: true, unitsPerFoot: true, sheet: { select: { pageNumber: true, plan: { select: { file: { select: { storagePath: true } } } } } } } });
  const m = await db.takeoffMeasurement.findUnique({ where: { id: l.measurementId }, select: { points: true } });
  const P = (j) => { const p = JSON.parse(j); return (Array.isArray(p) ? p : p.points).map((q) => [q[0], q[1]]); };
  const o = P(l.outline), u = P(m.points), upf = l.unitsPerFoot;
  const key = l.sheet.plan.file.storagePath + l.sheet.pageNumber;
  if (!cache.has(key)) { const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise; cache.set(key, await extractSegments(pdfjs as never, (await doc.getPage(l.sheet.pageNumber)) as never)); }
  const segs = cache.get(key);
  const all = [...o, ...u], xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 2 * upf;
  const Z = 600, sc = Z / (2 * R), x0 = cx - R, y0 = cy - R;
  const cv = createCanvas(Z, Z + 26), g = cv.getContext("2d"); g.fillStyle = "white"; g.fillRect(0, 0, Z, Z + 26);
  g.strokeStyle = "#333"; g.lineWidth = 0.8; g.beginPath(); for (let i = 0; i + 3 < segs.length; i += 4) { g.moveTo((segs[i] - x0) * sc, (segs[i + 1] - y0) * sc); g.lineTo((segs[i + 2] - x0) * sc, (segs[i + 3] - y0) * sc); } g.stroke();
  const ring = (Q, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); Q.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.closePath(); g.stroke(); };
  ring(u, "rgba(0,170,0,0.55)", 7); ring(o, "rgba(230,0,0,0.9)", 2.5);
  g.fillStyle = "#000"; g.font = "13px Arial"; g.fillText(`${r.sheet.slice(0, 34)} · ${r.how} · ${r.sfFound}→${r.sfNow} sf · worst ${r.worstIn}"`, 4, Z + 18);
  const f = `test-plans/_lab/fixpics/${(process.env.FIX + "-" + (process.env.HOW ?? "all")).replace(/[^a-z0-9]+/gi, "_")}-${out.length}.png`;
  writeFileSync(f, await cv.encode("png")); out.push(f);
}
await db.$disconnect();
console.log(out.join("\n"));
