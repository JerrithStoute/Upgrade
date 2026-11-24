// @ts-nocheck
/**
 * Plan lab: today's Find area on every room the user clicked since SINCE, graded against the outline they left there
 * (the shape of that takeoff now covering the click — kept, edited, or redrawn). Each room once. Same grades as the
 * hidden-plans scorecard: no edit (every corner within 2", doorway corners at a door's middle allowed), quick fix, redraw.
 * Rooms where nothing of that takeoff covers the click now (undone and left) aren't graded.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/real-replay.mts      (MOD = another room finder to compare)
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { readPoints, polygonArea } from "../../src/lib/find-area-score";
const { findRoom } = await import(process.env.MOD ?? "../../src/lib/room-detect/index.ts");

const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const since = new Date(process.env.SINCE ?? "2026-11-13");
const logs = await db.areaFindLog.findMany({
  where: { createdAt: { gte: since }, ok: true, measurementId: { not: null } },
  orderBy: { createdAt: "asc" },
  select: { clickX: true, clickY: true, unitsPerFoot: true, sheetId: true, conditionId: true, createdAt: true, sheet: { select: { pageNumber: true, plan: { select: { name: true, file: { select: { storagePath: true } } } } } } },
});
const shapes = await db.takeoffMeasurement.findMany({ where: { sheetId: { in: [...new Set(logs.map((l) => l.sheetId))] }, isDeduction: false }, select: { id: true, sheetId: true, conditionId: true, points: true, condition: { select: { type: true } } } });
await db.$disconnect();
const sd = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const toPoly = (p, Q) => Math.min(...Q.map((q, k) => sd(p[0], p[1], q, Q[(k + 1) % Q.length])));
const inside = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if (Q[i][1] > y !== Q[j][1] > y && x < ((Q[j][0] - Q[i][0]) * (y - Q[i][1])) / (Q[j][1] - Q[i][1]) + Q[i][0]) c = !c; return c; };
const corners = (Q) => Q.filter((p, i) => { const a = Q[(i + Q.length - 1) % Q.length], b = Q[(i + 1) % Q.length]; const c = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]); const l = Math.hypot(p[0] - a[0], p[1] - a[1]) * Math.hypot(b[0] - p[0], b[1] - p[1]); return l > 0 && Math.abs(c) / l > 0.05; });
const iou = (A, B, step) => { const all = [...A, ...B]; const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]); let i = 0, u = 0; for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) { const a = inside(x, y, A), b = inside(x, y, B); if (a && b) i++; if (a || b) u++; } return u ? i / u : 0; };

const sheets = new Map();
const seen = new Set();
const G = { noedit: 0, quick: 0, redraw: 0 }, rows = [];
let n = 0;
for (const l of logs) {
  const truth = shapes.find((s) => s.sheetId === l.sheetId && s.conditionId === l.conditionId && s.condition.type === "AREA" && inside(l.clickX, l.clickY, readPoints(s.points)));
  if (!truth || seen.has(truth.id)) continue;
  seen.add(truth.id);
  const U = readPoints(truth.points);
  if (U.length < 3) continue;
  const key = `${l.sheet.plan.file.storagePath}#${l.sheet.pageNumber}`;
  if (!sheets.has(key)) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise;
    const fills = [], doors = [];
    const segs = await extractSegments(pdfjs, await doc.getPage(l.sheet.pageNumber), undefined, fills, doors);
    sheets.set(key, { segs, fills, doors });
  }
  const { segs, fills, doors } = sheets.get(key);
  const upf = l.unitsPerFoot, inch = upf / 12;
  const r = findRoom(segs, [l.clickX, l.clickY], { unitsPerFoot: upf, fills, doors });
  n++;
  let grade = "redraw", offIn = null, ov = null;
  if (r.ok) {
    const X = r.outline;
    const atDoor = (q) => doors.some((d) => d.a && d.b && d.r >= 1.5 * upf && d.r <= 4 * upf && [d.a, d.b].some((e) => { const L = Math.hypot(e[0] - d.x, e[1] - d.y), ux = (e[0] - d.x) / L, uy = (e[1] - d.y) / L; const t = (q[0] - d.x) * ux + (q[1] - d.y) * uy, o = Math.abs((q[0] - d.x) * -uy + (q[1] - d.y) * ux); return o <= 6 * inch && t >= -6 * inch && t <= L + 6 * inch; }));
    const xc = corners(X).filter((q) => !(atDoor(q) && !inside(q[0], q[1], U) && toPoly(q, U) <= 4.5 * inch));
    const uc = corners(U).filter((q) => !(atDoor(q) && inside(q[0], q[1], X) && toPoly(q, X) <= 4.5 * inch));
    offIn = Math.max(0, ...xc.map((p) => toPoly(p, U)), ...uc.map((p) => toPoly(p, X))) / inch;
    ov = iou(X, U, 3 * inch);
    const spots = (A, B) => { const bad = A.map((p) => toPoly(p, B) > 2 * inch); let k = 0; bad.forEach((b, i) => { if (b && !bad[(i + bad.length - 1) % bad.length]) k++; }); return bad.length && bad.every(Boolean) ? 1 : k; };
    const moves = Math.max(spots(xc, U), spots(uc, X));
    if (offIn <= 2) grade = "noedit";
    else if (ov >= 0.75 && moves <= 3) grade = "quick";
  }
  G[grade]++;
  rows.push({ sheet: `${l.sheet.plan.name} p${l.sheet.pageNumber}`, sheetId: l.sheetId, click: [l.clickX, l.clickY], user: U, found: r.ok ? r.outline : null, reason: r.ok ? null : r.reason, grade, offIn: offIn && +offIn.toFixed(1), overlap: ov && +ov.toFixed(2), sf: +(polygonArea(U) / upf / upf).toFixed(1) });
}
const pct = (v) => ((100 * v) / n).toFixed(1) + "%";
console.log(`rooms ${n}: no edit ${G.noedit} (${pct(G.noedit)}), quick fix ${G.quick} (${pct(G.quick)}), redraw ${G.redraw} (${pct(G.redraw)})`);
writeFileSync(process.env.OUT ?? "test-plans/_lab/real-replay.json", JSON.stringify(rows));
