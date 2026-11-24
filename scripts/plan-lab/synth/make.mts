/**
 * Plan Lab: made-up floor plans for training the plan-reading AI — each a CAD-style PDF to scale, its answer key
 * (every wall, room, porch, door and window, exactly), a colored check picture, and the same answer in the Plan
 * Lab's format (dump.json, like study/lab-dump.json) so the training scripts read them like the real ones.
 * Never part of The Builder Station: the plans live in test-plans/_lab/synthetic/ (never pushed).
 *
 *   npm run synth -- --count=20            a new batch (batch-001, batch-002, …) of 20 plans
 *   npm run synth -- --count=5 --start=42  plans from seed 42 on (the same seed always draws the same plan)
 *   npm run synth:clean                    remove them all (or: npm run synth:clean -- batch-002)
 *
 * The folder never grows past SYNTH_MAX_GB (default 50): the oldest batches are removed first.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from "fs";
import path from "path";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { extractSegments, type DoorSwing } from "../../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { rng, type Rng } from "./rng";
import { makeLayout, OUT, type Layout, type Pt, type Rect } from "./layout";
import { geometry, makeStyle, ringArea, type Arc, type Geom } from "./geom";
import { clutter, makeClutter, type Prim } from "./clutter";
import pc from "polygon-clipping";
import { strokeText, strokeWidth } from "./font";

export const SYNTH_VERSION = "rooms4-2026-11-22";
export const ROOT = "test-plans/_lab/synthetic";
const FONTS = path.resolve("node_modules/pdfjs-dist/standard_fonts") + "/";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

// ---------- the sheet ----------
const SCALES = [
  { upf: 18, label: '1/4" = 1\'-0"', w: 3 },
  { upf: 13.5, label: '3/16" = 1\'-0"', w: 1 },
  { upf: 9, label: '1/8" = 1\'-0"', w: 1 },
];
const SHEETS = [
  { w: 36 * 72, h: 24 * 72, name: "24x36" },
  { w: 24 * 72, h: 18 * 72, name: "18x24" },
  { w: 17 * 72, h: 11 * 72, name: "11x17" },
];

type Orient = { mx: boolean; my: boolean; rot: boolean };
const orient = (o: Orient, p: Pt): Pt => {
  let [x, y] = p;
  if (o.mx) x = -x;
  if (o.my) y = -y;
  return o.rot ? [-y, x] : [x, y];
};

function feetIn(inches: number) {
  const n = Math.round(inches);
  return `${Math.floor(n / 12)}'-${n % 12}"`;
}

type Made = {
  seed: number;
  layout: Layout;
  geom: Geom;
  upf: number;
  scaleLabel: string;
  sheet: { w: number; h: number; name: string };
  toPage: (p: Pt) => Pt;
  pdf: Uint8Array;
  /** How this plan is drawn (for the index page and for checking every look gets made). */
  look: Record<string, string | boolean>;
};

