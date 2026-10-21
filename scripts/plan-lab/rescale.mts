/**
 * Plan lab: check each test sheet's guessed scale against its doors. At the right scale most door swings
 * come out a door's width — 2'-0" to 3'-0" (to the inch: 24, 28, 30, 32, 36"); at half or twice the scale
 * they don't. For each sheet whose scale was guessed (not written on it), the common plan scale that
 * makes the most swings a door's width is kept, when there are 4 or more. Written scales stay.
 *
 *   npx tsx scripts/plan-lab/rescale.mts        (rewrites test-plans/_lab/sheets.json; prints changes)
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSegments, type DoorSwing } from "../../src/app/(app)/projects/[id]/takeoff/[planId]/_components/pdf-vectors";

const LAB = join(process.cwd(), "test-plans", "_lab");
type Sheet = { id: string; file: string; page: number; upf: number; scaleFrom: string };
const sheets = JSON.parse(readFileSync(join(LAB, "sheets.json"), "utf8")) as Sheet[];
const SCALES: [string, number][] = [["1/8\" = 1'-0\"", 9], ["3/16\" = 1'-0\"", 13.5], ["1/4\" = 1'-0\"", 18], ["3/8\" = 1'-0\"", 27], ["1/2\" = 1'-0\"", 36]];
let changed = 0;
for (const sh of sheets) {
  if (!sh.scaleFrom.includes("from room sizes")) continue;
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(process.cwd(), "test-plans", sh.file))), verbosity: 0 });
  try {
    const page = await (await task.promise).getPage(sh.page);
    const swings: DoorSwing[] = [];
    await extractSegments(pdfjs as never, page as never, undefined, undefined, swings);
    const scored = SCALES.map(([label, upf]) => {
      const inches = swings.map((d) => (d.r / upf) * 12);
      const wall = inches.filter((w) => [24, 28, 30, 32, 36].some((t) => Math.abs(w - t) <= 1)).length;
      return { label, upf, wall };
    });
    scored.sort((a, b) => b.wall - a.wall);
    const best = scored[0];
    if (best.wall >= 4 && best.wall > (scored[1]?.wall ?? 0) && best.upf !== sh.upf) {
      console.log(`${sh.id.slice(0, 60).padEnd(60)} ${sh.upf} → ${best.upf}  (${scored.map((s) => `${s.upf}:${Math.round(s.wall)}`).join(" ")})`);
      sh.upf = best.upf;
      sh.scaleFrom = `${best.label} (from door swings)`;
      changed++;
    }
  } catch (e) {
    console.log(`${sh.id}: ${e instanceof Error ? e.message : e}`);
  } finally {
    await task.destroy();
  }
}
writeFileSync(join(LAB, "sheets.json"), JSON.stringify(sheets, null, 1));
console.log(`${changed} sheets changed scale.`);
