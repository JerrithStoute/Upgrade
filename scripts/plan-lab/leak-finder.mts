// @ts-nocheck
/**
 * Plan lab: for every real room where today's Find area came out too big (from real-replay.json), find where the
 * floor escapes through the user's outline and say what's drawn there. Each escape = a stretch of the user's edge that
 * Find area runs well past (>6"). Causes: door swing read there / lines drawn across (wall not taken) / crack ≤6" /
 * opening 6"–4' with no swing (pocket, cased, bifold) / wide opening >4'.
 *   npx tsx --env-file-if-exists=.env scripts/plan-lab/leak-finder.mts      (PICS=cause N=9 draws samples)
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { PrismaClient } from "@prisma/client";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";

const rows = JSON.parse(readFileSync("test-plans/_lab/real-replay.json", "utf-8")).map((x, i) => ({ ...x, i }));
const A = (Q) => Math.abs(Q.reduce((a, q, i) => a + q[0] * Q[(i + 1) % Q.length][1] - Q[(i + 1) % Q.length][0] * q[1], 0)) / 2;
const sd = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const toPoly = (p, Q) => Math.min(...Q.map((q, k) => sd(p[0], p[1], q, Q[(k + 1) % Q.length])));
const inside = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) if (Q[i][1] > y !== Q[j][1] > y && x < ((Q[j][0] - Q[i][0]) * (y - Q[i][1])) / (Q[j][1] - Q[i][1]) + Q[i][0]) c = !c; return c; };
const big = rows.filter((x) => x.found && x.grade !== "noedit" && x.offIn > 6 && A(x.found) / A(x.user) > 1.1);

const db = new PrismaClient({ datasources: { db: { url: process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL } } });
const sh = new Map((await db.takeoffSheet.findMany({ where: { id: { in: [...new Set(big.map((p) => p.sheetId))] } }, select: { id: true, pageNumber: true, unitsPerFoot: true, plan: { select: { file: { select: { storagePath: true } } } } } })).map((s) => [s.id, s]));
await db.$disconnect();

const pages = new Map();
const sheetData = async (s) => {
  if (!pages.has(s.id)) {
    const page = await (await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + s.plan.file.storagePath)), verbosity: 0 }).promise).getPage(s.pageNumber);
    const doors = []; const segs = await extractSegments(pdfjs, page, undefined, [], doors);
    pages.set(s.id, { page, segs, doors });
  }
  return pages.get(s.id);
};

const out = [], T = {};
for (const r of big) {
  const s = sh.get(r.sheetId); if (!s) continue;
  const { segs, doors } = await sheetData(s);
  const upf = s.unitsPerFoot, inch = upf / 12, U = r.user, X = r.found;
  // Walk the user's edge at 1" steps; an escape is where Find area's floor goes on past it by more than 6".
  // Each step also notes whether a drawn line lies along the edge there (a wall face) — escapes split where that changes.
  const linedAt = (p, ux, uy) => { for (let i = 0; i < segs.length; i += 4) { const a = [segs[i], segs[i + 1]], b = [segs[i + 2], segs[i + 3]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < inch) continue; if (Math.abs(((b[0] - a[0]) * ux + (b[1] - a[1]) * uy) / L) < 0.94) continue; if (sd(p[0], p[1], a, b) <= 3 * inch) return true; } return false; };
  const runs = []; let cur = null;
  for (let k = 0; k < U.length; k++) {
    const a = U[k], b = U[(k + 1) % U.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / inch)), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    for (let t = 0; t < n; t++) {
      const p = [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n];
      if (!inside(p[0], p[1], X)) { cur = null; continue; }
      const dep = toPoly(p, X), ln = linedAt(p, ux, uy);
      if (dep <= (ln ? 6 : 4.5) * inch) { cur = null; continue; }
      if (!cur || cur.ln !== ln || cur.k !== k) runs.push((cur = { pts: [], ln, k }));
      cur.pts.push(p);
    }
  }
  // Pieces under 3" take their neighbours' kind (a door stop, a gap in a dashed face).
  for (let i = 1; i < runs.length - 1; i++) if (runs[i].pts.length < 3 && runs[i - 1].ln === runs[i + 1].ln && runs[i - 1].k === runs[i].k && runs[i + 1].k === runs[i].k) { runs[i - 1].pts.push(...runs[i].pts, ...runs[i + 1].pts); runs.splice(i, 2); i--; }
  const leaks = runs.map((g) => {
    const p0 = g.pts[0], p1 = g.pts[g.pts.length - 1], m = g.pts[g.pts.length >> 1], w = g.pts.length / 12; // feet
    const sw = doors.filter((d) => d.r >= 0.75 * upf && d.r <= 4.5 * upf && Math.hypot(m[0] - d.x, m[1] - d.y) <= d.r + 9 * inch && g.pts.some((p) => Math.hypot(p[0] - d.x, p[1] - d.y) <= d.r + 3 * inch));
    const cause = g.ln && !sw.length ? "wall" : sw.length ? (sw.length >= 2 ? "double door swing read" : sw[0].r < 1.5 * upf ? "small swing (<1'6\") read" : "door swing read")
      : w <= 0.5 ? "crack ≤6\""
      : w <= 4 ? "opening 6\"–4', no swing"
      : "wide opening >4'";
    return { cause, w: +w.toFixed(2), swings: sw.length, rs: sw.map((d) => +(d.r / upf).toFixed(2)), ends: sw.map((d) => !!(d.a && d.b)), p0, p1, m };
  });
  const gaps = leaks.filter((l) => l.cause !== "wall" && l.w >= 2 / 12);
  if (!leaks.length) { (T["no escape found (user drew inside / shape)"] ??= []).push(r.i); out.push({ i: r.i, sheet: r.sheet, cause: "none", leaks }); continue; }
  // The room's main cause = its widest opening; only through a drawn wall if there's no opening at all.
  const main = gaps.length ? gaps.slice().sort((a, b) => b.w - a.w)[0] : { cause: "through a drawn wall only" };
  (T[main.cause] ??= []).push(r.i);
  out.push({ i: r.i, sheet: r.sheet, sheetId: r.sheetId, cause: main.cause, extraSf: +((A(X) - A(U)) / upf / upf).toFixed(1), leaks });
}
const n = out.length;
console.log(`too-big rooms: ${n}`);
for (const [k, v] of Object.entries(T).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k.padEnd(42)} ${String(v.length).padStart(4)}  ${((100 * v.length) / n).toFixed(0)}%`);
const allLeaks = out.flatMap((o) => o.leaks), C = {};
for (const l of allLeaks) C[l.cause] = (C[l.cause] ?? 0) + 1;
console.log(`all escapes: ${allLeaks.length}`, C);
writeFileSync("test-plans/_lab/leaks.json", JSON.stringify(out));

if (process.env.PICS) {
  let seed = Number(process.env.SEED ?? 1); const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = out.filter((o) => o.cause.startsWith(process.env.PICS)).map((o) => [rnd(), o]).sort((a, b) => a[0] - b[0]).slice(0, Number(process.env.N ?? 9)).map((p) => p[1]);
  const TW = 620, TH = 520, cv = createCanvas(TW * 3, TH * Math.ceil(pick.length / 3)), oc = cv.getContext("2d");
  oc.fillStyle = "white"; oc.fillRect(0, 0, cv.width, cv.height);
  for (const [t, o] of pick.entries()) {
    const r = rows[o.i], s = sh.get(r.sheetId), upf = s.unitsPerFoot, { page } = await sheetData(s);
    const pts = [...r.user, ...r.found], xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), pad = 2 * upf;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, sc = Math.min(TW / (Math.max(...xs) + pad - x0), (TH - 24) / (Math.max(...ys) + pad - y0));
    const c = createCanvas(TW, TH), g = c.getContext("2d"); g.fillStyle = "white"; g.fillRect(0, 0, TW, TH);
    await page.render({ canvasContext: g, viewport: page.getViewport({ scale: sc, offsetX: -x0 * sc, offsetY: -y0 * sc + 24 }) }).promise;
    const P = (q) => [(q[0] - x0) * sc, (q[1] - y0) * sc + 24];
    const ring = (Q, col, lw, d = []) => { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(d); g.beginPath(); Q.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, ...P(q))); g.closePath(); g.stroke(); g.setLineDash([]); };
    ring(r.user, "rgba(0,170,0,0.85)", 4); ring(r.found, "rgba(230,0,0,0.9)", 2, [6, 3]);
    for (const l of o.leaks) { g.strokeStyle = "rgba(255,0,255,0.9)"; g.lineWidth = 9; g.beginPath(); g.moveTo(...P(l.p0)); g.lineTo(...P(l.p1)); g.stroke(); }
    g.fillStyle = "white"; g.fillRect(0, 0, TW, 24); g.fillStyle = "black"; g.font = "14px sans-serif";
    g.fillText(`r${o.i} ${o.sheet.slice(0, 22)} · ${o.leaks.map((l) => `${l.w}' ${l.cause.split(" ")[0]}`).join(", ")}`, 6, 17);
    g.strokeStyle = "#888"; g.lineWidth = 1; g.strokeRect(0.5, 0.5, TW - 1, TH - 1);
    oc.drawImage(c, (t % 3) * TW, Math.floor(t / 3) * TH);
  }
  const f = `test-plans/_lab/leaks-${process.env.PICS.split(" ")[0]}-${process.env.SEED ?? 1}.png`;
  writeFileSync(f, cv.toBuffer("image/png")); console.log("drew", pick.length, "->", f);
}
