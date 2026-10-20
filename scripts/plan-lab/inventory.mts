/**
 * Plan lab, step 1: what's in the test plans folder. For every page of every PDF in test-plans/ (any
 * depth): CAD line work or a scan, the scale (written on the sheet, or from door swings — the app's own
 * Recommended scale), how many door swings at that scale (a floor plan has several), whether its words
 * are real text or drawn as lines, and a fingerprint to spot copies of the same sheet.
 *
 *   npx tsx scripts/plan-lab/inventory.mts [shard] [shards]
 *
 * Writes test-plans/_lab/inventory-<shard>.jsonl (one line per page). Run several shards at once to go
 * faster; a page that's already listed is skipped, so it can be stopped and started again.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, appendFileSync } from "fs";
import { join, relative } from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, extractTextItems, type FillShape } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { recommendScale } from "../../src/lib/scale-recommend";

const ROOT = process.env.LAB_ROOT ?? join(process.cwd(), "test-plans");
const OUT = join(process.cwd(), "test-plans", "_lab");
const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
mkdirSync(OUT, { recursive: true });
const outFile = join(OUT, `${process.env.LAB_NAME ?? "inventory"}-${shard}.jsonl`);

function pdfsIn(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_lab")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pdfsIn(p));
    else if (name.toLowerCase().endsWith(".pdf")) out.push(p);
  }
  return out.sort();
}

/** How much line runs alongside another at each spacing (page units ×4, to ¼ unit). */
function gapHistogram(segs: Float32Array): Map<number, number> {
  const rows = new Map<number, [number, number][]>();
  const cols = new Map<number, [number, number][]>();
  for (let i = 0; i < segs.length; i += 4) {
    const [x1, y1, x2, y2] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]];
    if (Math.abs(y1 - y2) < 0.3 && Math.abs(x2 - x1) >= 30) {
      const k = Math.round(((y1 + y2) / 2) * 4);
      (rows.get(k) ?? rows.set(k, []).get(k)!).push([Math.min(x1, x2), Math.max(x1, x2)]);
    } else if (Math.abs(x1 - x2) < 0.3 && Math.abs(y2 - y1) >= 30) {
      const k = Math.round(((x1 + x2) / 2) * 4);
      (cols.get(k) ?? cols.set(k, []).get(k)!).push([Math.min(y1, y2), Math.max(y1, y2)]);
    }
  }
  const hist = new Map<number, number>();
  for (const lines of [rows, cols]) {
    const keys = [...lines.keys()].sort((a, b) => a - b);
    for (let a = 0; a < keys.length; a++)
      for (let b = a + 1; b < keys.length && keys[b] - keys[a] <= 24 * 4; b++) {
        const gap = keys[b] - keys[a];
        if (gap < 2 * 4) continue;
        let overlap = 0;
        for (const [p0, p1] of lines.get(keys[a])!) for (const [q0, q1] of lines.get(keys[b])!) overlap += Math.max(0, Math.min(p1, q1) - Math.max(p0, q0));
        if (overlap >= 30) hist.set(gap, (hist.get(gap) ?? 0) + overlap);
      }
  }
  return hist;
}

/**
 * The scale the walls say: drafters draw the stud — 3½" (2x4) and 5½" (2x6), or 4½" with the drywall —
 * so at the right scale a good share of the parallel lines come out those widths apart. Each common
 * plan scale scored by how much of the line work it puts there, plus door swings it makes 2'–3'6".
 */
function scaleFromWalls(hist: Map<number, number>, arcs: number[]) {
  const scales: [string, number][] = [["1/8\" = 1'-0\"", 9], ["3/16\" = 1'-0\"", 13.5], ["1/4\" = 1'-0\"", 18], ["3/8\" = 1'-0\"", 27], ["1/2\" = 1'-0\"", 36]];
  let total = 0;
  for (const v of hist.values()) total += v;
  const scored = scales.map(([label, upf]) => {
    let walls = 0;
    for (const [g, v] of hist) {
      const inches = (g / 4 / upf) * 12;
      if ([3.5, 4.5, 5.5].some((t) => Math.abs(inches - t) <= 0.3)) walls += v;
    }
    const swings = arcs.filter((r) => r / upf >= 1.9 && r / upf <= 3.6).length;
    return { label, upf, walls: total ? walls / total : 0, swings };
  });
  scored.sort((a, b) => b.walls + b.swings * 0.01 - (a.walls + a.swings * 0.01));
  return { best: scored[0], next: scored[1] };
}