export async function makePlan(seed: number): Promise<Made | null> {
  const r = rng(seed);
  let layout: Layout | null = null;
  for (let k = 0; k < 20 && !layout; k++) layout = makeLayout(r);
  if (!layout) return null;
  const style = makeStyle(r);
  // (Siding and brick follow square corners only: none on a house with a 45° outside corner.)
  if (layout.diags.some((d) => d.kind === "ext")) (style.skin = 0), (style.brick = 0);
  const g = geometry(layout, style);
  const cl = makeClutter(r);
  const o: Orient = { mx: r.chance(0.5), my: r.chance(0.2), rot: r.chance(0.2) };

  // Everything drawn, turned the way this sheet shows the house; its extent in inches (dimension strings around it).
  const allPts: Pt[] = [...g.wallRings.flat(), ...g.porchLines.flat(), ...g.arcs.flat(), ...g.dashed.flat(), ...g.skin.flat(), ...g.brick.flat()].map((p) => orient(o, p));
  const xs = allPts.map((p) => p[0]), ys = allPts.map((p) => p[1]);
  const around = cl.dims === "none" ? 0 : 108;
  const bx0 = Math.min(...xs) - around, bx1 = Math.max(...xs) + around, by0 = Math.min(...ys) - around, by1 = Math.max(...ys) + around;
  // A scale and sheet it fits on (with room for the title block and notes).
  const fits = SCALES.flatMap((s) => SHEETS.map((sh) => ({ s, sh }))).filter(({ s, sh }) => (bx1 - bx0) * (s.upf / 12) + 2 * 72 + 160 <= sh.w && (by1 - by0) * (s.upf / 12) + 2.2 * 72 + 60 <= sh.h);
  if (!fits.length) return null;
  // The sheet first; then, like a drafter, the biggest scale the house fits on it (now and then one smaller).
  const sheets = [...new Set(fits.map((f) => f.sh))];
  const sh = r.pick(sheets.flatMap((x) => Array(x.name === "24x36" ? 6 : x.name === "11x17" ? 3 : 2).fill(x)));
  const onSheet = fits.filter((f) => f.sh === sh).sort((a, b) => b.s.upf - a.s.upf);
  const s = (r.chance(0.85) ? onSheet[0] : r.pick(onSheet)).s;
  const k = s.upf / 12;
  const free = { x: sh.w - 160 - 2 * 72 - (bx1 - bx0) * k, y: sh.h - 2.2 * 72 - 60 - (by1 - by0) * k };
  // Near the middle of the drawing area, not always dead center.
  const ox = 72 + free.x * (0.5 + (r.f() - 0.5) * 0.3) - bx0 * k, oy = 72 + free.y * (0.5 + (r.f() - 0.5) * 0.3) - by0 * k;
  const toPage = (p: Pt): Pt => {
    const q = orient(o, p);
    return [Math.round((q[0] * k + ox) * 1000) / 1000, Math.round((q[1] * k + oy) * 1000) / 1000];
  };
  const prims = clutter(layout, g, cl, r, k, style.thinW);
  // Stairs aren't floor (the user's rule): out of the room they stand in, up to the railing.
  if (g.key.stairs.length)
    for (const q of g.key.rooms) {
      const left = pc.difference([[q.outline]], ...g.key.stairs.map((s2) => [s2])) as Pt[][][];
      const big = left.sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0];
      if (big) q.outline = big[0];
    }

  // ---------- the PDF ----------
  const doc = await PDFDocument.create();
  doc.setTitle(`Synthetic plan ${seed}`);
  doc.setProducer("Plan Lab synthetic plans");
  const page = doc.addPage([sh.w, sh.h]);
  const font = await doc.embedFont(r.pick([StandardFonts.Helvetica, StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.Courier]));
  // Most plans are black; some are blue line or gray.
  const [ink, inkName] = r.pick([[rgb(0, 0, 0), "black"], [rgb(0, 0, 0), "black"], [rgb(0, 0, 0), "black"], [rgb(0, 0, 0), "black"], [rgb(0.1, 0.15, 0.85), "blue"], [rgb(0.25, 0.25, 0.25), "gray"]] as const);
  const pathOf = (lines: Pt[][], close = false) => lines.map((l) => l.map((p, i) => `${i ? "L" : "M"}${toPage(p)[0]} ${toPage(p)[1]}`).join(" ") + (close ? " Z" : "")).join(" ");
  const curvesOf = (arcs: Arc[]) => arcs.map((a) => { const [p0, p1, p2, p3] = a.map(toPage); return `M${p0[0]} ${p0[1]} C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`; }).join(" ");
  const stroke = (d: string, w: number, dash?: number[]) => {
    if (d) page.drawSvgPath(d, { x: 0, y: sh.h, borderColor: ink, borderWidth: w, ...(dash ? { borderDashArray: dash } : {}) });
  };
  // Filled walls go under everything.
  for (const p of prims) if (p.k === "fill") page.drawSvgPath(pathOf(p.rings, true), { x: 0, y: sh.h, color: rgb(p.gray, p.gray, p.gray) });
  stroke(pathOf(g.wallRings, true), style.wallW);
  stroke(pathOf(g.windowLines), style.thinW);
  stroke(pathOf(g.leaves), style.thinW);
  stroke(curvesOf(g.arcs), style.thinW);
  stroke(pathOf(g.garageLines), style.thinW);
  stroke(pathOf(g.dashed), style.thinW, [6, 4]);
  stroke(pathOf(g.skin), style.thinW);
  stroke(pathOf(g.brick, true), style.thinW * 1.3);
  stroke(pathOf(g.porchLines), style.thinW * 1.5);
  if (g.overhang.length) stroke(pathOf(g.overhang, true), style.thinW, style.overhangDash ? [10, 5] : undefined);
  stroke(pathOf(g.posts, true), style.thinW);
  // The clutter, grouped by line weight and dash so the PDF stays small.
  const groups = new Map<string, { w: number; dash?: number[]; d: string[] }>();
  for (const p of prims) {
    if (p.k !== "line" && p.k !== "curve") continue;
    const key = `${p.w}|${p.dash ?? ""}`;
    if (!groups.has(key)) groups.set(key, { w: p.w, dash: p.dash, d: [] });
    groups.get(key)!.d.push(p.k === "line" ? pathOf([p.pts], p.close) : curvesOf(p.arcs));
  }
  for (const gr of groups.values()) for (let i = 0; i < gr.d.length; i += 400) stroke(gr.d.slice(i, i + 400).join(" "), gr.w, gr.dash);

  // Text: most plans letter it in a CAD stroke font (line work); some use a typed font.
  const strokeFont = r.chance(0.65), slant = r.chance(0.4) ? 0.18 : 0, tw = r.pick([0.3, 0.4, 0.5]);
  const text = (t: string, at: Pt, size: number, vertical = false) => {
    if (strokeFont) {
      // (Already on the page: drawn as is.)
      stroke(strokeText(t, at, size * 0.72, vertical ? -Math.PI / 2 : 0, slant).map((l) => l.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ")).join(" "), tw);
      return;
    }
    const w = font.widthOfTextAtSize(t, size);
    if (vertical) page.drawText(t, { x: at[0] + size * 0.35, y: sh.h - at[1] - w / 2, size, font, color: ink, rotate: degrees(90) });
    else page.drawText(t, { x: at[0] - w / 2, y: sh.h - at[1] - size * 0.35, size, font, color: ink });
  };
  const textW = (t: string, size: number) => (strokeFont ? strokeWidth(t, size * 0.72) : font.widthOfTextAtSize(t, size));
  // Where text already sits, so nothing is lettered on top of other text (a draftsman moves it or leaves it off).
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const placed: Box[] = [];
  // (No room name on the stairs.)
  for (const st2 of g.key.stairs) {
    const ps = st2.map(toPage), xs2 = ps.map((p) => p[0]), ys2 = ps.map((p) => p[1]);
    placed.push({ x0: Math.min(...xs2), y0: Math.min(...ys2), x1: Math.max(...xs2), y1: Math.max(...ys2) });
  }
  const boxOf = (t: string, at: Pt, size: number, vertical: boolean): Box => {
    const w = textW(t, size) / 2 + 0.8, h = size * 0.42 + 0.8;
    return vertical ? { x0: at[0] - h, y0: at[1] - w, x1: at[0] + h, y1: at[1] + w } : { x0: at[0] - w, y0: at[1] - h, x1: at[0] + w, y1: at[1] + h };
  };
  const hits = (b: Box) => placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
  // 1. Dimension strings and the tags along the walls (their place is fixed by what they measure).
  const loose: Extract<Prim, { k: "text" }>[] = [];
  for (const p of prims) {
    if (p.k !== "text") continue;
    if (!p.axis) { loose.push(p); continue; }
    const at = toPage(p.at), v = (p.axis === "y") !== o.rot;
    placed.push(boxOf(p.text, at, p.size, v));
    text(p.text, at, p.size, v);
  }

  // 2. Room names: the name (sometimes underlined), its size, sometimes the ceiling height or floor finish —
  // kept inside the room's walls and off other text: moved within the room, made smaller, or the extra lines left off.
  const nameSize = r.pick([6.5, 7, 8, 9]), smallSize = nameSize * 0.75;
  const under = r.chance(0.5), clg = r.chance(0.45), finish = r.chance(0.2);
  for (const l of g.labels) {
    const size0 = l.small ? smallSize : nameSize;
    const extra: [string, number][] = [];
    if (l.dims) {
      const a = orient(o, [l.rect.x0, l.rect.y0]), b = orient(o, [l.rect.x1, l.rect.y1]);
      extra.push([`${feetIn(Math.abs(b[0] - a[0]) - 4.5)} X ${feetIn(Math.abs(b[1] - a[1]) - 4.5)}`, 0.85]);
    }
    if (clg && !l.small) extra.push([r.pick(["9' CLG.", "10' CLG.", "9' PLATE", "8' CLG.", "VAULTED CLG."]), 0.75]);
    if (finish && !l.small) extra.push([r.pick(["CARPET", "TILE", "WOOD FLR.", "LVP"]), 0.75]);
    const ia = toPage([l.rect.x0 + 5, l.rect.y0 + 5]), ib = toPage([l.rect.x1 - 5, l.rect.y1 - 5]);
    const inner: Box = { x0: Math.min(ia[0], ib[0]), y0: Math.min(ia[1], ib[1]), x1: Math.max(ia[0], ib[0]), y1: Math.max(ia[1], ib[1]) };
    const c = toPage(l.at);
    let done = false;
    // Fullest first: every line at full size, then smaller, then fewer lines.
    for (let keep = extra.length; keep >= 0 && !done; keep--) {
      for (const f of [1, 0.85, 0.7, 0.6]) {
        const lines: [string, number][] = [[l.text, size0 * f], ...extra.slice(0, keep).map(([t, m]) => [t, size0 * f * m] as [string, number])];
        const total = lines.reduce((s2, [, z]) => s2 + z * 1.35, 0);
        const wide = Math.max(...lines.map(([t, z]) => textW(t, z))) + 1.6;
        if (wide > inner.x1 - inner.x0 || total > inner.y1 - inner.y0) continue;
        const room = { x: (inner.x1 - inner.x0 - wide) / 2, y: (inner.y1 - inner.y0 - total) / 2 };
        const tries: Pt[] = [[0, 0]];
        for (const fy of [0.35, -0.35, 0.7, -0.7, 1, -1]) tries.push([0, fy * room.y]);
        for (const fx of [0.5, -0.5, 1, -1]) for (const fy of [0, 0.5, -0.5]) tries.push([fx * room.x, fy * room.y]);
        for (const [dx, dy] of tries) {
          const cx = Math.min(Math.max(c[0] + dx, inner.x0 + wide / 2), inner.x1 - wide / 2);
          const cy = Math.min(Math.max(c[1] + dy, inner.y0 + total / 2), inner.y1 - total / 2);
          const bx: Box = { x0: cx - wide / 2, y0: cy - total / 2, x1: cx + wide / 2, y1: cy + total / 2 };
          if (hits(bx)) continue;
          placed.push(bx);
          let y = cy - total / 2;
          lines.forEach(([t, z], i) => {
            y += z * 0.675;
            text(t, [cx, y], z);
            if (i === 0 && under) stroke(`M${cx - textW(t, z) / 2} ${y + z * 0.55} L${cx + textW(t, z) / 2} ${y + z * 0.55}`, tw);
            y += z * 0.675;
          });
          done = true;
          break;
        }
        if (done) break;
      }
    }
  }

  // 3. The small notes (fixture names, door tags, switches): nudged off other text, or left off.
  for (const p of loose) {
    const at = toPage(p.at), h = p.size;
    for (const [dx, dy] of [[0, 0], [0, h], [0, -h], [h * 2, 0], [-h * 2, 0], [0, h * 2], [0, -h * 2]] as Pt[]) {
      const q: Pt = [at[0] + dx, at[1] + dy], bx = boxOf(p.text, q, p.size, false);
      if (hits(bx)) continue;
      placed.push(bx);
      text(p.text, q, p.size);
      break;
    }
  }
  // Title under the plan, the sheet's border and title block.
  const living = g.key.rooms.filter((q) => q.type !== "garage").reduce((sum, q) => sum + Math.abs(ringArea(q.outline)), 0) / 144;
  const tb = { x: sh.w - 36 - 150 };
  const bottom = by1 * k + oy;
  const cxp = ((bx0 + bx1) / 2) * k + ox;
  text(r.pick(["FLOOR PLAN", "FIRST FLOOR PLAN", "MAIN FLOOR PLAN", "FLOOR PLAN"]), [cxp, bottom + 30], 12);
  text(`SCALE: ${s.label.replace(/"/g, '"')}`, [cxp, bottom + 46], 8);
  page.drawRectangle({ x: 24, y: 24, width: sh.w - 48, height: sh.h - 48, borderColor: ink, borderWidth: 1.2 });
  page.drawLine({ start: { x: tb.x, y: 24 }, end: { x: tb.x, y: sh.h - 24 }, thickness: 1, color: ink });
  const tbLines = [`PLAN NO. S-${String(seed).padStart(5, "0")}`, `LIVING: ${Math.round(living).toLocaleString("en-US")} SQ. FT.`, "SHEET", "A-1", "DRAWN BY: PLAN LAB"];
  tbLines.forEach((t, i) => {
    const y = 60 + i * 28;
    page.drawText(t, { x: tb.x + 10, y, size: i === 3 ? 18 : 7, font, color: ink });
    page.drawLine({ start: { x: tb.x, y: y - 8 }, end: { x: sh.w - 24, y: y - 8 }, thickness: 0.5, color: ink });
  });
  const pdf = await doc.save();
  const look = { walls: cl.walls, brick: style.brick > 0, siding: style.skin > 0, text: strokeFont ? "CAD lettering" : "typed", fixtures: cl.fixtures, electrical: cl.electric, dims: cl.dims, roomDims: cl.roomDims ? `${Math.round(cl.roomDims * 100)}% of rooms` : "", color: inkName === "black" ? "" : inkName };
  return { seed, layout, geom: g, upf: s.upf, scaleLabel: s.label, sheet: sh, toPage, pdf, look };
}

// ---------- the answer key ----------
export function answerKey(m: Made) {
  const g = m.geom, P = (p: Pt) => m.toPage(p), ring = (r: Pt[]) => r.slice(0, -1).map(P);
  return {
    seed: m.seed,
    version: SYNTH_VERSION,
    variant: m.layout.variant,
    look: m.look,
    sheet: m.sheet,
    unitsPerFoot: m.upf,
    scaleLabel: m.scaleLabel,
    walls: g.key.walls.map((w) => ({ points: [P(w.a), P(w.b)], kind: w.kind, size: w.size, drawnIn: w.t, rooms: w.sides })),
    stairs: g.key.stairs.map(ring),
    rooms: g.key.rooms.map((q) => ({ id: q.id, ids: q.ids, name: q.name, type: q.type, outline: ring(q.outline), sf: Math.round((Math.abs(ringArea(q.outline)) / 144) * 10) / 10 })),
    porches: g.key.porches.map((q) => ({ name: q.name, outline: ring(q.outline), sf: Math.round((Math.abs(ringArea(q.outline)) / 144) * 10) / 10 })),
    doors: g.key.doors.map((d) => ({ points: [P(d.a), P(d.b)], type: d.type, widthIn: d.width, into: d.into, ...(d.hinge ? { hinge: P(d.hinge) } : {}) })),
    windows: g.key.windows.map((d) => ({ points: [P(d.a), P(d.b)], widthIn: d.width })),
  };
}
type Key = ReturnType<typeof answerKey>;

/** The Plan Lab's own format (study/lab-dump.json): what the training scripts read. */
function labSheet(key: Key, pdfPath: string) {
  const name = (w: Key["walls"][number]) => `${w.kind === "ext" ? "Ext" : "Int"} ${w.size} Wall`;
  return {
    id: `synth-${key.seed}`,
    pageNumber: 1,
    unitsPerFoot: key.unitsPerFoot,
    scaleLabel: key.scaleLabel,
    plan: { name: `SYNTH ${key.seed}`, file: { storagePath: path.relative("uploads", pdfPath).replace(/\\/g, "/") } },
    measurements: [
      ...key.walls.map((w) => ({ points: JSON.stringify(w.points), isDeduction: false, condition: { name: name(w), type: "WALL" } })),
      ...key.rooms.filter((q) => q.type !== "garage").map((q) => ({ points: JSON.stringify([...q.outline, q.outline[0]]), isDeduction: false, condition: { name: "Floors", type: "AREA" } })),
      ...key.porches.map((q) => ({ points: JSON.stringify([...q.outline, q.outline[0]]), isDeduction: false, condition: { name: "Porch Area", type: "AREA" } })),
    ],
    areaFinds: [],
  };
}

// ---------- automatic checks ----------
export async function check(m: Made, key: Key): Promise<string[]> {
  const bad: string[] = [];
  const doc = await pdfjs.getDocument({ data: new Uint8Array(m.pdf), verbosity: 0, standardFontDataUrl: FONTS }).promise;
  const page = await doc.getPage(1);
  const swings: DoorSwing[] = [];
  const segs = await extractSegments(pdfjs as never, page as never, [], [], swings);
  const inch = m.upf / 12;
  const L: number[][] = [];
  for (let i = 0; i + 3 < segs.length; i += 4) L.push([segs[i], segs[i + 1], segs[i + 2], segs[i + 3]]);
  // 1. Every wall in the key has its two face lines on the plan, its thickness apart (doors aside).
  const gaps = key.doors.map((d) => d.points);
  let tested = 0, found = 0;
  for (const w of key.walls) {
    const [a, b] = w.points, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy, ny = ux;
    const half = (w.drawnIn / 2) * inch;
    for (let s = 8 * inch; s < len - 8 * inch; s += 6 * inch) {
      const x = a[0] + ux * s, y = a[1] + uy * s;
      const inDoor = gaps.some(([p, q]) => {
        const l2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2, t = ((x - p[0]) * (q[0] - p[0]) + (y - p[1]) * (q[1] - p[1])) / l2;
        return t > -0.1 && t < 1.1 && Math.hypot(p[0] + t * (q[0] - p[0]) - x, p[1] + t * (q[1] - p[1]) - y) < inch;
      });
      if (inDoor) continue;
      tested++;
      const side = (sg: number) =>
        L.some(([x1, y1, x2, y2]) => {
          const lx = x2 - x1, ly = y2 - y1, ll = Math.hypot(lx, ly);
          if (ll < 1e-6 || Math.abs(lx * nx + ly * ny) / ll > 0.01) return false;
          const s0 = (x1 - x) * ux + (y1 - y) * uy, s1 = (x2 - x) * ux + (y2 - y) * uy;
          if (Math.min(s0, s1) > 0.5 || Math.max(s0, s1) < -0.5) return false;
          return Math.abs((x1 - x) * nx + (y1 - y) * ny - sg * half) < 0.3 * inch;
        });
      if (side(1) && side(-1)) found++;
    }
  }
  if (found < tested * 0.99) bad.push(`wall lines: only ${found} of ${tested} spots have both faces`);
  // 2. Every swinging door's swing is read as one, at its hinge, its width.
  const missed = key.doors.filter((d) => d.type === "door" && !swings.some((w) => Math.hypot(w.x - d.hinge![0], w.y - d.hinge![1]) < 0.5 * inch && Math.abs(w.r - d.widthIn * inch) < 0.1 * d.widthIn * inch));
  if (missed.length) bad.push(`door swings: ${missed.length} of ${key.doors.filter((d) => d.type === "door").length} not read`);
  // 3. Every room is reachable from outside through doors.
  const sides = (o: Layout["openings"][number]) => m.layout.runs[o.run].sides;
  const seen = new Set([OUT]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const o of m.layout.openings) {
      if (o.type === "window") continue;
      const [p, q] = sides(o);
      if (seen.has(p) !== seen.has(q)) (seen.add(p), seen.add(q), (grew = true));
    }
    for (const d of m.layout.diags) {
      if (!d.door) continue;
      const [p, q] = d.sides;
      if (seen.has(p) !== seen.has(q)) (seen.add(p), seen.add(q), (grew = true));
    }
  }
  const lost = m.layout.rooms.filter((q) => q.rects.length && !seen.has(q.id));
  if (lost.length) bad.push(`no way in: ${lost.map((q) => q.name).join(", ")}`);
  // 4. Every room has a real floor; nothing overlaps.
  for (const q of key.rooms) if (q.sf < (["closet", "linen", "pantry"].includes(q.type) ? 2 : 15)) bad.push(`tiny room: ${q.name} ${q.sf} sf`);
  if (key.rooms.reduce((n, q) => n + q.ids.length, 0) !== m.layout.rooms.filter((q) => q.rects.length).length) bad.push("a room has no floor");
  await doc.cleanup();
  return bad;
}

