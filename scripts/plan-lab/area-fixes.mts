// @ts-nocheck
/**
 * Plan lab: what the user had to do to Find area's rooms (AreaFindLog, one version and on), sorted by kind of fix:
 * kept exactly, corners only (same room, rounded/extra corners squared), edges inches off, stopped short (grew 25%+),
 * ran past (shrank 20%+), split (another of the user's rooms sits inside the found one), deleted, nothing found.
 * By how the room was made: rules, AI cut it back, AI drew it.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/area-fixes.mts [version prefix, default 2026-11-20a]
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
const VER = process.argv[2] ?? "2026-11-20a";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ where: { version: { startsWith: VER }, isDeduction: false }, orderBy: { createdAt: "asc" },
  select: { id: true, ok: true, reason: true, outline: true, areaSf: true, measurementId: true, unitsPerFoot: true, version: true, sheetId: true, clickX: true, clickY: true, sheet: { select: { pageNumber: true, plan: { select: { name: true } } } } } });
const areas = await db.takeoffMeasurement.findMany({ where: { sheetId: { in: [...new Set(logs.map((l) => l.sheetId))] }, condition: { type: "AREA" }, isDeduction: false }, select: { id: true, sheetId: true, points: true } });
await db.$disconnect();
const P = (j) => { try { const p = JSON.parse(j ?? "[]"); return (Array.isArray(p) ? p : p.points ?? []).map((q) => [q[0], q[1]]); } catch { return []; } };
const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); };
const inside = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if (Q[i][1] > y !== Q[j][1] > y && x < ((Q[j][0] - Q[i][0]) * (y - Q[i][1])) / (Q[j][1] - Q[i][1]) + Q[i][0]) c = !c; return c; };
const dseg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const off = (A, B) => Math.max(...A.map((p) => Math.min(...B.map((q, i) => dseg(p[0], p[1], q, B[(i + 1) % B.length])))), ...B.map((p) => Math.min(...A.map((q, i) => dseg(p[0], p[1], q, A[(i + 1) % A.length])))));
const byId = new Map(areas.map((a) => [a.id, a]));
const T = {}, rows = [];
for (const l of logs) {
  const how = !l.ok ? "—" : /\+ai-cut/.test(l.version) ? "AI cut" : /\+ai-ai/.test(l.version) ? "AI drew" : "rules";
  let fix;
  if (!l.ok) fix = `nothing found (${l.reason})`;
  else if (!l.measurementId) fix = "not saved";
  else {
    const m = byId.get(l.measurementId), o = P(l.outline), inch = l.unitsPerFoot / 12;
    if (!m) fix = "deleted";
    else {
      const u = P(m.points), A0 = area(o), A1 = area(u), d = off(o, u) / inch;
      const split = areas.some((a) => a.id !== m.id && a.sheetId === l.sheetId && (() => { const q = P(a.points); const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; return inside(c[0], c[1], o) && !inside(c[0], c[1], u) && area(q) > 0.05 * A0; })());
      if (d <= 0.5) fix = "kept exactly";
      else if (A1 > 1.25 * A0) fix = "stopped short (grew)";
      else if (split) fix = "split into rooms";
      else if (A1 < 0.8 * A0) fix = "ran past (shrank)";
      else if (u.length < o.length && Math.abs(A1 - A0) / A0 < 0.05) fix = "corners squared";
      else if (d <= 8) fix = "edges inches off";
      else fix = "reshaped";
      rows.push({ how, fix, sheet: `${l.sheet.plan.name} p${l.sheet.pageNumber}`, click: [l.clickX, l.clickY], sfFound: +(A0 / l.unitsPerFoot ** 2).toFixed(1), sfNow: +(A1 / l.unitsPerFoot ** 2).toFixed(1), worstIn: +d.toFixed(1), logId: l.id });
    }
  }
  (T[fix] ??= { total: 0, rules: 0, "AI cut": 0, "AI drew": 0, "—": 0 }).total++;
  T[fix][how]++;
}
writeFileSync("test-plans/_lab/area-fixes.json", JSON.stringify(rows, null, 1));
const order = ["kept exactly", "corners squared", "edges inches off", "stopped short (grew)", "ran past (shrank)", "split into rooms", "reshaped", "deleted", "not saved"];
const keys = [...order.filter((k) => T[k]), ...Object.keys(T).filter((k) => !order.includes(k))];
console.log(`Find area clicks, version ${VER}+: ${logs.length}`);
console.log("fix".padEnd(36), "total  rules  AIcut  AIdrew");
for (const k of keys) console.log(k.padEnd(36), String(T[k].total).padStart(5), String(T[k].rules).padStart(6), String(T[k]["AI cut"]).padStart(6), String(T[k]["AI drew"]).padStart(7));
