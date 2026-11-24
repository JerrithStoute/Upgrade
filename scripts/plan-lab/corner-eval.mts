/**
 * Plan lab: re-clicks every Find area room the user later squared up (corner bits found, fewer now) with the app's
 * room finder, and says how many corner bits it gives now and how close its area is to the user's fixed one.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/corner-eval.mts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, type DoorSwing, type FillShape } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { polygonArea, readPoints } from "../../src/lib/find-area-score";
import { findRoom } from "../../src/lib/room-detect";

const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({
  where: { ok: true, measurementId: { not: null } },
  select: { version: true, outline: true, measurementId: true, clickX: true, clickY: true, unitsPerFoot: true, sheet: { select: { pageNumber: true, plan: { select: { file: { select: { storagePath: true } } } } } } },
});
const now = new Map((await db.takeoffMeasurement.findMany({ where: { id: { in: logs.map((l) => l.measurementId!) } }, select: { id: true, points: true } })).map((m) => [m.id, m.points]));
await db.$disconnect();
const bits = (ring: number[][], upf: number) => {
  let n = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), len = Math.hypot(dx, dy);
    if (len > 0.01 && dx / len > 0.02 && dy / len > 0.02 && len < 1.5 * upf) n++;
  }
  return n;
};
const sheets = new Map<string, { segs: Float32Array; fills: FillShape[]; swings: DoorSwing[] }>();
let n = 0, before = 0, after = 0, user = 0, closer = 0, farther = 0, errBefore = 0, errAfter = 0, lost = 0;
for (const l of logs) {
  const cur = now.get(l.measurementId!);
  if (!cur) continue;
  const f = readPoints(l.outline), c = readPoints(cur);
  const fb = bits(f, l.unitsPerFoot), cb = bits(c, l.unitsPerFoot);
  if (!fb || cb >= fb) continue; // only rooms the user squared up
  const k = `${l.sheet.plan.file.storagePath}#${l.sheet.pageNumber}`;
  if (!sheets.has(k)) {
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(process.cwd(), "uploads", l.sheet.plan.file.storagePath))), verbosity: 0 });
    const doc = await task.promise;
    const fills: FillShape[] = [], swings: DoorSwing[] = [];
    const segs = await extractSegments(pdfjs as never, (await doc.getPage(l.sheet.pageNumber)) as never, undefined, fills, swings);
    sheets.set(k, { segs, fills, swings });
    await task.destroy();
  }
  const s = sheets.get(k)!;
  const r = findRoom(s.segs, [l.clickX, l.clickY], { unitsPerFoot: l.unitsPerFoot, fills: s.fills, doors: s.swings });
  n++;
  before += fb;
  user += cb;
  const sf = (p: number[][]) => polygonArea(p as [number, number][]) / l.unitsPerFoot ** 2;
  const want = sf(c), was = sf(f);
  errBefore += Math.abs(was - want);
  if (!r.ok) { lost++; continue; }
  after += bits(r.outline, l.unitsPerFoot);
  if (process.env.SHOW && bits(r.outline, l.unitsPerFoot) && n % 7 === 0) { const o = r.outline, u = l.unitsPerFoot / 12; const d = o.map((p, i) => { const q = o[(i + 1) % o.length]; return `${(Math.hypot(q[0] - p[0], q[1] - p[1]) / u).toFixed(1)}"@${(Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI).toFixed(0)}`; }); console.log(d.join(" ")); }
  const e = Math.abs(r.areaSf - want);
  errAfter += e;
  if (e < Math.abs(was - want) - 0.2) closer++;
  else if (e > Math.abs(was - want) + 0.2) farther++;
}
console.log(`${n} rooms you squared up. Corner bits: when found ${before}, after your fix ${user}, the room finder now ${after}. Area vs yours: closer ${closer}, farther ${farther}, no room now ${lost}. Total sf off: was ${errBefore.toFixed(0)}, now ${errAfter.toFixed(0)}.`);
