// @ts-nocheck
/**
 * Plan lab: every 45Â° wall the user drew (WALL measurements with a slanted piece, â‰¥ 1.5'), clicked with Find walls
 * on its middle: did it find that wall, and if not, why (reason, what it found instead).
 *   npx tsx scripts/plan-lab/diag45.mts
 */
import { readFileSync, writeFileSync } from "fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { houseOutsideMap } from "../../src/lib/room-detect";
import { createCanvas } from "@napi-rs/canvas";
import { findWalls as today } from "../../src/lib/wall-detect/_dbg";
const findWalls = process.env.CAND ? (await import(process.env.CAND)).findWalls : today;
const dump = JSON.parse(readFileSync("test-plans/_lab/study/lab-dump.json", "utf8"));
const pts = (j) => { const p = JSON.parse(j); return (Array.isArray(p) ? p : p.points ?? []).map((q) => [q[0], q[1]]); };
const dseg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const out = [], T = { walls: 0, found: 0, reasons: {}, pics: 0 };
for (const s of dump) {
  const upf = s.unitsPerFoot; if (!upf) continue; const inch = upf / 12;
  const diag = [];
  for (const m of s.measurements.filter((m) => m.condition.type === "WALL")) {
    const p = pts(m.points);
    for (let i = 0; i + 1 < p.length; i++) { const [a, b] = [p[i], p[i + 1]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ang = Math.abs(((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 90); if (L >= 1.5 * upf && ang > 30 && ang < 60) diag.push({ a, b, L, name: m.condition.name }); }
  }
  if (!diag.length) continue;
  let segs; try { const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync("uploads/" + s.plan.file.storagePath)), verbosity: 0 }).promise; segs = await extractSegments(pdfjs as never, (await doc.getPage(s.pageNumber)) as never); } catch { continue; }
  const outside = houseOutsideMap(segs, { unitsPerFoot: upf }) ?? undefined;
  for (const d of diag) {
    T.walls++;
    const c = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
    // as the user works: click the straight wall of the same takeoff that meets an end of the 45° one (its middle)
    const nb = s.measurements.filter((m) => m.condition.name === d.name).map((m) => pts(m.points)).find((p) => p.length === 2 && Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) >= 2 * upf && Math.abs(((Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]) * 180) / Math.PI) % 90) < 5 && [d.a, d.b].some((e) => Math.min(dseg(e[0], e[1], p[0], p[1])) <= 8 * inch));
    if (!nb) { T.walls--; continue; }
    const click = [(nb[0][0] + nb[1][0]) / 2, (nb[0][1] + nb[1][1]) / 2];
    let W = null; globalThis.__wdDbg = (sg, kinds, join) => { W = { sg, kinds, join }; };
    const r = findWalls(segs, click, { unitsPerFoot: upf, clickRadius: 4 * inch, outside });
    let piece = "no piece"; if (W) { const k = W.sg.findIndex((g) => dseg(c[0], c[1], [g.x1, g.y1], [g.x2, g.y2]) <= 3 * inch); if (k >= 0) { const g = W.sg[k]; const ends = [d.a, d.b].map((e) => Math.min(...W.sg.filter((_, j) => j !== k).map((h) => Math.min(dseg(g.x1, g.y1, [h.x1, h.y1], [h.x2, h.y2]), dseg(g.x2, g.y2, [h.x1, h.y1], [h.x2, h.y2]))))); piece = "piece kind " + W.kinds[k] + " gap " + (Math.min(...ends) / inch).toFixed(1) + "in join " + (W.join / inch).toFixed(1); } }
    let hit = false;
    if (r.ok) hit = r.runs.some((run) => run.some((_, k) => k + 1 < run.length && dseg(c[0], c[1], run[k], run[k + 1]) <= 3 * inch));
    const why = hit ? "found" : r.ok ? `found other walls, not this (${r.kind} ${r.thicknessIn}")` : r.reason;
    T.reasons[why.replace(/\(.*\)/, "").trim()] = (T.reasons[why.replace(/\(.*\)/, "").trim()] ?? 0) + 1;
    if (hit) T.found++;
    if (!hit && process.env.PICS && T.pics < 16) {
      const R = 10 * upf, Z = 600, sc = Z / (2 * R), x0 = c[0] - R, y0 = c[1] - R;
      const cv = createCanvas(Z, Z + 30), g = cv.getContext("2d"); g.fillStyle = "white"; g.fillRect(0, 0, Z, Z + 30);
      g.strokeStyle = "#222"; g.lineWidth = 1; g.beginPath(); for (let i = 0; i + 3 < segs.length; i += 4) { g.moveTo((segs[i] - x0) * sc, (segs[i + 1] - y0) * sc); g.lineTo((segs[i + 2] - x0) * sc, (segs[i + 3] - y0) * sc); } g.stroke();
      const line = (P, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); P.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q[0] - x0) * sc, (q[1] - y0) * sc)); g.stroke(); };
      if (r.ok) for (const run of r.runs) line(run, "rgba(0,90,255,0.6)", 5);
      line([d.a, d.b], "rgba(230,0,0,0.85)", 6);
      g.fillStyle = "#000"; g.font = "14px Arial"; g.fillText(`${T.pics}. ${s.plan.name.slice(0, 40)}  red=your 45° wall  blue=found`, 6, Z + 20);
      writeFileSync(`test-plans/_lab/d45-${T.pics++}.png`, await cv.encode("png"));
    }
    out.push({ sheet: `${s.plan.name} p${s.pageNumber}`, name: d.name, ft: +(d.L / upf).toFixed(1), at: c.map(Math.round), why: hit ? why : why + " / " + piece });
  }
}
writeFileSync("test-plans/_lab/diag45.json", JSON.stringify(out, null, 1));
for (const o of out) console.log(`${o.sheet.slice(0, 40).padEnd(40)} ${o.name.padEnd(16)} ${String(o.ft).padStart(5)}'  ${o.why}`);
console.log(JSON.stringify(T));
