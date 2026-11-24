// @ts-nocheck
/**
 * Plan lab: every Find area click of one version (AreaFindLog) replayed with the app's room finder and the test copy
 * (scripts/plan-lab/candidate/room-detect.ts), each scored against the room as the user left it: exact (every corner
 * within ½"), and edge by edge — of the found room's edges, how many sit on the user's.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/area-replay.mts [version prefix]
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import * as A from "../../src/lib/room-detect";
import * as B from "./candidate/room-detect";
const VER = process.argv[2] ?? "2026-11-20a";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ where: { ok: true, measurementId: { not: null }, isDeduction: false, version: { startsWith: VER } }, select: { clickX: true, clickY: true, outline: true, measurementId: true, unitsPerFoot: true, version: true, sheet: { select: { pageNumber: true, plan: { select: { name: true, file: { select: { storagePath: true } } } } } } } });
const now = new Map((await db.takeoffMeasurement.findMany({ where: { id: { in: logs.map((l) => l.measurementId) } }, select: { id: true, points: true } })).map((m) => [m.id, m.points]));
await db.$disconnect();
const P = (j) => { try { const p = JSON.parse(j ?? "[]"); return (Array.isArray(p) ? p : p.points ?? []).map((q) => [q[0], q[1]]); } catch { return []; } };
const dseg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const toPoly = (P2, Q) => Math.min(...Q.map((q, k) => dseg(P2[0], P2[1], q, Q[(k + 1) % Q.length])));
const off = (X, Y) => Math.max(...X.map((p) => toPoly(p, Y)), ...Y.map((p) => toPoly(p, X)));
/** Edges (12"+) of X whose middle sits on Y, and how many there are. */
const edges = (X, Y, inch) => { let on = 0, n = 0; for (let i = 0; i < X.length; i++) { const a = X[i], b = X[(i + 1) % X.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 12 * inch) continue; n++; if (toPoly([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Y) <= 0.5 * inch) on++; } return [on, n]; };
const cache = new Map();
/** A picture: green = the user's room, red = today's, blue = the test copy's. */
async function pic(name, segs, u, ra, rb, upf) {
  const all = [...u, ...(rb.ok ? rb.outline : [])], xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const R = Math.min(30 * upf, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 2 * upf);
  const Z = 600, sc = Z / (2 * R), x0 = cx - R, y0 = cy - R;
  const cv = createCanvas(Z, Z), g = cv.getContext("2d");
  g.fillStyle = "white"; g.fillRect(0, 0, Z, Z);
  g.strokeStyle = "#333"; g.lineWidth = 0.8; g.beginPath();
  for (let i = 0; i + 3 < segs.length; i += 4) { g.moveTo((segs[i] - x0) * sc, (segs[i + 1] - y0) * sc); g.lineTo((segs[i + 2] - x0) * sc, (segs[i + 3] - y0) * sc); }
  g.stroke();
  const ring = (Q, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); Q.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.closePath(); g.stroke(); };
  ring(u, "rgba(0,170,0,0.5)", 7);
  if (ra.ok) ring(ra.outline, "rgba(230,0,0,0.9)", 2);
  if (rb.ok) ring(rb.outline, "rgba(0,0,255,0.9)", 2);
  writeFileSync(`test-plans/_lab/fixpics/${name}.png`, await cv.encode("png"));
}
const T = { rooms: 0, A: { exact: 0, on: 0, edges: 0, none: 0 }, B: { exact: 0, on: 0, edges: 0, none: 0 }, changed: 0, better: 0, worse: 0 };
const diffs = [];
for (const l of logs) {
  if (/\+ai/.test(l.version) && !process.env.ALL) continue; // (the rules' own rooms)
  const m = now.get(l.measurementId); if (!m) continue;
  const u = P(m); if (u.length < 3) continue;
  const key = l.sheet.plan.file.storagePath + l.sheet.pageNumber;
  if (!cache.has(key)) { try { const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise; const page = await doc.getPage(l.sheet.pageNumber); const fills = [], sw = []; const segs = await extractSegments(pdfjs as never, page as never, undefined, fills, sw); cache.set(key, { segs, fills, sw }); } catch { cache.set(key, null); } }
  const c = cache.get(key); if (!c) continue;
  const inch = l.unitsPerFoot / 12, o = { unitsPerFoot: l.unitsPerFoot, fills: c.fills, doors: c.sw };
  const ra = A.findRoom(c.segs, [l.clickX, l.clickY], o), rb = B.findRoom(c.segs, [l.clickX, l.clickY], o);
  T.rooms++;
  const sc = {};
  for (const [k, r] of [["A", ra], ["B", rb]]) {
    if (!r.ok) { T[k].none++; sc[k] = 999; continue; }
    const d = off(r.outline, u) / inch; sc[k] = d; if (d <= 0.5) T[k].exact++;
    const [on, n] = edges(r.outline, u, inch); T[k].on += on; T[k].edges += n;
  }
  if (Math.abs(sc.A - sc.B) > 0.25) { T.changed++; if (sc.B < sc.A) T.better++; else { T.worse++; diffs.push(`${l.sheet.plan.name} ${sc.A.toFixed(1)}" → ${sc.B.toFixed(1)}"`); if (process.env.PICS) await pic(`worse-${T.worse}`, c.segs, u, ra, rb, l.unitsPerFoot); } }
}
console.log(JSON.stringify(T));
console.log("worse:", diffs.slice(0, 15).join(" | "));
