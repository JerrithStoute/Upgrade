// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const l = await db.areaFindLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { createdAt: true, version: true, ok: true, clickX: true, clickY: true, sheet: { select: { pageNumber: true, plan: { select: { name: true } } } } } });
for (const x of l) console.log(x.createdAt.toISOString(), x.version, x.ok, x.sheet.plan.name, "p" + x.sheet.pageNumber, Math.round(x.clickX), Math.round(x.clickY));
await db.$disconnect();
