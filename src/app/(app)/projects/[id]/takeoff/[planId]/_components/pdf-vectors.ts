import type { PDFPageProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
type Matrix = [number, number, number, number, number, number];

// pdf.js path commands inside a constructPath operation (not exported by the library).
const DrawOPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

const MIN_SEGMENT = 2.5; // page units; skips hatching specks and tiny text strokes
const MAX_SEGMENTS = 300_000;

function mul(m: Matrix, n: Matrix): Matrix {
  // m × n: apply n first, then m.
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/**
 * The straight line segments a PDF page draws, in page units (the same space the
 * takeoff stores points in). Returned as [x1, y1, x2, y2, ...]. Curves contribute
 * their end points only (as zero-length segments). Scanned plans have none.
 * `arcs`, when given, collects the radius of every quarter circle drawn (door swings —
 * a clue to the sheet's scale). `fills`, when given, collects every filled shape with its color
 * (a plan that fills its walls solid marks them that way). `swings`, when given, collects every quarter
 * circle as a door swing: its hinge (the circle's center), radius and two ends.
 */
export async function extractSegments(pdfjs: PdfJs, page: PDFPageProxy, arcs?: number[], fills?: FillShape[], swings?: DoorSwing[]): Promise<Float32Array> {
  const { OPS } = pdfjs;
  const list = await page.getOperatorList();
  const vt = page.getViewport({ scale: 1 }).transform as Matrix;
  const out: number[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let color = "#000000";
  const colors: string[] = [];
  const fillOps = new Set<number>([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  for (let i = 0; i < list.fnArray.length && out.length < MAX_SEGMENTS * 4; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === OPS.save) {
      stack.push(ctm);
      colors.push(color);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? ctm;
      color = colors.pop() ?? color;
    } else if (fn === OPS.setFillRGBColor) color = typeof args?.[0] === "string" ? (args[0] as string) : color;
    else if (fn === OPS.transform) ctm = mul(ctm, args as unknown as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0] as Matrix | null;
      if (Array.isArray(m) || (m && typeof m === "object" && "length" in m)) ctm = mul(ctm, Array.from(m as ArrayLike<number>) as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.constructPath) {
      const paintOp = args?.[0] as number;
      if (paintOp === OPS.endPath) continue; // clipping paths aren't drawn
      const data = (args?.[1] as unknown[] | undefined)?.[0] as ArrayLike<number> | undefined;
      if (!data || typeof (data as { length?: number }).length !== "number") continue;
      const m = mul(vt, ctm);
      const tx = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
      let cur: [number, number] | null = null;
      let start: [number, number] | null = null;
      // A filled shape's outline, ring by ring (curves by their ends).
      const filling = fills && fillOps.has(paintOp);
      const rings: number[][] = [];
      const at = (q: [number, number], fresh = false) => {
        if (!filling) return;
        if (fresh || !rings.length) rings.push([]);
        rings[rings.length - 1].push(q[0], q[1]);
      };
      const seg = (a: [number, number], b: [number, number]) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len >= MIN_SEGMENT || len === 0) out.push(a[0], a[1], b[0], b[1]);
      };
      for (let j = 0; j < data.length;) {
        const op = data[j++];
        if (op === DrawOPS.moveTo) {
          cur = start = tx(data[j++], data[j++]);
          at(cur, true);
        } else if (op === DrawOPS.lineTo) {
          const p = tx(data[j++], data[j++]);
          if (cur) seg(cur, p);
          cur = p;
          at(p);
        } else if (op === DrawOPS.curveTo) {
          const c1 = tx(data[j++], data[j++]);
          const c2 = tx(data[j++], data[j++]);
          const p = tx(data[j++], data[j++]);
          if (cur) out.push(cur[0], cur[1], cur[0], cur[1], p[0], p[1], p[0], p[1]);
          if (cur && arcs) {
            const r = quarterCircleRadius(cur, c1, c2, p);
            if (r) arcs.push(r);
          }
          // (A door drawn open part way — 45°, say — swings a shorter arc from the same hinge.)
          if (cur && swings) {
            const q = circleArc(cur, c1, c2, p, 25, 100);
            if (q) swings.push({ x: q.cx, y: q.cy, r: q.r, a: cur, b: p });
          }
          cur = p;
          at(p);
        } else if (op === DrawOPS.quadraticCurveTo) {
          j += 2;
          const p = tx(data[j++], data[j++]);
          if (cur) out.push(p[0], p[1], p[0], p[1]);
          cur = p;
          at(p);
        } else if (op === DrawOPS.closePath) {
          if (cur && start) seg(cur, start);
          cur = start;
        } else {
          break; // unknown operator: stop reading this path
        }
      }
      if (filling) {
        const kept = rings.filter((r) => r.length >= 6);
        if (kept.length) fills.push({ color, rings: kept });
      }
    }
  }
  return new Float32Array(out);
}

/** A filled shape on the page: its color ("#rrggbb") and outline rings ([x, y, x, y, …], page units). */
export type FillShape = { color: string; rings: number[][] };

/**
 * The radius of a curve that's a quarter circle (a door swing), or null. Its center is where the
 * lines square to the curve at each end cross; both ends must be the same distance from it, a
 * quarter turn apart.
 */
export function quarterCircleRadius(p0: [number, number], c1: [number, number], c2: [number, number], p3: [number, number]): number | null {
  return quarterCircle(p0, c1, c2, p3)?.r ?? null;
}

/** A door swing on the page: the hinge (x, y), the door's width (r) and the swing's two ends (page units). */
export type DoorSwing = { x: number; y: number; r: number; a: [number, number]; b: [number, number] };

/** A curve that's a quarter circle: its center and radius, or null (see quarterCircleRadius). */
export function quarterCircle(p0: [number, number], c1: [number, number], c2: [number, number], p3: [number, number]) {
  return circleArc(p0, c1, c2, p3, 80, 100);
}

/** A curve that's a piece of a circle turning `minTurn`–`maxTurn` degrees: its center and radius, or null. */
export function circleArc(p0: [number, number], c1: [number, number], c2: [number, number], p3: [number, number], minTurn: number, maxTurn: number): { cx: number; cy: number; r: number } | null {
  const n0 = [-(c1[1] - p0[1]), c1[0] - p0[0]];
  const n3 = [-(p3[1] - c2[1]), p3[0] - c2[0]];
  const det = -n0[0] * n3[1] + n0[1] * n3[0];
  if (Math.abs(det) < 1e-9) return null;
  const dx = p3[0] - p0[0];
  const dy = p3[1] - p0[1];
  const s = (-dx * n3[1] + dy * n3[0]) / det;
  const cx = p0[0] + n0[0] * s;
  const cy = p0[1] + n0[1] * s;
  const r0 = Math.hypot(p0[0] - cx, p0[1] - cy);
  const r3 = Math.hypot(p3[0] - cx, p3[1] - cy);
  if (!(r0 > 3) || Math.abs(r0 - r3) > 0.05 * r0) return null;
  const a = [p0[0] - cx, p0[1] - cy];
  const b = [p3[0] - cx, p3[1] - cy];
  const turn = Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) * (180 / Math.PI);
  return turn > minTurn && turn < maxTurn ? { cx, cy, r: r0 } : null;
}

/** All of a PDF page's own text, as one string (scanned plans, and most CAD plans, have none). */
export async function pageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}

