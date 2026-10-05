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
 */
export async function extractSegments(pdfjs: PdfJs, page: PDFPageProxy): Promise<Float32Array> {
  const { OPS } = pdfjs;
  const list = await page.getOperatorList();
  const vt = page.getViewport({ scale: 1 }).transform as Matrix;
  const out: number[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];

  for (let i = 0; i < list.fnArray.length && out.length < MAX_SEGMENTS * 4; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
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
      const seg = (a: [number, number], b: [number, number]) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len >= MIN_SEGMENT || len === 0) out.push(a[0], a[1], b[0], b[1]);
      };
      for (let j = 0; j < data.length;) {
        const op = data[j++];
        if (op === DrawOPS.moveTo) {
          cur = start = tx(data[j++], data[j++]);
        } else if (op === DrawOPS.lineTo) {
          const p = tx(data[j++], data[j++]);
          if (cur) seg(cur, p);
          cur = p;
        } else if (op === DrawOPS.curveTo) {
          j += 4;
          const p = tx(data[j++], data[j++]);
          if (cur) out.push(cur[0], cur[1], cur[0], cur[1], p[0], p[1], p[0], p[1]);
          cur = p;
        } else if (op === DrawOPS.quadraticCurveTo) {
          j += 2;
          const p = tx(data[j++], data[j++]);
          if (cur) out.push(p[0], p[1], p[0], p[1]);
          cur = p;
        } else if (op === DrawOPS.closePath) {
          if (cur && start) seg(cur, start);
          cur = start;
        } else {
          break; // unknown operator: stop reading this path
        }
      }
    }
  }
  return new Float32Array(out);
}
