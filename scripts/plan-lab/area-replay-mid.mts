// @ts-nocheck
/**
 * Plan lab: the "middle of the opening" rule (2026-11-22) tried on every Find area click logged. Each click replayed
 * with the app's room finder (A), the test copy with doorway edges to the middle + doorless openings closed (B), and
 * the test copy with doorway edges to the middle but doorless openings still joining (C). Graded against the room as
 * the user left it, with its doorway edges moved to the middle the same way the AI's answers were
 * (test-plans/_lab/ai-test/to-middle.ts) — so nobody re-marks anything.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/area-replay-mid.mts
 * right = 90%+ overlap; exact = every corner within 1"; also against the user's room unmoved (face), for reference.
 */
import "dotenv/config";
import { readFileSync } from "fs";
import pc from "polygon-clipping";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import * as A from "../../test-plans/_lab/room-detect-22c";
import * as B from "./candidate/room-detect";
import { toMiddle } from "../../test-plans/_lab/ai-test/to-middle";
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "fs";
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null, PICS = +(process.env.PICS ?? 0);
let pics = 0;
mkdirSync("test-plans/_lab/midpics", { recursive: true });
async function pic(name, segs, um, r1, r2, upf) {
  const all = [...um], xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 2 * upf;
  const Z = 900, sc = Z / (2 * R), x0 = cx - R, y0 = cy - R;
  const cv = createCanvas(Z, Z), g = cv.getContext("2d");
  g.fillStyle = "white"; g.fillRect(0, 0, Z, Z);
  g.strokeStyle = "#444"; g.lineWidth = 0.8; g.beginPath();
  for (let i = 0; i + 3 < segs.length; i += 4) { g.moveTo((segs[i] - x0) * sc, (segs[i + 1] - y0) * sc); g.lineTo((segs[i + 2] - x0) * sc, (segs[i + 3] - y0) * sc); }
  g.stroke();
  const ring = (Q, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); Q.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.closePath(); g.stroke(); };
  ring(um, "rgba(0,170,0,0.45)", 8);
  if (r1?.ok) ring(r1.outline, "rgba(230,0,0,0.9)", 2);
  if (r2?.ok) ring(r2.outline, "rgba(0,0,255,0.9)", 2);
  writeFileSync(`test-plans/_lab/midpics/${name}.png`, await cv.encode("png"));
}
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ where: { ok: true, measurementId: { not: null }, isDeduction: false }, select: { clickX: true, clickY: true, measurementId: true, unitsPerFoot: true, version: true, sheetId: true, sheet: { select: { pageNumber: true, plan: { select: { name: true, file: { select: { storagePath: true } } } } } } } });
const sheetIds = [...new Set(logs.map((l) => l.sheetId))];
const ms = await db.takeoffMeasurement.findMany({ where: { sheetId: { in: sheetIds }, isDeduction: false, condition: { type: "AREA" } }, select: { id: true, sheetId: true, points: true, condition: { select: { name: true } } } });
await db.$disconnect();
const P = (j) => { try { const p = JSON.parse(j ?? "[]"); const all = Array.isArray(p) ? p : p.points ?? []; const h = all.findIndex((q) => q[2] === 2); return (h < 0 ? all : all.slice(0, h)).map((q) => [q[0], q[1]]); } catch { return []; } };
const bySheet = new Map();
for (const m of ms) { if (!bySheet.has(m.sheetId)) bySheet.set(m.sheetId, []); bySheet.get(m.sheetId).push(m); }
const dseg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const toPoly = (p, Q) => Math.min(...Q.map((q, k) => dseg(p[0], p[1], q, Q[(k + 1) % Q.length])));
const off = (X, Y) => Math.max(...X.map((p) => toPoly(p, Y)), ...Y.map((p) => toPoly(p, X)));
const area = (mp) => mp.reduce((s, poly) => s + poly.reduce((t, ring, k) => { let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return t + (k ? -1 : 1) * Math.abs(a / 2); }, 0), 0);
const iou = (X, Y) => { try { const x = [[...X, X[0]]], y = [[...Y, Y[0]]]; const i = area(pc.intersection(x, y)), u = area(pc.union(x, y)); return u > 0 ? i / u : 0; } catch { return 0; } };
const segCache = new Map(), midCache = new Map();
const T = {};
const add = (k, f, v = 1) => { T[k] ??= {}; T[k][f] = (T[k][f] ?? 0) + v; };
const worse = [];
let n = 0;
for (const l of logs) {
  if (ONLY && !ONLY.test(l.sheet.plan.name)) continue;
  const all = bySheet.get(l.sheetId) ?? []; const me = all.find((m) => m.id === l.measurementId); if (!me) continue;
  const u0 = P(me.points); if (u0.length < 3) continue;
  const key = l.sheet.plan.file.storagePath + "#" + l.sheet.pageNumber;
  if (!segCache.has(key)) { try { const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise; const page = await doc.getPage(l.sheet.pageNumber); const fills = [], sw = []; const segs = await extractSegments(pdfjs, page, undefined, fills, sw); segCache.set(key, { segs, fills, sw }); } catch { segCache.set(key, null); } }
  const c = segCache.get(key); if (!c) continue;
  const inch = l.unitsPerFoot / 12;
  const mk = l.sheetId + "@" + l.unitsPerFoot;
  if (!midCache.has(mk)) { const rooms = all.filter((m) => !/porch|patio/i.test(m.condition.name)).map((m) => ({ id: m.id, p: P(m.points) })).filter((r) => r.p.length >= 3); midCache.set(mk, new Map(toMiddle(rooms, c.segs, inch).rooms.map((r) => [r.id, r.p]))); }
  const um = midCache.get(mk).get(me.id) ?? u0;
  const o = { unitsPerFoot: l.unitsPerFoot, fills: c.fills, doors: c.sw };
  const click = [l.clickX, l.clickY];
  const res = { A: A.findRoom(c.segs, click, o), B: B.findRoom(c.segs, click, { ...o, splitOpenings: true }), C: B.findRoom(c.segs, click, o) };
  n++;
  const g = {};
  for (const [k, r] of Object.entries(res)) {
    if (!r.ok) { add(k, "none"); g[k] = 0; continue; }
    const v = iou(r.outline, um); g[k] = v;
    if (v >= 0.9) add(k, "right"); if (off(r.outline, um) <= inch) add(k, "exact");
    if (iou(r.outline, u0) >= 0.9) add(k, "rightFace"); if (off(r.outline, u0) <= inch) add(k, "exactFace");
    if (v < 0.9) add(k, "wrong");
  }
  if (process.env.STOP && pics >= PICS) break;
  if (PICS && pics < PICS && process.env.WHY === "exact" && off(res.A.outline ?? [[0,0]], um) <= inch && res.C.ok && off(res.C.outline, um) > inch) await pic(`exact-${pics++}`, c.segs, um, res.A, res.C, l.unitsPerFoot);
  if (PICS && pics < PICS && process.env.WHY === "broke" && g.C >= 0.9 && g.B < 0.9) await pic(`broke-${pics++}`, c.segs, um, res.C, res.B, l.unitsPerFoot);
  if (PICS && pics < PICS && process.env.WHY === "cbroke" && g.A >= 0.9 && g.C < 0.9) await pic(`cbroke-${pics++}`, c.segs, um, res.A, res.C, l.unitsPerFoot);
  if (g.A >= 0.9 && g.B < 0.9) worse.push(`${l.sheet.plan.name} p${l.sheet.pageNumber} ${g.A.toFixed(2)}→${g.B.toFixed(2)} @${Math.round(l.clickX)},${Math.round(l.clickY)}`);
  if (g.A < 0.9 && g.B >= 0.9) add("B", "fixed"); if (g.A >= 0.9 && g.B < 0.9) add("B", "broke");
  if (g.A < 0.9 && g.C >= 0.9) add("C", "fixed"); if (g.A >= 0.9 && g.C < 0.9) add("C", "broke");
}
console.log("clicks", n);
for (const k of ["A", "B", "C"]) console.log(k, JSON.stringify(T[k]));
console.log("B broke:\n " + worse.slice(0, 40).join("\n "));
