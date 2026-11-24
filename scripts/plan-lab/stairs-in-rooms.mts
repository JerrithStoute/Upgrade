// @ts-nocheck
/**
 * Plan lab: Find area rooms (AreaFindLog) that took in stairs — five or more treads (lines alike in length and
 * direction, 9–13" apart) inside the found outline — by how the room was made (rules / AI cut / AI room), and
 * what the user did with them (kept / changed / removed).
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/stairs-in-rooms.mts
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ where: { ok: true, measurementId: { not: null }, isDeduction: false }, orderBy: { createdAt: "asc" },
  select: { outline: true, measurementId: true, unitsPerFoot: true, version: true, sheetId: true, sheet: { select: { pageNumber: true, plan: { select: { name: true, file: { select: { storagePath: true } } } } } } } });
const now = new Map((await db.takeoffMeasurement.findMany({ where: { id: { in: logs.map((l) => l.measurementId) } }, select: { id: true, points: true } })).map((m) => [m.id, m.points]));
await db.$disconnect();
const P = (j) => { try { const p = JSON.parse(j ?? "[]"); return (Array.isArray(p) ? p : p.points ?? []).map((q) => [q[0], q[1]]); } catch { return []; } };
const inside = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if (Q[i][1] > y !== Q[j][1] > y && x < ((Q[j][0] - Q[i][0]) * (y - Q[i][1])) / (Q[j][1] - Q[i][1]) + Q[i][0]) c = !c; return c; };
const same = (a, b) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.5 && Math.abs(p[1] - b[i][1]) < 0.5);
const treadsCache = new Map();
const T = {}, rows = [];
let pics = 0;
const bySheet = new Map(); for (const l of logs) (bySheet.get(l.sheetId) ?? bySheet.set(l.sheetId, []).get(l.sheetId)).push(l);
for (const [sid, ls] of bySheet) {
  const s = ls[0].sheet, upf = ls[0].unitsPerFoot, inch = upf / 12;
  let segs; try { const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + s.plan.file.storagePath)), verbosity: 0 }).promise; segs = await extractSegments(pdfjs as never, (await doc.getPage(s.pageNumber)) as never); } catch { continue; }
  // treads: lines 2.5–5' long; group by direction (2°) and length (3"); a run of ≥5 with steps 9–13" apart
  const L = [];
  for (let i = 0; i + 3 < segs.length; i += 4) { const [a, b, c, d] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]]; const len = Math.hypot(c - a, d - b); if (len < 2.5 * upf || len > 5 * upf) continue; let ang = Math.atan2(d - b, c - a); if (ang < 0) ang += Math.PI; if (ang >= Math.PI) ang -= Math.PI; L.push({ a, b, c, d, len, ang, mx: (a + c) / 2, my: (b + d) / 2 }); }
  const treads = [];
  const groups = new Map();
  for (const l of L) { const k = `${Math.round((l.ang * 180) / Math.PI / 2)}|${Math.round(l.len / (3 * inch))}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(l); }
  for (const g of groups.values()) {
    if (g.length < 5) continue;
    const nx = -Math.sin(g[0].ang), ny = Math.cos(g[0].ang), ux = Math.cos(g[0].ang), uy = Math.sin(g[0].ang);
    const srt = g.map((l) => ({ l, r: l.mx * nx + l.my * ny, s: l.mx * ux + l.my * uy })).sort((p, q) => p.r - q.r);
    let run = [srt[0]];
    const flush = () => { if (run.length >= 5) treads.push(...run.map((x) => x.l)); };
    for (let i = 1; i < srt.length; i++) { const gap = (srt[i].r - run[run.length - 1].r) / inch; if (gap >= 8.5 && gap <= 13.5 && Math.abs(srt[i].s - run[0].s) < 6 * inch) run.push(srt[i]); else if (gap > 0.5) { flush(); run = [srt[i]]; } }
    flush();
  }
  for (const l of ls) {
    const o = P(l.outline); if (o.length < 3) continue;
    const ins = treads.filter((t) => inside(t.mx, t.my, o)).length;
    const why = /\+ai-cut/.test(l.version) ? "AI cut" : /\+ai-ai/.test(l.version) ? "AI room" : "rules";
    const m = now.get(l.measurementId); const fate = !m ? "removed" : same(o, P(m)) ? "kept" : "changed";
    const k = `${why}`; T[k] ??= { rooms: 0, withStairs: 0, kept: 0, changed: 0, removed: 0 }; T[k].rooms++;
    if (ins >= 5) { T[k].withStairs++; T[k][fate]++; rows.push(`${s.plan.name.slice(0, 34).padEnd(34)} ${why.padEnd(8)} ${l.version.slice(0, 10)} treads inside ${ins}  -> ${fate}`);
      if (pics < 12) { const xs = o.map((q) => q[0]), ys = o.map((q) => q[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 3 * upf;
        const Z = 500, sc = Z / (2 * R), x0 = cx - R, y0 = cy - R; const cv = createCanvas(Z, Z + 24), g = cv.getContext("2d"); g.fillStyle = "white"; g.fillRect(0, 0, Z, Z + 24);
        g.strokeStyle = "#333"; g.lineWidth = 1; g.beginPath(); for (let i = 0; i + 3 < segs.length; i += 4) { g.moveTo((segs[i] - x0) * sc, (segs[i + 1] - y0) * sc); g.lineTo((segs[i + 2] - x0) * sc, (segs[i + 3] - y0) * sc); } g.stroke();
        const ring = (Q, col) => { g.fillStyle = col; g.beginPath(); Q.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.closePath(); g.fill(); };
        ring(o, "rgba(230,0,0,0.18)"); if (m) ring(P(m), "rgba(0,160,0,0.18)");
        g.fillStyle = "#000"; g.font = "13px Arial"; g.fillText(`${pics}. ${s.plan.name.slice(0, 30)} ${why} → ${fate} (red found, green yours)`, 4, Z + 16);
        writeFileSync(`test-plans/_lab/stair-${pics++}.png`, await cv.encode("png")); } }
  }
}
console.log(rows.join("\n"));
console.log(JSON.stringify(T, null, 1));
