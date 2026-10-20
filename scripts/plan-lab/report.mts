/**
 * Plan lab, step 3: what looks wrong, sheet by sheet, from a run (run.mts) — and, given an earlier run,
 * what changed between them, click by click.
 *
 *   npx tsx scripts/plan-lab/report.mts <run> [earlier run]
 *
 * Flags per sheet:
 *   - too slow: a click took minutes (would freeze the app), or clicks average over half a second;
 *   - giant: a room over 1,200 sq ft (two rooms or a whole wing run together, unless it's a garage);
 *   - jagged: an outline with 24+ corners (something cutting into the room);
 *   - unsteady: two answers for what's plainly one room — middles within 2' of each other, sizes 1–15%
 *     apart (it depends where you click);
 *   - open: clicks inside the house that found no closed room;
 *   - walls: Find walls clicks on long lines that found no wall.
 * Writes test-plans/_lab/report-<run>.html (pictures and flags, worst first) and prints a summary.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const LAB = join(process.cwd(), "test-plans", "_lab");
const [run, before] = process.argv.slice(2);
type Room = { sf: number; outline: number[][]; clicks: number };
type Result = {
  sheet: { id: string; file: string; page: number; upf: number; scaleFrom?: string };
  tooSlow?: boolean;
  error?: string;
  rooms?: Room[];
  clicks?: Record<string, string>;
  walls?: { ok: boolean }[];
  areaMsPerClick?: number;
};
const load = (name: string) =>
  new Map(
    readdirSync(join(LAB, "runs", name))
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const r = JSON.parse(readFileSync(join(LAB, "runs", name, f), "utf8")) as Result;
        return [r.sheet.id, r] as const;
      }),
  );
const now = load(run);
const then = before ? load(before) : null;
const meta = new Map((JSON.parse(readFileSync(join(LAB, "sheets.json"), "utf8")) as { id: string; scaleFrom: string }[]).map((s) => [s.id, s.scaleFrom]));

const middle = (o: number[][]) => [o.reduce((a, p) => a + p[0], 0) / o.length, o.reduce((a, p) => a + p[1], 0) / o.length];
const rows = [...now.values()].map((r) => {
  const flags: string[] = [];
  if (r.tooSlow) flags.push(`too slow (${r.error ?? ""})`);
  else if (r.error) flags.push(`error: ${r.error}`);
  const rooms = (r.rooms ?? []).filter((m) => m.clicks >= 2);
  const upf = r.sheet.upf;
  if ((r.areaMsPerClick ?? 0) > 500) flags.push(`slow clicks: ${r.areaMsPerClick} ms each`);
  const giant = rooms.filter((m) => m.sf > 1200);
  if (giant.length) flags.push(`giant: ${giant.map((m) => Math.round(m.sf)).join(", ")} sq ft`);
  const jagged = rooms.filter((m) => m.outline.length >= 24);
  if (jagged.length) flags.push(`jagged: ${jagged.length} room${jagged.length > 1 ? "s" : ""} with 24+ corners`);
  let unsteady = 0;
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const [a, b] = [middle(rooms[i].outline), middle(rooms[j].outline)];
      const diff = Math.abs(rooms[i].sf - rooms[j].sf) / Math.max(rooms[i].sf, rooms[j].sf);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 2 * upf && diff > 0.01 && diff < 0.15) unsteady++;
    }
  if (unsteady) flags.push(`unsteady: ${unsteady} room${unsteady > 1 ? "s" : ""} change size with the click`);
  // Clicks inside the house (within the box of the rooms found) that found nothing.
  const pts = rooms.flatMap((m) => m.outline);
  let open = 0;
  let inside = 0;
  if (pts.length) {
    const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    for (const [k, v] of Object.entries(r.clicks ?? {})) {
      const [x, y] = k.split(",").map(Number);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      inside++;
      if (v === "open") open++;
    }
  }
  const openShare = inside ? open / inside : 0;
  if (openShare > 0.25) flags.push(`open: ${Math.round(openShare * 100)}% of clicks inside the house found no room`);
  const walls = r.walls ?? [];
  const wallMiss = walls.length ? walls.filter((w) => !w.ok).length / walls.length : 0;
  if (walls.length && wallMiss > 0.5) flags.push(`walls: ${Math.round(wallMiss * 100)}% of Find walls clicks found none`);
  // Against the earlier run.
  let changed = 0;
  let compared = 0;
  const prev = then?.get(r.sheet.id);
  if (prev?.clicks && r.clicks)
    for (const [k, v] of Object.entries(r.clicks)) {
      if (!(k in prev.clicks)) continue;
      compared++;
      if (prev.clicks[k] !== v) changed++;
    }
  const score = (r.tooSlow ? 10 : 0) + giant.length * 2 + jagged.length + unsteady + openShare * 6 + wallMiss * 2;
  return { r, flags, score, rooms: rooms.length, changed, compared };
});
rows.sort((a, b) => b.score - a.score);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html><meta charset="utf-8"><title>Plan lab ${esc(run)}</title>
<style>body{font:14px Arial;margin:16px;background:#f4f4f4}.s{background:#fff;margin:0 0 24px;padding:12px;border-radius:6px}img{max-width:100%;border:1px solid #ccc}
.f{color:#b00}.ok{color:#080}h2{font-size:16px;margin:0 0 4px}.m{color:#666;font-size:12px}</style>
<h1>Plan lab — ${esc(run)}${before ? ` vs ${esc(before)}` : ""}</h1>
<p>${rows.length} sheets. ${rows.filter((x) => x.flags.length).length} with something flagged. Worst first.</p>
${rows
  .map(
    (x) => `<div class="s"><h2>${esc(x.r.sheet.id)}</h2><div class="m">${esc(x.r.sheet.file)} p${x.r.sheet.page} · ${esc(meta.get(x.r.sheet.id) ?? "")} · ${x.rooms} rooms${
      then ? ` · ${x.changed} of ${x.compared} clicks changed since ${esc(before!)}` : ""
    }</div>
${x.flags.length ? `<ul class="f">${x.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : `<p class="ok">nothing flagged</p>`}
${existsSync(join(LAB, "runs", run, `${x.r.sheet.id}.png`)) ? `<img loading="lazy" src="runs/${encodeURIComponent(run)}/${encodeURIComponent(x.r.sheet.id)}.png">` : ""}</div>`,
  )
  .join("\n")}`;
writeFileSync(join(LAB, `report-${run}.html`), html);

const count = (re: RegExp) => rows.filter((x) => x.flags.some((f) => re.test(f))).length;
console.log(`${rows.length} sheets; flagged: too slow ${count(/too slow|slow clicks/)}, giant ${count(/giant/)}, jagged ${count(/jagged/)}, unsteady ${count(/unsteady/)}, open ${count(/^open/)}, walls ${count(/^walls/)}; nothing flagged ${rows.filter((x) => !x.flags.length).length}`);
if (then) {
  const changedSheets = rows.filter((x) => x.changed);
  console.log(`vs ${before}: ${changedSheets.length} sheets changed, ${changedSheets.reduce((n, x) => n + x.changed, 0)} clicks in all`);
}
console.log(`report: test-plans/_lab/report-${run}.html`);
