// @ts-nocheck
/** The last Find area click: logged outline (what the app saved, green) vs the room finder now (blue) vs face-only (red). */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
const A = process.env.CAND ? await import("./candidate/room-detect") : process.env.OLD ? await import("../../test-plans/_lab/room-detect-22c") : await import("../../src/lib/room-detect");
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const [l] = await db.areaFindLog.findMany({ orderBy: { createdAt: "desc" }, skip: +(process.env.SKIP ?? 0), take: 1, select: { clickX: true, clickY: true, unitsPerFoot: true, outline: true, version: true, measurementId: true, sheet: { select: { pageNumber: true, plan: { select: { file: { select: { storagePath: true } } } } } } } });
const m = l.measurementId ? await db.takeoffMeasurement.findUnique({ where: { id: l.measurementId }, select: { points: true } }) : null;
await db.$disconnect();
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise;
const page = await doc.getPage(l.sheet.pageNumber); const fills = [], sw = [];
const segs = await extractSegments(pdfjs, page, undefined, fills, sw);
const o = { unitsPerFoot: l.unitsPerFoot, fills, doors: sw };
if (process.env.PREP) A.prepareRoomFind(segs, { unitsPerFoot: l.unitsPerFoot, fills });
const r = A.findRoom(segs, [l.clickX, l.clickY], o), f = A.findRoom(segs, [l.clickX, l.clickY], { ...o, middle: false });
const ar = (P) => { let a = 0; P.forEach((p, i) => { const q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2) / l.unitsPerFoot ** 2; };
const logged = typeof l.outline === "string" ? JSON.parse(l.outline) : l.outline;
console.log("version", l.version, "logged", logged && ar(logged).toFixed(1), "now", r.ok && ar(r.outline).toFixed(1), "face", f.ok && ar(f.outline).toFixed(1), "saved", m?.points?.slice(0, 300));
const Q = r.outline, xs = Q.map((q) => q[0]), ys = Q.map((q) => q[1]), upf = l.unitsPerFoot;
const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
const R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 2 * upf;
const Z = 900, sc = Z / (2 * R), x0 = cx - R, y0 = cy - R;
const cv = createCanvas(Z, Z), g = cv.getContext("2d");
g.fillStyle = "white"; g.fillRect(0, 0, Z, Z); g.strokeStyle = "#444"; g.lineWidth = 0.8; g.beginPath();
for (let i = 0; i + 3 < segs.length; i += 4) { g.moveTo((segs[i] - x0) * sc, (segs[i + 1] - y0) * sc); g.lineTo((segs[i + 2] - x0) * sc, (segs[i + 3] - y0) * sc); }
g.stroke();
const ring = (P, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); P.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.closePath(); g.stroke(); };
if (logged) ring(logged, "rgba(0,170,0,0.5)", 8);
if (f.ok) ring(f.outline, "rgba(230,0,0,0.8)", 3);
ring(r.outline, "rgba(0,0,255,0.9)", 1.5);
writeFileSync("test-plans/_lab/midpics/last.png", await cv.encode("png"));
