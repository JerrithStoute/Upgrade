/**
 * Plan lab: what people did with Find area's rooms (AreaFindLog), read against what's on the plan now.
 *
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/find-area-log.mts [days = 30]
 *
 * For each logged click that added an area, the area today is:
 *   - kept: still there, the same outline (the room finder got it right, or close enough);
 *   - changed: still there, outline different (split, or corners moved — it was off);
 *   - removed: gone (undone with Ctrl+Z, or deleted — it was wrong);
 * and clicks that found no room are listed with why. Prints totals by version, and the changed and
 * removed ones (job, sheet, where clicked) — the list to work from. Reads every company's rows
 * (the system login); prints nothing anyone outside could identify beyond job and sheet names.
 */
import { PrismaClient } from "@prisma/client";

const days = Number(process.argv[2] ?? 30);
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const since = new Date(Date.now() - days * 86_400_000);
const logs = await db.areaFindLog.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: "asc" },
  select: { id: true, version: true, ok: true, reason: true, areaSf: true, outline: true, measurementId: true, clickX: true, clickY: true, createdAt: true, project: { select: { name: true } }, sheet: { select: { name: true, pageNumber: true, plan: { select: { name: true } } } } },
});
const ids = logs.map((l) => l.measurementId).filter((x): x is string => !!x);
const now = new Map((await db.takeoffMeasurement.findMany({ where: { id: { in: ids } }, select: { id: true, points: true } })).map((m) => [m.id, m.points]));

const pts = (json: string | null): number[][] => {
  try {
    const p = JSON.parse(json ?? "[]");
    return Array.isArray(p) ? p : (p.points ?? []);
  } catch {
    return [];
  }
};
const same = (a: number[][], b: number[][]) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.5 && Math.abs(p[1] - b[i][1]) < 0.5);

type Row = (typeof logs)[number] & { outcome: string };
const rows: Row[] = logs.map((l) => {
  if (!l.ok) return { ...l, outcome: `no room (${l.reason})` };
  if (!l.measurementId) return { ...l, outcome: "not saved" };
  const cur = now.get(l.measurementId);
  if (cur === undefined) return { ...l, outcome: "removed" };
  return { ...l, outcome: same(pts(l.outline), pts(cur)) ? "kept" : "changed" };
});

console.log(`Find area clicks, last ${days} days: ${rows.length}`);
const versions = [...new Set(rows.map((r) => r.version))];
for (const v of versions) {
  const vr = rows.filter((r) => r.version === v);
  const tally = new Map<string, number>();
  for (const r of vr) tally.set(r.outcome, (tally.get(r.outcome) ?? 0) + 1);
  console.log(`  version ${v}: ${[...tally].map(([k, n]) => `${k} ${n}`).join(", ")}`);
}
const fix = rows.filter((r) => r.outcome === "changed" || r.outcome === "removed" || r.outcome.startsWith("no room"));
if (fix.length) {
  console.log("\nTo look at (the room finder was off, or found nothing):");
  for (const r of fix)
    console.log(`  ${r.createdAt.toISOString().slice(0, 16)}  ${r.outcome.padEnd(18)} ${r.areaSf ? `${r.areaSf.toFixed(0)} sf` : ""}  ${r.project.name} › ${r.sheet.plan.name} p${r.sheet.pageNumber}  at ${r.clickX.toFixed(0)},${r.clickY.toFixed(0)}`);
}
await db.$disconnect();