const done = new Set<string>();
if (existsSync(outFile))
  for (const line of readFileSync(outFile, "utf8").split("\n"))
    if (line.trim()) {
      const r = JSON.parse(line);
      done.add(`${r.file}#${r.page}`);
    }

const files = pdfsIn(ROOT).filter((_, i) => i % shards === shard);
const { OPS } = pdfjs as unknown as { OPS: Record<string, number> };
let n = 0;
for (const path of files) {
  const file = relative(ROOT, path).replace(/\\/g, "/");
  n++;
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 });
  try {
    const doc = await task.promise;
    for (let p = 1; p <= doc.numPages; p++) {
      if (done.has(`${file}#${p}`)) continue;
      const t0 = Date.now();
      const row: Record<string, unknown> = { file, page: p, pages: doc.numPages };
      try {
        const page = await doc.getPage(p);
        const v = page.getViewport({ scale: 1 });
        row.w = Math.round(v.width);
        row.h = Math.round(v.height);
        const arcs: number[] = [];
        const fills: FillShape[] = [];
        const segs = await extractSegments(pdfjs as never, page as never, arcs, fills);
        const text = await extractTextItems(pdfjs as never, page as never);
        const ops = await page.getOperatorList();
        row.images = ops.fnArray.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject).length;
        row.segments = segs.length / 4;
        row.textItems = text.length;
        row.arcs = arcs.length;
        const words = text.map((t) => t.str).join(" ");
        const scale = recommendScale({ arcRadii: arcs, text: words });
        row.scale = scale ? { label: scale.label, upf: +(scale.paperInchesPerFoot * 72).toFixed(3), why: scale.why } : null;
        // Door swings at that scale: quarter circles 2'–3'6" across.
        const upf = scale ? scale.paperInchesPerFoot * 72 : 0;
        row.doorSwings = upf ? arcs.filter((r) => r / upf >= 1.9 && r / upf <= 3.6).length : 0;
        // Fills by color: count, and how many are small dark ones (words drawn as filled letters).
        const byColor: Record<string, number> = {};
        let darkSmall = 0;
        for (const f of fills) {
          byColor[f.color] = (byColor[f.color] ?? 0) + 1;
          const xs = f.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
          const ys = f.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
          const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          if (parseInt(f.color.slice(1), 16) < 0x404040 && size < 30) darkSmall++;
        }
        row.fills = fills.length;
        row.fillColors = Object.entries(byColor)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6);
        row.letterFills = darkSmall;
        row.titleWords = /floor\s*plan|first\s*floor|second\s*floor|main\s*floor|1st\s*floor|2nd\s*floor/i.test(words) ? "floor plan" : /elevation/i.test(words) ? "elevation" : /foundation|slab/i.test(words) ? "foundation" : /electric/i.test(words) ? "electrical" : /roof/i.test(words) ? "roof" : /site|plot/i.test(words) ? "site" : "";
        // The scale the walls say (when nothing's written): see scaleFromWalls.
        const byWalls = scaleFromWalls(gapHistogram(segs), arcs);
        row.wallScale = { label: byWalls.best.label, upf: byWalls.best.upf, walls: +byWalls.best.walls.toFixed(2), swings: byWalls.best.swings, next: byWalls.next.label, nextWalls: +byWalls.next.walls.toFixed(2) };
        // A fingerprint of the line work: copies of the same sheet match.
        let h = 0;
        for (let i = 0; i < Math.min(segs.length, 4000); i++) h = (h * 31 + Math.round(segs[i])) | 0;
        row.fingerprint = `${row.segments}:${h}`;
        row.kind = row.segments === 0 || (Number(row.segments) < 300 && Number(row.images) > 0) ? "scan" : "cad";
        page.cleanup();
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
      }
      row.ms = Date.now() - t0;
      appendFileSync(outFile, JSON.stringify(row) + "\n");
    }
  } catch (e) {
    appendFileSync(outFile, JSON.stringify({ file, page: 0, error: e instanceof Error ? e.message : String(e) }) + "\n");
  } finally {
    await task.destroy();
  }
  if (n % 20 === 0) console.log(`shard ${shard}: ${n}/${files.length} files`);
}
console.log(`shard ${shard}: done, ${files.length} files`);
