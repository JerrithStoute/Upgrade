/**
 * Plan lab: how often Find area's rooms come back with rounded/cut corners that the user then squares up.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/corner-fixes.mts [days = 60]
 * For each Find area room still on the plan but changed: the found outline's "corner bits" (short edges, under 18",
 * not straight up/down or across — a corner cut or rounded) vs the same count on the area as it is now.
 */
import { PrismaClient } from "@prisma/client";
const days = Number(process.argv[2] ?? 60);
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ where: { createdAt: { gte: new Date(Date.now() - days * 86_400_000) }, ok: true, measurementId: { not: null } }, select: { version: true, outline: true, measurementId: true, unitsPerFoot: true } });
const now = new Map((await db.takeoffMeasurement.findMany({ where: { id: { in: logs.map((l) => l.measurementId!) } }, select: { id: true, points: true } })).map((m) => [m.id, m.points]));
const pts = (j: string | null): number[][] => { try { const p = JSON.parse(j ?? "[]"); const a = Array.isArray(p) ? p : p.points ?? []; const h = a.findIndex((q: number[]) => q[2] === 2); return (h < 0 ? a : a.slice(0, h)).map((q: number[]) => [q[0], q[1]]); } catch { return []; } };
const bits = (ring: number[][], upf: number) => {
  let n = 0, corners = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const square = dx / len < 0.02 || dy / len < 0.02;
    if (!square && len < 1.5 * upf) n++;
    if (square) corners++;
  }
  return { n, corners };
};
const by: Record<string, { rooms: number; changed: number; foundBits: number; roomsWithBits: number; fixedBits: number; nowBits: number }> = {};
for (const l of logs) {
  const v = l.version.replace(/\+ai.*/, "+ai");
  const s = (by[v] ??= { rooms: 0, changed: 0, foundBits: 0, roomsWithBits: 0, fixedBits: 0, nowBits: 0 });
  const cur = now.get(l.measurementId!);
  if (!cur) continue;
  s.rooms++;
  const f = pts(l.outline), c = pts(cur);
  const fb = bits(f, l.unitsPerFoot).n, cb = bits(c, l.unitsPerFoot).n;
  s.foundBits += fb; if (fb) s.roomsWithBits++;
  const changed = f.length !== c.length || f.some((p, i) => Math.abs(p[0] - c[i][0]) > 0.5 || Math.abs(p[1] - c[i][1]) > 0.5);
  if (changed) { s.changed++; s.fixedBits += Math.max(0, fb - cb); s.nowBits += cb; }
}
console.log("version | rooms still on plan | changed by you | rooms with cut/rounded corner bits | bits found | bits you removed");
for (const [v, s] of Object.entries(by).sort()) console.log(v.padEnd(22), s.rooms, s.changed, s.roomsWithBits, s.foundBits, s.fixedBits);
await db.$disconnect();
