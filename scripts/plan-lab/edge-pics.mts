// @ts-nocheck
/** Plan lab: rooms whose worst corner is 2"–6" off (from a real-replay file): a close-up of that corner. FILE, N, SEED, LO/HI inches. */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const rows = JSON.parse(readFileSync(process.env.FILE ?? "test-plans/_lab/rr-tub.json", "utf-8")).map((x, i) => ({ ...x, i }));
const sd = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const toPoly = (p, Q) => Math.min(...Q.map((q, k) => sd(p[0], p[1], q, Q[(k + 1) % Q.length])));
const LO = Number(process.env.LO ?? 2), HI = Number(process.env.HI ?? 6);
const pool = rows.filter((x) => x.found && x.grade !== "noedit" && x.offIn > LO && x.offIn <= HI);
let seed = Number(process.env.SEED ?? 1); const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = pool.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, Number(process.env.N ?? 12)).map((p) => p[1]);
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const sh = new Map((await db.takeoffSheet.findMany({ where: { id: { in: [...new Set(pick.map((p) => p.sheetId))] } }, select: { id: true, pageNumber: true, unitsPerFoot: true, plan: { select: { file: { select: { storagePath: true } } } } } })).map((s) => [s.id, s]));
await db.$disconnect();
const T = 460, cv = createCanvas(T * 4, (T + 22) * Math.ceil(pick.length / 4)), oc = cv.getContext("2d"); oc.fillStyle = "white"; oc.fillRect(0, 0, cv.width, cv.height);
for (const [t, r] of pick.entries()) {
  const s = sh.get(r.sheetId), upf = s.unitsPerFoot;
  // worst point: either outline's vertex farthest from the other
  const cand = [...r.found.map((p) => [p, toPoly(p, r.user)]), ...r.user.map((p) => [p, toPoly(p, r.found)])].sort((a, b) => b[1] - a[1])[0][0];
  const R = 2.5 * upf, x0 = cand[0] - R, y0 = cand[1] - R, sc = T / (2 * R);
  const page = await (await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + s.plan.file.storagePath)), verbosity: 0 }).promise).getPage(s.pageNumber);
  const c = createCanvas(T, T + 22), g = c.getContext("2d"); g.fillStyle = "white"; g.fillRect(0, 0, T, T + 22);
  await page.render({ canvasContext: g, viewport: page.getViewport({ scale: sc, offsetX: -x0 * sc, offsetY: -y0 * sc + 22 }) }).promise;
  const ring = (Q, col, lw, d = []) => { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(d); g.beginPath(); Q.forEach((q, k) => (k ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc + 22)); g.closePath(); g.stroke(); g.setLineDash([]); };
  ring(r.user, "rgba(0,170,0,0.75)", 6); ring(r.found, "rgba(230,0,0,0.95)", 2, [6, 3]);
  g.fillStyle = "white"; g.fillRect(0, 0, T, 22); g.fillStyle = "black"; g.font = "13px sans-serif"; g.fillText(`r${r.i} ${r.sheet.slice(0, 30)} · ${r.offIn}"`, 4, 15);
  g.strokeStyle = "#888"; g.lineWidth = 1; g.strokeRect(0.5, 0.5, T - 1, T + 21);
  oc.drawImage(c, (t % 4) * T, Math.floor(t / 4) * (T + 22));
}
const f = `test-plans/_lab/edges-${LO}-${HI}-${process.env.SEED ?? 1}.png`; writeFileSync(f, cv.toBuffer("image/png")); console.log(pool.length, "rooms; drew", pick.length, "->", f);
