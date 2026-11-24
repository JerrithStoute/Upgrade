// @ts-nocheck
/**
 * Plan lab: what the user actually did with Find area's rooms since SINCE (default 2026-11-13): for rooms they changed,
 * how much (the farthest corner moved, the area's change); for rooms they removed, whether they drew another in its
 * place; clicks that found nothing. By project (Test Plans vs real jobs).
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/real-clicks.mts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { readPoints, polygonArea } from "../../src/lib/find-area-score";

const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const since = new Date(process.env.SINCE ?? "2026-11-13");
const logs = await db.areaFindLog.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: "asc" },
  select: { id: true, version: true, ok: true, reason: true, outline: true, measurementId: true, clickX: true, clickY: true, createdAt: true, unitsPerFoot: true, sheetId: true, conditionId: true, project: { select: { name: true } }, sheet: { select: { pageNumber: true, plan: { select: { name: true } } } } },
});
const shapes = await db.takeoffMeasurement.findMany({ where: { sheetId: { in: [...new Set(logs.map((l) => l.sheetId))] } }, select: { id: true, sheetId: true, conditionId: true, points: true, createdAt: true } });
await db.$disconnect();
const byId = new Map(shapes.map((s) => [s.id, s]));
const sd = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const toPoly = (p, Q) => Math.min(...Q.map((q, k) => sd(p[0], p[1], q, Q[(k + 1) % Q.length])));
const inside = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if (Q[i][1] > y !== Q[j][1] > y && x < ((Q[j][0] - Q[i][0]) * (y - Q[i][1])) / (Q[j][1] - Q[i][1]) + Q[i][0]) c = !c; return c; };
const out = [];
const T = {};
const add = (proj, k) => { const p = proj === "Test Plans" ? "Test Plans" : "real jobs"; ((T[p] ??= {})[k] = (T[p][k] ?? 0) + 1); };
for (const l of logs) {
  const proj = l.project.name, inch = l.unitsPerFoot / 12;
  if (!l.ok) { add(proj, `nothing found (${l.reason})`); continue; }
  if (!l.measurementId) { add(proj, "not saved"); continue; }
  const found = readPoints(l.outline);
  const cur = byId.get(l.measurementId);
  if (cur) {
    const now = readPoints(cur.points);
    const off = Math.max(...found.map((p) => toPoly(p, now)), ...now.map((p) => toPoly(p, found))) / inch;
    const dA = (polygonArea(now) - polygonArea(found)) / (polygonArea(found) || 1);
    const k = off <= 0.5 ? "kept" : off <= 2 ? "changed ≤2\"" : off <= 6 ? "changed 2–6\"" : off <= 24 ? "changed 6\"–2'" : "changed 2'+";
    add(proj, k);
    if (off > 2) out.push({ k, off: +off.toFixed(1), dA: +(dA * 100).toFixed(0), proj, sheet: `${l.sheet.plan.name} p${l.sheet.pageNumber}`, at: [l.clickX, l.clickY].map(Math.round), when: l.createdAt.toISOString().slice(0, 16), sheetId: l.sheetId, found, now });
  } else {
    // Gone: something else of this takeoff now covers the click (redrawn / split / merged), or nothing (just undone).
    const over = shapes.filter((s) => s.sheetId === l.sheetId && s.conditionId === l.conditionId && s.createdAt > l.createdAt && inside(l.clickX, l.clickY, readPoints(s.points)));
    add(proj, over.length ? "removed, replaced" : "removed, nothing there now");
  }
}
for (const [p, t] of Object.entries(T)) {
  const n = Object.values(t).reduce((a, b) => a + b, 0);
  console.log(`\n${p}: ${n} clicks`);
  for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${String(v).padStart(5)}  ${((100 * v) / n).toFixed(1)}%`);
}
writeFileSync("test-plans/_lab/real-clicks.json", JSON.stringify(out));
console.log("\nchanged by more than 2\":", out.length, "(saved to test-plans/_lab/real-clicks.json)");
