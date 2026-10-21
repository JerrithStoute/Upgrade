/**
 * Plan lab: the answer key. Every room Find area found that the builder kept (or split — right, but two
 * rooms in one) is a right answer; this clicks each one again with the copy being worked on and says
 * which come out different. Run before any change to the room finder reaches the app: nothing ships
 * that makes a room that was right come out wrong.
 *
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/answer-key.mts [--app]
 *
 * --app checks the app's own room finder instead of the copy (scripts/plan-lab/candidate). Reads this
 * computer's database and uploads (every company's rows, the system login). Exits 1 when any differ.
 *
 * A room the rules were changed on purpose for (the user: "the pantry is its own room" — so a kitchen kept
 * with the pantry in it is now smaller) is accepted once it's been looked at: --accept saves the rooms
 * different now, with what they come out as, in test-plans/_lab/answer-key-accepted.json; after that each
 * counts as right while it keeps coming out that way.
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, type DoorSwing, type FillShape } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { outcomeOf, polygonArea, readPoints, type ShapeNow } from "../../src/lib/find-area-score";
import { findRoom as appFind } from "../../src/lib/room-detect";
import { findRoom as copyFind } from "./candidate/room-detect";

const findRoom = process.argv.includes("--app") ? appFind : copyFind;
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({
  where: { ok: true, measurementId: { not: null } },
  orderBy: { createdAt: "asc" },
  select: {
    version: true,
    ok: true,
    reason: true,
    outline: true,
    measurementId: true,
    sheetId: true,
    conditionId: true,
    ms: true,
    createdAt: true,
    clickX: true,
    clickY: true,
    unitsPerFoot: true,
    project: { select: { name: true } },
    sheet: { select: { name: true, pageNumber: true, plan: { select: { name: true, file: { select: { storagePath: true } } } } } },
  },
});
const shapes: ShapeNow[] = await db.takeoffMeasurement.findMany({
  where: { sheetId: { in: [...new Set(logs.map((l) => l.sheetId))] } },
  select: { id: true, sheetId: true, conditionId: true, points: true, createdAt: true },
});
await db.$disconnect();
const now = new Map(shapes.map((m) => [m.id, m]));

// The right answers: kept or split — each room once (the same room clicked twice, its area to 1%, is one answer).
const seen: { sheetId: string; area: number }[] = [];
const key = logs.filter((l) => {
  const o = outcomeOf(l, now, shapes);
  if (o !== "kept" && o !== "split") return false;
  const area = polygonArea(readPoints(l.outline));
  if (seen.some((x) => x.sheetId === l.sheetId && Math.abs(x.area - area) <= 0.01 * area)) return false;
  seen.push({ sheetId: l.sheetId, area });
  return true;
});
const ACCEPTED = join(process.cwd(), "test-plans", "_lab", "answer-key-accepted.json");
const accepted: Record<string, number | string> = existsSync(ACCEPTED) ? JSON.parse(readFileSync(ACCEPTED, "utf8")) : {};
const toAccept: Record<string, number | string> = {};
let acceptedNow = 0;

const sheets = new Map<string, { segs: Float32Array; fills: FillShape[]; swings: DoorSwing[] }>();
let same = 0;
const differ: string[] = [];
for (const l of key) {
  const path = l.sheet.plan.file.storagePath;
  const k = `${path}#${l.sheet.pageNumber}`;
  if (!sheets.has(k)) {
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(process.cwd(), "uploads", path))), verbosity: 0 });
    const doc = await task.promise;
    const fills: FillShape[] = [];
    const swings: DoorSwing[] = [];
    const segs = await extractSegments(pdfjs as never, (await doc.getPage(l.sheet.pageNumber)) as never, undefined, fills, swings);
    sheets.set(k, { segs, fills, swings });
    await task.destroy();
  }
  const { segs, fills, swings } = sheets.get(k)!;
  const r = findRoom(segs, [l.clickX, l.clickY], { unitsPerFoot: l.unitsPerFoot, fills, doors: swings });
  const was = polygonArea(readPoints(l.outline)) / l.unitsPerFoot ** 2;
  // The same room: its area to 1% (or ½ sf, a closet).
  const matches = (sf: number) => r.ok && Math.abs(r.areaSf - sf) <= Math.max(0.01 * sf, 0.5);
  const id = `${l.sheetId}@${l.clickX.toFixed(0)},${l.clickY.toFixed(0)}`;
  const ok = accepted[id];
  if (matches(was)) same++;
  else if (ok !== undefined && (typeof ok === "number" ? matches(ok) : !r.ok && r.reason === ok)) acceptedNow++;
  else {
    toAccept[id] = r.ok ? r.areaSf : r.reason;
    differ.push(
      `  ${l.project.name} › ${l.sheet.plan.name} p${l.sheet.pageNumber} at ${l.clickX.toFixed(0)},${l.clickY.toFixed(0)}: was ${was.toFixed(1)} sf, now ${r.ok ? `${r.areaSf.toFixed(1)} sf` : r.reason}`,
    );
  }
}
console.log(
  `Answer key (${process.argv.includes("--app") ? "the app" : "the copy"}): ${key.length} rooms kept by builders — ${same} still the same${acceptedNow ? `, ${acceptedNow} changed on purpose (accepted)` : ""}, ${differ.length} different.`,
);
if (differ.length) {
  console.log(differ.join("\n"));
  if (process.argv.includes("--accept")) {
    writeFileSync(ACCEPTED, JSON.stringify({ ...accepted, ...toAccept }, null, 1));
    console.log(`Accepted those ${differ.length} as changed on purpose.`);
  } else process.exitCode = 1;
}
