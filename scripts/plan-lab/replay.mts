/**
 * Plan lab: replay logged Find area clicks (AreaFindLog) on a sheet with the candidate copy, and draw
 * what it gives now next to what it gave then — the user's own test, rerun.
 *
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/replay.mts <sheet id> <pdf> <out.png> [hours = 48]
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { extractSegments, type DoorSwing, type FillShape } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { findRoom } from "./candidate/room-detect";

const [sheetId, pdf, out, hoursS = "48"] = process.argv.slice(2);
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const logs = await db.areaFindLog.findMany({ where: { sheetId, createdAt: { gte: new Date(Date.now() - Number(hoursS) * 3_600_000) } }, orderBy: { createdAt: "asc" } });
await db.$disconnect();
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdf)), verbosity: 0 }).promise;
const page = await doc.getPage(1);
const fills: FillShape[] = [];
const swings: DoorSwing[] = [];
const segs = await extractSegments(pdfjs as never, page as never, undefined, fills, swings);
const now = logs.map((l) => findRoom(segs, [l.clickX, l.clickY], { unitsPerFoot: l.unitsPerFoot, fills, doors: process.env.NODOORS ? undefined : swings }));
const pts = logs.flatMap((l) => (l.outline ? (JSON.parse(l.outline) as number[][]) : [[l.clickX, l.clickY]]));
const box = { x: Math.min(...pts.map((p) => p[0])) - 40, y: Math.min(...pts.map((p) => p[1])) - 40, x1: Math.max(...pts.map((p) => p[0])) + 40, y1: Math.max(...pts.map((p) => p[1])) + 40 };
const W = 900;
const S = W / Math.max(box.x1 - box.x, box.y1 - box.y);
const cv = createCanvas(2 * W + 20, W);
const ctx = cv.getContext("2d");
ctx.fillStyle = "#888";
ctx.fillRect(0, 0, cv.width, cv.height);
const cols = ["230,25,75", "60,180,75", "255,136,0", "145,30,180", "0,128,128", "240,50,230", "0,90,255"];
for (const [k, label] of [[0, "then"], [1, "now (copy)"]] as const) {
  const pc = createCanvas(W, W);
  const p = pc.getContext("2d");
  p.fillStyle = "white";
  p.fillRect(0, 0, W, W);
  await page.render({ canvasContext: p as never, viewport: page.getViewport({ scale: S, offsetX: -box.x * S, offsetY: -box.y * S }) } as never).promise;
  logs.forEach((l, i) => {
    const o = k === 0 ? (l.outline ? (JSON.parse(l.outline) as number[][]) : null) : now[i].ok ? (now[i] as { outline: number[][] }).outline : null;
    const c = cols[i % cols.length];
    if (o) {
      p.fillStyle = `rgba(${c},0.25)`;
      p.strokeStyle = `rgb(${c})`;
      p.lineWidth = 2;
      p.beginPath();
      o.forEach(([x, y], j) => (j ? p.lineTo((x - box.x) * S, (y - box.y) * S) : p.moveTo((x - box.x) * S, (y - box.y) * S)));
      p.closePath();
      p.fill();
      p.stroke();
    }
    p.fillStyle = "black";
    p.font = "bold 13px Arial";
    p.fillText(`${i + 1}`, (l.clickX - box.x) * S, (l.clickY - box.y) * S);
  });
  p.font = "bold 20px Arial";
  p.fillText(label, 10, 24);
  ctx.drawImage(pc as never, k * (W + 20), 0);
}
writeFileSync(out, await cv.encode("png"));
logs.forEach((l, i) => console.log(`#${i + 1} then ${l.ok ? l.areaSf!.toFixed(0) : l.reason}  now ${now[i].ok ? (now[i] as { areaSf: number }).areaSf.toFixed(0) : (now[i] as { reason: string }).reason}`));
