/**
 * Plan lab: the clues a sheet gives about what it is (floor plan or not), for every page in test-plans/ —
 * door swings, arcs, words — next to its file name, to check the app's floor-plan guess (sheet-kind).
 *
 *   npx tsx scripts/plan-lab/kinds.mts [shard] [shards]     (writes test-plans/_lab/kinds-<shard>.jsonl)
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, pageText, type DoorSwing } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";
import { drawnDoors } from "../../src/lib/room-detect/sheet-kind";

const ROOT = join(process.cwd(), "test-plans");
const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const out = join(ROOT, "_lab", `${process.env.LAB_NAME ?? "kinds"}-${shard}.jsonl`);
const done = new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.file}#${j.page}`; }) : []);

function pdfsIn(dir: string): string[] {
  const res: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_lab")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) res.push(...pdfsIn(p));
    else if (name.toLowerCase().endsWith(".pdf")) res.push(p);
  }
  return res.sort();
}

// Each sheet's scale from the inventory (written on it, or from its door swings; 1/8" if neither).
const scales = new Map<string, number>();
for (const f of readdirSync(join(ROOT, "_lab")).filter((n) => /^inventory-\d+\.jsonl$/.test(n)))
  for (const l of readFileSync(join(ROOT, "_lab", f), "utf8").split("\n").filter(Boolean)) {
    const j = JSON.parse(l);
    scales.set(`${j.file}#${j.page}`, j.scale?.upf ?? j.wallScale?.upf ?? 9);
  }

const files = pdfsIn(ROOT).filter((_, i) => i % shards === shard);
for (const f of files) {
  const file = relative(ROOT, f).replace(/\\/g, "/");
  let task;
  try {
    task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(f)), verbosity: 0 });
    const doc = await task.promise;
    for (let n = 1; n <= Math.min(doc.numPages, 60); n++) {
      if (done.has(`${file}#${n}`)) continue;
      const page = await doc.getPage(n);
      const swings: DoorSwing[] = [];
      const arcs: number[] = [];
      const segs = await extractSegments(pdfjs as never, page as never, arcs, undefined, swings);
      const text = await pageText(page as never).catch(() => "");
      appendFileSync(out, JSON.stringify({ file, page: n, segs: segs.length / 4, arcs: arcs.length, swings: swings.length, upf: scales.get(`${file}#${n}`) ?? 9, doors: drawnDoors(segs, swings, scales.get(`${file}#${n}`) ?? 9), text: text.replace(/\s+/g, " ").slice(0, 4000) }) + "\n");
    }
  } catch (e) {
    console.log(file, e instanceof Error ? e.message : e);
  } finally {
    await task?.destroy();
  }
}
console.log("done");
