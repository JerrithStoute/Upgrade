/**
 * Plan lab: which sheets to test, from the probe (probe.mts: floor plan or not, and its scale, by what
 * Find area finds there). Floor plans only, one copy of each, at most `per` from each job folder — the
 * ones with the most rooms first.
 *
 *   npx tsx scripts/plan-lab/pick.mts [per job = 3]
 *
 * Writes test-plans/_lab/sheets.json and prints what was picked and what was left out, and why.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const LAB = join(process.cwd(), "test-plans", "_lab");
const per = Number(process.argv[2] ?? 3);
type Probe = { file: string; page: number; error?: string; floorPlan?: boolean; upf?: number | null; scale?: string | null; writtenScale?: boolean; tries?: { label: string; rooms: number; middle: number }[] };
const probes: Probe[] = readdirSync(LAB)
  .filter((f) => /^probe-\d+\.jsonl$/.test(f))
  .flatMap((f) => readFileSync(join(LAB, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Probe));

const why = new Map<string, number>();
const skip = (reason: string, n = 1) => why.set(reason, (why.get(reason) ?? 0) + n);
const byJob = new Map<string, (Probe & { rooms: number })[]>();
for (const p of probes) {
  if (p.error) skip("couldn't be read");
  else if (!p.floorPlan || !p.upf) skip("not a floor plan (Find area finds no ordinary rooms at any scale)");
  else {
    const job = p.file.split("/")[0];
    const rooms = p.tries?.find((t) => t.label === p.scale)?.rooms ?? 0;
    byJob.set(job, [...(byJob.get(job) ?? []), { ...p, rooms }]);
  }
}
// Sheets looked at and found not to be floor plans (by their id), and left out.
const NOT_PLANS = new Set(existsSync(join(LAB, "not-plans.txt")) ? readFileSync(join(LAB, "not-plans.txt"), "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : []);
const picked: { id: string; file: string; page: number; upf: number; scaleFrom: string }[] = [];
for (const [job, list] of byJob) {
  // One architect's plans in a job are drawn at one scale: the job's commonest floor plan scale (a
  // scale written on a sheet counts for that sheet), when room sizes alone disagree between copies.
  const votes = new Map<number, number>();
  for (const p of list) votes.set(p.upf!, (votes.get(p.upf!) ?? 0) + 1);
  const common = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  for (const p of list)
    if (!p.writtenScale && p.upf !== common && (votes.get(p.upf!) ?? 0) < (votes.get(common) ?? 0)) {
      p.scale = `${p.scale} → job's usual scale`;
      p.upf = common;
    }
  list.sort((a, b) => b.rooms - a.rooms);
  let kept = 0;
  for (const p of list) {
    if (kept >= per) break;
    const id = `${job}--${p.file.split("/").pop()!.replace(/\.pdf$/i, "")}--p${p.page}`.replace(/[^\w.-]+/g, "_").slice(0, 120);
    if (NOT_PLANS.has(id)) {
      skip("looked at, not a floor plan");
      continue;
    }
    kept++;
    picked.push({ id, file: p.file, page: p.page, upf: p.upf!, scaleFrom: `${p.scale} (${p.writtenScale ? "written on the sheet" : "from room sizes"})` });
  }
  if (list.length > per) skip(`more floor plans from a job than the ${per} kept`, list.length - per);
}
writeFileSync(join(LAB, "sheets.json"), JSON.stringify(picked, null, 1));
console.log(`${probes.length} pages probed; picked ${picked.length} floor plan sheets from ${byJob.size} jobs.`);
for (const [r, n] of [...why].sort((a, b) => b[1] - a[1])) console.log(`  left out: ${n} — ${r}`);
