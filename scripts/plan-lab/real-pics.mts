// @ts-nocheck
/** Pictures of real-replay rows: GROUP (filter name), N tiles, SEED for the sample; the user's outline green, today's red dashed. */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const rows = JSON.parse(readFileSync(process.env.FILE ?? "test-plans/_lab/real-replay.json", "utf-8"));
const A = (Q) => Math.abs(Q.reduce((a, q, i) => a + q[0] * Q[(i + 1) % Q.length][1] - Q[(i + 1) % Q.length][0] * q[1], 0)) / 2;
const groups = {
  small: (x) => x.found && x.grade !== "noedit" && x.offIn <= 6,
  mid: (x) => x.found && x.grade !== "noedit" && x.offIn > 6 && x.offIn <= 24,
  big: (x) => x.found && x.grade !== "noedit" && x.offIn > 24 && A(x.found) / A(x.user) > 1.3,
  shape: (x) => x.found && x.grade !== "noedit" && x.offIn > 24 && A(x.found) / A(x.user) <= 1.3 && A(x.found) / A(x.user) >= 0.77,
  tiny: (x) => x.found && x.grade !== "noedit" && x.offIn > 24 && A(x.found) / A(x.user) < 0.77,
  none: (x) => !x.found,
};
const all = rows.map((x, i) => ({ ...x, i })).filter(process.env.ROWS ? (x) => process.env.ROWS.split(",").map(Number).includes(x.i) : groups[process.env.GROUP]);
let seed = Number(process.env.SEED ?? 1);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = all.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, Number(process.env.N ?? 9)).map((p) => p[1]);
const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const sh = new Map((await db.takeoffSheet.findMany({ where: { id: { in: [...new Set(pick.map((p) => p.sheetId))] } }, select: { id: true, pageNumber: true, unitsPerFoot: true, plan: { select: { file: { select: { storagePath: true } } } } } })).map((s) => [s.id, s]));
await db.$disconnect();
const TW = 620, TH = 520, out = createCanvas(TW * 3, TH * Math.ceil(pick.length / 3)), oc = out.getContext("2d");
oc.fillStyle = "white"; oc.fillRect(0, 0, out.width, out.height);
for (const [t, r] of pick.entries()) {
  const s = sh.get(r.sheetId), upf = s.unitsPerFoot;
  const page = await (await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + s.plan.file.storagePath)), verbosity: 0 }).promise).getPage(s.pageNumber);
  const pts = [...r.user, ...(r.found ?? [])], xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), pad = 3 * upf;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, sc = Math.min(TW / (Math.max(...xs) + pad - x0), (TH - 24) / (Math.max(...ys) + pad - y0));
  const cv = createCanvas(TW, TH), g = cv.getContext("2d"); g.fillStyle = "white"; g.fillRect(0, 0, TW, TH);
  await page.render({ canvasContext: g, viewport: page.getViewport({ scale: sc, offsetX: -x0 * sc, offsetY: -y0 * sc + 24 }) }).promise;
  const ring = (P, col, lw, d = []) => { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(d); g.beginPath(); P.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc + 24)); g.closePath(); g.stroke(); g.setLineDash([]); };
  ring(r.user, "rgba(0,170,0,0.85)", 4); if (r.found) ring(r.found, "rgba(230,0,0,0.9)", 2, [6, 3]);
  g.fillStyle = "blue"; g.beginPath(); g.arc((r.click[0] - x0) * sc, (r.click[1] - y0) * sc + 24, 5, 0, 7); g.fill();
  g.fillStyle = "white"; g.fillRect(0, 0, TW, 24); g.fillStyle = "black"; g.font = "15px sans-serif";
  g.fillText(`r${r.i} ${r.sheet.slice(0, 28)} · off ${r.offIn ?? "-"}" · ${r.reason ?? ""}`, 6, 17);
  g.strokeStyle = "#888"; g.lineWidth = 1; g.strokeRect(0.5, 0.5, TW - 1, TH - 1);
  oc.drawImage(cv, (t % 3) * TW, Math.floor(t / 3) * TH);
}
writeFileSync(`test-plans/_lab/real-${process.env.GROUP}-${process.env.SEED ?? 1}.png`, out.toBuffer("image/png"));
console.log(process.env.GROUP, all.length, "rooms; drew", pick.length);