// ---------- the check picture: the plan with its answer key over it ----------
async function picture(m: Made, key: Key, out: string) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(m.pdf), verbosity: 0, standardFontDataUrl: FONTS }).promise;
  const page = await doc.getPage(1);
  const pts = [...key.walls.flatMap((w) => w.points), ...key.porches.flatMap((q) => q.outline)];
  const pad = 4 * m.upf;
  const x0 = Math.min(...pts.map((p) => p[0])) - pad, x1 = Math.max(...pts.map((p) => p[0])) + pad;
  const y0 = Math.min(...pts.map((p) => p[1])) - pad, y1 = Math.max(...pts.map((p) => p[1])) + pad;
  const S = 1600 / Math.max(x1 - x0, y1 - y0);
  const W = Math.ceil((x1 - x0) * S), H = Math.ceil((y1 - y0) * S) + 40;
  const cv = createCanvas(W, H), ctx = cv.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, W, H);
  await page.render({ canvasContext: ctx as never, viewport: page.getViewport({ scale: S, offsetX: -x0 * S, offsetY: -y0 * S }) } as never).promise;
  const P = (p: number[]) => [(p[0] - x0) * S, (p[1] - y0) * S] as const;
  const poly = (ring: number[][], fill: string) => {
    ctx.beginPath();
    ring.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const fills: Record<string, string> = { garage: "rgba(120,120,120,0.18)", closet: "rgba(255,200,0,0.25)", linen: "rgba(255,200,0,0.25)", pantry: "rgba(255,200,0,0.25)", wic: "rgba(255,200,0,0.25)" };
  for (const q of key.rooms) poly(q.outline, fills[q.type] ?? "rgba(40,170,80,0.18)");
  for (const q of key.porches) poly(q.outline, "rgba(255,130,0,0.25)");
  const inch = (m.upf / 12) * S;
  for (const w of key.walls) {
    ctx.strokeStyle = w.kind === "ext" ? (w.size === "2x6" ? "rgba(150,0,0,0.5)" : "rgba(230,30,30,0.45)") : w.size === "2x6" ? "rgba(140,40,200,0.5)" : "rgba(30,90,230,0.45)";
    ctx.lineWidth = Math.max(2, w.drawnIn * inch);
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(...P(w.points[0]));
    ctx.lineTo(...P(w.points[1]));
    ctx.stroke();
  }
  // (Doorways read as wall, as Find area closes them: neither room gets the strip, so nothing is drawn there.)
  ctx.fillStyle = "white";
  ctx.fillRect(0, H - 34, W, 34);
  ctx.fillStyle = "black";
  ctx.font = "16px sans-serif";
  ctx.fillText(`seed ${m.seed} · ${m.scaleLabel} · ${m.sheet.name}   red: outside 2x4 · dark red: outside 2x6 · blue: inside 2x4 · purple: inside 2x6 · green: rooms · yellow: closets · orange: porches`, 8, H - 14);
  writeFileSync(out, cv.toBuffer("image/png"));
  await doc.cleanup();
}

