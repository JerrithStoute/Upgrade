// @ts-nocheck
/** Plan lab: old vs new room finder on a subset of a real-replay file (all misses with offIn ≤ MAXOFF + KEEP random no-edit
 * rooms), graded against the same saved outlines in one pass. OLD = module path. Prints better/worse lists. */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
if (process.env.NOTICK) globalThis.__noTick = true;
import { findRoom as NEW } from "../../src/lib/room-detect/index.ts";
const VARS = ["hinged","twin","dimstud","sq8","long","slab8","inwall","slabswap","snap","inline","chain"];
const PICK = process.env.PICK ? new Set(JSON.parse(readFileSync(process.env.PICK, "utf-8"))) : null;
const changed = []; const tally = Object.fromEntries(VARS.map((v) => [v, { fix: 0, brk: 0, fixL: [], brkL: [] }]));
const { findRoom: OLD } = await import(process.env.OLD ?? "../../src/lib/room-detect/_old.ts");
const rows = JSON.parse(readFileSync(process.env.FILE ?? "test-plans/_lab/rr-tub.json", "utf-8")).map((x, i) => ({ ...x, i }));
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const miss = rows.filter((x) => x.grade !== "noedit" && (x.offIn ?? 999) <= Number(process.env.MAXOFF ?? 24));
const ok = rows.filter((x) => x.grade === "noedit").map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, Number(process.env.KEEP ?? 600)).map((p) => p[1]);
let set = [...miss, ...ok].sort((a, b) => (a.sheetId < b.sheetId ? -1 : a.sheetId > b.sheetId ? 1 : 0));
if (PICK) set = set.filter((r) => PICK.has(r.i));
const sd = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const toPoly = (p, Q) => Math.min(...Q.map((q, k) => sd(p[0], p[1], q, Q[(k + 1) % Q.length])));
const inside = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if (Q[i][1] > y !== Q[j][1] > y && x < ((Q[j][0] - Q[i][0]) * (y - Q[i][1])) / (Q[j][1] - Q[i][1]) + Q[i][0]) c = !c; return c; };
const corners = (Q) => Q.filter((p, i) => { const a = Q[(i + Q.length - 1) % Q.length], b = Q[(i + 1) % Q.length]; const c = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]); const l = Math.hypot(p[0] - a[0], p[1] - a[1]) * Math.hypot(b[0] - p[0], b[1] - p[1]); return l > 0 && Math.abs(c) / l > 0.05; });
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const sh = new Map((await db.takeoffSheet.findMany({ where: { id: { in: [...new Set(set.map((p) => p.sheetId))] } }, select: { id: true, pageNumber: true, unitsPerFoot: true, plan: { select: { file: { select: { storagePath: true } } } } } })).map((s) => [s.id, s]));
await db.$disconnect();
const cache = new Map();
const grade = (r, X, U, doors, upf) => {
  if (!r.ok) return 99; const inch = upf / 12;
  const atDoor = (q) => doors.some((d) => d.a && d.b && d.r >= 1.5 * upf && d.r <= 4 * upf && [d.a, d.b].some((e) => { const L = Math.hypot(e[0] - d.x, e[1] - d.y), ux = (e[0] - d.x) / L, uy = (e[1] - d.y) / L; const t = (q[0] - d.x) * ux + (q[1] - d.y) * uy, o = Math.abs((q[0] - d.x) * -uy + (q[1] - d.y) * ux); return o <= 6 * inch && t >= -6 * inch && t <= L + 6 * inch; }));
  const xc = corners(X).filter((q) => !(atDoor(q) && !inside(q[0], q[1], U) && toPoly(q, U) <= 4.5 * inch));
  const uc = corners(U).filter((q) => !(atDoor(q) && inside(q[0], q[1], X) && toPoly(q, X) <= 4.5 * inch));
  return Math.max(0, ...xc.map((p) => toPoly(p, U)), ...uc.map((p) => toPoly(p, X))) / inch;
};
let better = [], worse = [], nOld = 0, nNew = 0;
for (const r of set) {
  const s = sh.get(r.sheetId); if (!s) continue;
  const key = s.id;
  if (!cache.has(key)) { if (cache.size > 6) cache.delete(cache.keys().next().value); const page = await (await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + s.plan.file.storagePath)), verbosity: 0 }).promise).getPage(s.pageNumber); const fills = [], doors = []; const segs = await extractSegments(pdfjs, page, undefined, fills, doors); let doorsOld = doors; if (process.env.DOORAB) { globalThis.__noChainArcs = true; doorsOld = []; await extractSegments(pdfjs, page, undefined, [], doorsOld); globalThis.__noChainArcs = false; } cache.set(key, { segs, fills, doors, doorsOld }); }
  const { segs, fills, doors, doorsOld } = cache.get(key), upf = s.unitsPerFoot, o = { unitsPerFoot: upf, fills, doors, budgetMs: Number(process.env.BUDGET ?? 2500) };
  const a = OLD(segs, r.click, { ...o, doors: doorsOld }), b = NEW(segs, r.click, o);
  const ga = grade(a, a.outline, r.user, doors, upf), gb = grade(b, b.outline, r.user, doors, upf);
  if (ga <= 2) nOld++; if (gb <= 2) nNew++;
  if ((ga <= 2) !== (gb <= 2)) changed.push(r.i);
  if (PICK && (ga <= 2) !== (gb <= 2)) for (const v of VARS) {
    let c;
    if (v === "chain") c = NEW(segs, r.click, { ...o, doors: doorsOld });
    else { globalThis.__rdOff = new Set([v]); c = NEW(segs, r.click, o); globalThis.__rdOff = undefined; }
    const gc = grade(c, c.outline, r.user, doors, upf);
    // Turning v off: if a fixed room goes back wrong, v was the fix; if a broken room comes right, v broke it.
    if (gb <= 2 && gc > 2) { tally[v].fix++; tally[v].fixL.push(r.i); }
    if (gb > 2 && gc <= 2) { tally[v].brk++; tally[v].brkL.push(`r${r.i} ${r.sheet} ${ga.toFixed(1)}->${gb.toFixed(1)}`); }
  }
  if (ga > 2 && gb <= 2) better.push(`r${r.i} ${ga.toFixed(1)}->${gb.toFixed(1)}`);
  if (ga <= 2 && gb > 2) worse.push(`r${r.i} ${r.sheet} ${ga.toFixed(1)}->${gb.toFixed(1)}`);
}
console.log(`rooms ${set.length}: within 2" old ${nOld}, new ${nNew}; became right ${better.length}, broke ${worse.length}`);
console.log("BROKE\n" + worse.join("\n"));

import { writeFileSync } from "fs";
if (!PICK) writeFileSync("test-plans/_lab/changed.json", JSON.stringify(changed));
else for (const v of VARS) console.log(`${v}: fixes ${tally[v].fix}, breaks ${tally[v].brk}` + tally[v].brkL.map((x) => "\n  " + x).join(""));
