/**
 * Plan lab: is a page a floor plan, and at what scale? Let Find area say. Every CAD page from the
 * inventory (one copy of each, not titled an elevation, foundation, roof or site plan) is clicked at
 * 48 spots across its drawing at each common plan scale — or just the written one, when the sheet says.
 * A floor plan at its scale gives several closed rooms of ordinary sizes (most 60–300 sq ft); an
 * elevation or a page of notes gives next to nothing, and a wrong scale gives rooms 4× too big or small:
 * the scale is the one whose middle-sized room is most like a real house's.
 *
 *   npx tsx scripts/plan-lab/probe.mts [shard] [shards]
 *
 * Writes test-plans/_lab/probe-<shard>.jsonl: per page, rooms found and their middle size at each scale
 * tried, and the verdict.
 */
import { appendFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, type FillShape } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { findRoom } from "../../src/lib/room-detect";

const LAB = join(process.cwd(), "test-plans", "_lab");
const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const outFile = join(LAB, `${process.env.LAB_NAME ? `${process.env.LAB_NAME}-probe` : "probe"}-${shard}.jsonl`);
const ROOT = process.env.LAB_ROOT ?? join(process.cwd(), "test-plans");
type Row = { file: string; page: number; kind?: string; error?: string; segments?: number; titleWords?: string; fingerprint?: string; scale?: { label: string; upf: number; why: string } | null };
const rows: Row[] = readdirSync(LAB)
  .filter((f) => f.startsWith(`${process.env.LAB_NAME ?? "inventory"}-`) && /-\d+\.jsonl$/.test(f) && !f.includes("probe"))
  .flatMap((f) => readFileSync(join(LAB, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row))
  .filter((r) => r.page > 0 && !r.error && r.kind === "cad" && (r.segments ?? 0) >= 3000 && !["elevation", "foundation", "roof", "site"].includes(r.titleWords ?? ""))
  .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.page - b.page));
const seen = new Set<string>();
const pages = rows.filter((r) => !r.fingerprint || (!seen.has(r.fingerprint) && seen.add(r.fingerprint))).filter((_, i) => i % shards === shard);
const done = new Set(existsSync(outFile) ? readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.file}#${r.page}`; }) : []);

const SCALES: [string, number][] = [["1/8\" = 1'-0\"", 9], ["3/16\" = 1'-0\"", 13.5], ["1/4\" = 1'-0\"", 18], ["3/8\" = 1'-0\"", 27], ["1/2\" = 1'-0\"", 36]];
// Each page in a process of its own, given 3 minutes: a click that never comes back can't be stopped
// from inside (that page is "too slow" — a bug to look into).
if (!process.env.PROBE_ONE) {
  const { spawnSync } = await import("child_process");
  let k = 0;
  for (const r of pages) {
    k++;
    if (done.has(`${r.file}#${r.page}`)) continue;
    const res = spawnSync(process.execPath, [...process.execArgv, process.argv[1], String(shard), String(shards)], {
      env: { ...process.env, PROBE_ONE: `${r.file}#${r.page}` },
      timeout: 180_000,
      encoding: "utf8",
    });
    if (res.error || res.status !== 0) {
      appendFileSync(outFile, JSON.stringify({ file: r.file, page: r.page, tooSlow: true, floorPlan: false, error: res.error ? "over 3 minutes" : `exit ${res.status}` }) + "\n");
      console.log(`${k}/${pages.length} ${r.file} p${r.page}: TOO SLOW (stopped after 3 minutes)`);
    } else process.stdout.write(res.stdout);
  }
    process.exit(0);
}
let n = 0;
for (const r of pages) {
  n++;
  if (`${r.file}#${r.page}` !== process.env.PROBE_ONE) continue;
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(ROOT, r.file))), verbosity: 0 });
  const out: Record<string, unknown> = { file: r.file, page: r.page };
  try {
    const page = await (await task.promise).getPage(r.page);
    const fills: FillShape[] = [];
    const segs = await extractSegments(pdfjs as never, page as never, undefined, fills);
    // The drawing: the middle of the line work.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < segs.length; i += 4) {
      xs.push(segs[i], segs[i + 2]);
      ys.push(segs[i + 1], segs[i + 3]);
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const q = (a: number[], f: number) => a[Math.floor(a.length * f)] ?? 0;
    const [x0, x1, y0, y1] = [q(xs, 0.15), q(xs, 0.85), q(ys, 0.15), q(ys, 0.85)];
    const written = r.scale?.why.startsWith("The sheet says") ? r.scale : null;
    const tries = written ? [[written.label, written.upf] as [string, number]] : SCALES;
    const results: { label: string; upf: number; rooms: number; middle: number }[] = [];
    // (A click over 5 seconds — Find area would freeze the app there — is noted and the page skipped:
    // a bug to look into, not something to wait out.)
    let slowest = 0;
    for (const [label, upf] of tries) {
      if (slowest > 5000) break;
      const found = new Map<string, number>();
      for (let i = 0; i < 8 && slowest <= 5000; i++)
        for (let j = 0; j < 6 && slowest <= 5000; j++) {
          const tc = performance.now();
          const res = findRoom(segs, [x0 + ((i + 0.5) / 8) * (x1 - x0), y0 + ((j + 0.5) / 6) * (y1 - y0)], { unitsPerFoot: upf, fills });
          slowest = Math.max(slowest, performance.now() - tc);
          if (res.ok && res.areaSf >= 15 && res.areaSf <= 1500) found.set(`${res.areaSf.toFixed(0)}:${Math.round(res.outline[0][0])}`, res.areaSf);
        }
      const sizes = [...found.values()].sort((a, b) => a - b);
      results.push({ label, upf, rooms: sizes.length, middle: Math.round(sizes[Math.floor(sizes.length / 2)] ?? 0) });
    }
    // The verdict: among the scales that find plenty of rooms, the one whose middle-sized room is most
    // like a real house's (about 130 sq ft — Stoute 129, Whitfield 139, Bryant 136, O'Quinn 92).
    const most = Math.max(0, ...results.map((t) => t.rooms));
    const ok = results
      .filter((t) => t.rooms >= Math.max(4, most * 0.6) && t.middle >= 40 && t.middle <= 400)
      .sort((a, b) => Math.abs(Math.log(a.middle / 130)) - Math.abs(Math.log(b.middle / 130)));
    out.tries = results;
    out.writtenScale = !!written;
    out.slowestClickMs = Math.round(slowest);
    if (slowest > 5000) out.tooSlow = true;
    out.floorPlan = slowest <= 5000 && (ok[0]?.rooms ?? 0) >= 4;
    out.upf = ok[0]?.upf ?? null;
    out.scale = ok[0]?.label ?? null;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  } finally {
    await task.destroy();
  }
  appendFileSync(outFile, JSON.stringify(out) + "\n");
  console.log(`${n}/${pages.length} ${r.file} p${r.page}: ${out.tooSlow ? `TOO SLOW (${out.slowestClickMs} ms a click)` : out.floorPlan ? out.scale : out.error ? "error" : "not a floor plan"}`);
}
console.log(`shard ${shard}: done, ${pages.length} pages`);