/** A box around some of the plan's own text, in page units: [left, top, right, bottom]. */
export type TextBox = [number, number, number, number];

/**
 * Where a PDF page has text (dimensions, room names, notes), as boxes in page units — so the
 * print's labels can stay off it. Scanned plans have none.
 */
export async function extractTextBoxes(pdfjs: PdfJs, page: PDFPageProxy): Promise<TextBox[]> {
  return (await extractTextItems(pdfjs, page)).map((t) => t.box);
}

/** A PDF page's text, each piece with its box (as in `extractTextBoxes`). */
export async function extractTextItems(pdfjs: PdfJs, page: PDFPageProxy): Promise<{ str: string; box: TextBox }[]> {
  const vt = page.getViewport({ scale: 1 }).transform as Matrix;
  const content = await page.getTextContent();
  const out: { str: string; box: TextBox }[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim() || !(item.width > 0)) continue;
    const t = pdfjs.Util.transform(vt, item.transform) as Matrix;
    const along = Math.hypot(t[0], t[1]);
    const tall = Math.hypot(t[2], t[3]);
    if (!(along > 0) || !(tall > 0)) continue;
    const ux = t[0] / along;
    const uy = t[1] / along;
    // "Up" from the baseline (the text's own vertical, whichever way it's turned).
    const vx = t[2] / tall;
    const vy = t[3] / tall;
    const [x, y] = [t[4], t[5]];
    const w = item.width;
    const corners: [number, number][] = [
      [x - vx * tall * 0.25, y - vy * tall * 0.25], // below the baseline (descenders)
      [x + ux * w - vx * tall * 0.25, y + uy * w - vy * tall * 0.25],
      [x + ux * w + vx * tall, y + uy * w + vy * tall],
      [x + vx * tall, y + vy * tall],
    ];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    out.push({ str: item.str.trim(), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
  }
  return out;
}
