/**
 * Plan lab: one click, looked at closely — the room Find area gives, the wall pieces it saw (red) and
 * the openings it closed (blue), over the drawing. Uses the candidate copy (scripts/plan-lab/candidate).
 *
 *   npx tsx scripts/plan-lab/look.mts <pdf> <page> <units per foot> <x> <y> <box x> <box y> <box w> <box h> <out.png>
 */
import { readFileSync, writeFileSync } from "fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { extractSegments, type DoorSwing, type FillShape } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { findRoom } from "./candidate/room-detect";

const [file, pageS, upfS, cx, cy, bx, by, bw, bh, out] = process.argv.slice(2);
type B = { ux: number; uy: number; nx: number; ny: number; rho: number; half: number; s0: number; s1: number };
let bands: B[] = [];
let bridges: B[] = [];
let all: B[] = [];
let stairs: B[] = [];
const opened: [number, number, number, number][] = [];
(globalThis as { labOpen?: (w: B, a: number, b: number) => void }).labOpen = (w, a, b) => opened.push([w.ux * a + w.nx * w.rho, w.uy * a + w.ny * w.rho, w.ux * b + w.nx * w.rho, w.uy * b + w.ny * w.rho]);
(globalThis as { labStairs?: (b: B[]) => void }).labStairs = (b) => (stairs = b);
(globalThis as { labAll?: (b: B[], used: number[]) => void }).labAll = (b, used) => {
  all = b;
  console.log("wall thicknesses kept:", used.join('", ') + '"');
};
const g = globalThis as { labBands?: (b: B[]) => void; labBridges?: (b: B[]) => void };
g.labBands = (b) => (bands = [...b]);
g.labBridges = (b) => (bridges = [...b]);
(g as { labAllBridges?: (b: B[]) => void }).labAllBridges = (b) => (bridges = [...b]);
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
const page = await doc.getPage(+pageS);
const fills: FillShape[] = [];
const swings: DoorSwing[] = [];
const segs = await extractSegments(pdfjs as never, page as never, undefined, fills, swings);
const r = findRoom(segs, [+cx, +cy], { unitsPerFoot: +upfS, fills, doors: process.env.NODOORS ? undefined : swings });
console.log(r.ok ? `${r.areaSf.toFixed(1)} sq ft, ${r.outline.length} corners` : r.reason);
const box = { x: +bx, y: +by, w: +bw, h: +bh };
const S = 1100 / Math.max(box.w, box.h);
const cv = createCanvas(Math.round(box.w * S), Math.round(box.h * S));
const ctx = cv.getContext("2d");
ctx.fillStyle = "white";
ctx.fillRect(0, 0, cv.width, cv.height);
await page.render({ canvasContext: ctx as never, viewport: page.getViewport({ scale: S, offsetX: -box.x * S, offsetY: -box.y * S }) } as never).promise;
const T = (x: number, y: number): [number, number] => [(x - box.x) * S, (y - box.y) * S];
if (r.ok) {
  ctx.fillStyle = "rgba(0,200,80,0.22)";
  ctx.strokeStyle = "rgb(0,150,60)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  r.outline.forEach(([x, y], k) => (k ? ctx.lineTo(...T(x, y)) : ctx.moveTo(...T(x, y))));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
const draw = (w: B, col: string) => {
  const p = (s: number, o: number) => T(w.ux * s + w.nx * (w.rho + o), w.uy * s + w.ny * (w.rho + o));
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(...p(w.s0, -w.half));
  ctx.lineTo(...p(w.s1, -w.half));
  ctx.lineTo(...p(w.s1, w.half));
  ctx.lineTo(...p(w.s0, w.half));
  ctx.fill();
};
for (const w of all) if (!bands.includes(w)) draw(w, "rgba(255,200,0,0.7)");
for (const w of bands) draw(w, "rgba(255,0,0,0.45)");
for (const w of bridges) draw(w, "rgba(0,100,255,0.55)");
for (const w of stairs) draw(w, "rgba(140,0,200,0.35)");
ctx.strokeStyle = "rgb(0,200,0)";
ctx.lineWidth = 5;
for (const [x1, y1, x2, y2] of opened) {
  ctx.beginPath();
  ctx.moveTo(...T(x1, y1));
  ctx.lineTo(...T(x2, y2));
  ctx.stroke();
}
console.log("openings left open:", opened.length);
ctx.fillStyle = "black";
ctx.beginPath();
ctx.arc(...T(+cx, +cy), 6, 0, 7);
ctx.fill();
writeFileSync(out, await cv.encode("png"));