// ---------- batches, the size cap ----------
function dirSize(d: string): number {
  if (!existsSync(d)) return 0;
  return readdirSync(d).reduce((s, f) => {
    const p = path.join(d, f), st = statSync(p);
    return s + (st.isDirectory() ? dirSize(p) : st.size);
  }, 0);
}
const batches = () => (existsSync(ROOT) ? readdirSync(ROOT).filter((d) => /^batch-\d+$/.test(d)).sort() : []);

async function main() {
  mkdirSync(ROOT, { recursive: true });
  const cap = Number(process.env.SYNTH_MAX_GB ?? 50) * 1024 ** 3;
  for (let b = batches(); dirSize(ROOT) > cap && b.length; b = batches()) {
    console.log(`Over the ${process.env.SYNTH_MAX_GB ?? 50} GB cap — removing the oldest batch, ${b[0]}`);
    rmSync(path.join(ROOT, b[0]), { recursive: true, force: true });
  }
  const used = batches().flatMap((b) => {
    const f = path.join(ROOT, b, "seeds.json");
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf-8")).seeds as { seed: number }[]).map((s) => s.seed) : [];
  });
  const count = Number(arg("count") ?? 20);
  const start = Number(arg("start") ?? (used.length ? Math.max(...used) + 1 : 1));
  const name = arg("batch") ?? `batch-${String((batches().map((b) => Number(b.slice(6))).sort((a, b) => b - a)[0] ?? 0) + 1).padStart(3, "0")}`;
  const dir = path.join(ROOT, name);
  mkdirSync(dir, { recursive: true });
  const seeds: { seed: number; ok: boolean; problems?: string[] }[] = [];
  const dump: unknown[] = [];
  const cards: string[] = [];
  for (let seed = start; seed < start + count; seed++) {
    const id = `p${String(seed).padStart(6, "0")}`;
    // (A rare shape the polygon library can't cut cleanly throws: that seed is skipped, the batch goes on.)
    const m = await makePlan(seed).catch(() => null);
    if (!m) {
      seeds.push({ seed, ok: false, problems: ["no house fit this seed"] });
      console.log(`${id}  skipped (no house fit)`);
      continue;
    }
    const key = answerKey(m);
    const problems = await check(m, key);
    const pdfPath = path.join(dir, `${id}.pdf`);
    writeFileSync(pdfPath, m.pdf);
    writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(key));
    await picture(m, key, path.join(dir, `${id}-check.png`));
    seeds.push({ seed, ok: !problems.length, ...(problems.length ? { problems } : {}) });
    if (!problems.length) dump.push(labSheet(key, pdfPath));
    const living = key.rooms.filter((q) => q.type !== "garage").reduce((s, q) => s + q.sf, 0);
    const lk = Object.entries(key.look).filter(([, v]) => v && v !== "plain" && v !== "none").map(([k2, v]) => (v === true ? k2 : `${k2}: ${v}`)).join(", ");
    const line = `${id}  ${key.variant.padEnd(6)} ${key.scaleLabel.padEnd(14)} ${m.sheet.name}  ${key.walls.length} walls, ${key.rooms.length} rooms, ${key.doors.length} doors, ${key.windows.length} windows, ${Math.round(living)} sf  ${problems.length ? "PROBLEM: " + problems.join("; ") : "checks ok"}`;
    console.log(line);
    cards.push(`<figure><img src="${id}-check.png" loading="lazy"><figcaption>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}<br><small>${lk}</small> · <a href="${id}.pdf">PDF</a></figcaption></figure>`);
  }
  writeFileSync(path.join(dir, "seeds.json"), JSON.stringify({ version: SYNTH_VERSION, made: new Date().toISOString(), seeds }, null, 1));
  writeFileSync(path.join(dir, "dump.json"), JSON.stringify(dump));
  writeFileSync(
    path.join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>${name} — synthetic plans</title><style>body{font:14px sans-serif;margin:16px;background:#f4f4f4}figure{background:#fff;margin:0 0 24px;padding:8px;box-shadow:0 1px 3px #0002}img{max-width:100%}</style><h1>${name}: ${seeds.filter((s) => s.ok).length} of ${seeds.length} plans passed the checks</h1>${cards.join("\n")}`,
  );
  const ok = seeds.filter((s) => s.ok).length;
  console.log(`\n${name}: ${ok} of ${seeds.length} plans passed every check · ${(dirSize(dir) / 1024 ** 2).toFixed(1)} MB · open ${path.join(dir, "index.html")}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("synth/make.mts")) await main();

export type { Rect, Rng };
