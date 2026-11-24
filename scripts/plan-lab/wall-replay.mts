// @ts-nocheck
/**
 * Plan lab: replays every logged Find walls click (WallFindLog) with today's finder and a test copy, and scores each
 * against the walls on the sheet now (as the user left them): pieces that match one of the user's walls end to end
 * (within 2"), feet on a user's wall, feet on none.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/wall-replay.mts [candidate file]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { houseOutsideMap } from "../../src/lib/room-detect";
import * as A from "../../src/lib/wall-detect";
const B = await import(process.argv[2] ?? "./candidate/wall-detect8");
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.wallFindLog.findMany({ where: { ok: true }, orderBy: { createdAt: "asc" },
  select: { clickX: true, clickY: true, unitsPerFoot: true, sheetId: true, sheet: { select: { pageNumber: true, plan: { select: { name: true, file: { select: { storagePath: true } } } } } } } });
const walls = await db.takeoffMeasurement.findMany({ where: { sheetId: { in: [...new Set(logs.map((l) => l.sheetId))] }, condition: { type: "WALL" } }, select: { sheetId: true, points: true } });
await db.$disconnect();
const pts = (j) => { const p = JSON.parse(j); return (Array.isArray(p) ? p : p.points ?? []).map((q) => [q[0], q[1]]); };
const dseg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const T = { A: { runs: 0, exact: 0, good: 0, extra: 0 }, B: { runs: 0, exact: 0, good: 0, extra: 0 } };
const rows = [];
const bySheet = new Map();
for (const l of logs) (bySheet.get(l.sheetId) ?? bySheet.set(l.sheetId, []).get(l.sheetId)).push(l);
for (const [sid, ls] of bySheet) {
  const user = walls.filter((w) => w.sheetId === sid).map((w) => pts(w.points)).filter((p) => p.length >= 2);
  if (!user.length) continue;
  const s = ls[0].sheet, upf = ls[0].unitsPerFoot, inch = upf / 12;
  let segs, swings;
  try { const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + s.plan.file.storagePath)), verbosity: 0 }).promise; swings = []; segs = await extractSegments(pdfjs as never, (await doc.getPage(s.pageNumber)) as never, undefined, undefined, swings); } catch { continue; }
  const outside = houseOutsideMap(segs, { unitsPerFoot: upf }) ?? undefined;
  const userEnds = user.map((p) => [p[0], p[p.length - 1]]);
  const per = { A: { exact: 0, runs: 0, good: 0, extra: 0 }, B: { exact: 0, runs: 0, good: 0, extra: 0 } };
  for (const l of ls) for (const [k, F] of [["A", A], ["B", B]]) {
    const r = F.findWalls(segs, [l.clickX, l.clickY], { unitsPerFoot: upf, clickRadius: 4 * inch, outside, doors: swings });
    if (!r.ok) continue;
    for (const run of r.runs) {
      const a = run[0], b = run[run.length - 1];
      const ex = userEnds.some(([p, q]) => (Math.hypot(p[0] - a[0], p[1] - a[1]) <= 2 * inch && Math.hypot(q[0] - b[0], q[1] - b[1]) <= 2 * inch) || (Math.hypot(p[0] - b[0], p[1] - b[1]) <= 2 * inch && Math.hypot(q[0] - a[0], q[1] - a[1]) <= 2 * inch));
      T[k].runs++; T[k].exact += ex ? 1 : 0; per[k].runs++; per[k].exact += ex ? 1 : 0;
      for (let i = 0; i + 1 < run.length; i++) { const [p, q] = [run[i], run[i + 1]], len = Math.hypot(q[0] - p[0], q[1] - p[1]); for (let t = 0.5 * upf; t < len; t += upf) { const x = p[0] + ((q[0] - p[0]) * t) / len, y = p[1] + ((q[1] - p[1]) * t) / len; if (user.some((u) => u.some((_, m) => m + 1 < u.length && dseg(x, y, u[m], u[m + 1]) <= 3 * inch))) { T[k].good++; per[k].good++; } else { T[k].extra++; per[k].extra++; } } }
    }
  }
  rows.push(`${s.plan.name.slice(0, 30).padEnd(30)} clicks ${String(ls.length).padStart(3)}  exact pieces today ${per.A.exact}/${per.A.runs}  test ${per.B.exact}/${per.B.runs}   good ${per.A.good}->${per.B.good}  extra ${per.A.extra}->${per.B.extra}`);
}
console.log(rows.join("\n"));
console.log("TODAY", JSON.stringify(T.A), "\nTEST ", JSON.stringify(T.B));
