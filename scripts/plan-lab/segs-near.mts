// @ts-nocheck
/** Drawn lines in a box on the last Find area click's sheet (inches from page origin): X0 X1 Y0 Y1 env. */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const [l] = await db.areaFindLog.findMany({ orderBy: { createdAt: "desc" }, take: 1, select: { unitsPerFoot: true, sheet: { select: { pageNumber: true, plan: { select: { file: { select: { storagePath: true } } } } } } } });
await db.$disconnect();
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise;
const page = await doc.getPage(l.sheet.pageNumber);
const segs = await extractSegments(pdfjs, page, undefined, [], []);
const inch = l.unitsPerFoot / 12, [X0, X1, Y0, Y1] = process.argv.slice(2).map(Number);
for (let i = 0; i + 3 < segs.length; i += 4) {
  const xs = [segs[i], segs[i + 2]].map((v) => v / inch), ys = [segs[i + 1], segs[i + 3]].map((v) => v / inch);
  if (Math.max(...xs) < X0 || Math.min(...xs) > X1 || Math.max(...ys) < Y0 || Math.min(...ys) > Y1) continue;
  console.log(xs.map((v) => v.toFixed(1)).join(","), ys.map((v) => v.toFixed(1)).join(","));
}
