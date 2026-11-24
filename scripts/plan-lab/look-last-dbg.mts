// @ts-nocheck
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import * as B from "./candidate/room-detect";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const [l] = await db.areaFindLog.findMany({ orderBy: { createdAt: "desc" }, skip: +(process.env.SKIP ?? 0), take: 1, select: { clickX: true, clickY: true, unitsPerFoot: true, sheet: { select: { pageNumber: true, plan: { select: { file: { select: { storagePath: true } } } } } } } });
await db.$disconnect();
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + l.sheet.plan.file.storagePath)), verbosity: 0 }).promise;
const page = await doc.getPage(l.sheet.pageNumber); const fills = [], sw = [];
const segs = await extractSegments(pdfjs, page, undefined, fills, sw);
globalThis.__mid = []; globalThis.__runs = [];
const r = B.findRoom(segs, [l.clickX, l.clickY], { unitsPerFoot: l.unitsPerFoot, fills, doors: sw });
const inch = l.unitsPerFoot / 12, f = (v) => (v / inch).toFixed(1);
console.log("click", l.clickX, l.clickY, "inch", inch);
for (const m of globalThis.__mid) console.log(`ang ${(m.b.ang*180/Math.PI).toFixed(0)} rho ${f(m.b.rho)} half ${f(m.b.half)} span ${f(m.o0)}..${f(m.o1)} (${f(m.o1-m.o0)}) side ${f(Math.min(m.sa,m.sc))}..${f(Math.max(m.sa,m.sc))} cut ${f(m.lo)}..${f(m.hi)}`);
console.log(JSON.stringify(globalThis.__runs));
