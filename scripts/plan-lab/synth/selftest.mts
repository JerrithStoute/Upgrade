/** Proves the automatic checks catch a wrong answer key: npx tsx scripts/plan-lab/synth/selftest.mts */
import { makePlan, answerKey, check } from "./make.mjs";
const m = (await makePlan(3))!;
const good = answerKey(m);
const tests: [string, (k: typeof good) => void][] = [
  ["right key", () => {}],
  ["walls 1 inch off", (k) => k.walls.forEach((w) => w.points.forEach((p) => (p[1] += m.upf / 12)))],
  ["walls said 2 inches thicker", (k) => k.walls.forEach((w) => (w.drawnIn += 2))],
  ["a door's hinge 6 inches off", (k) => { const d = k.doors.find((x) => x.type === "door")!; d.hinge![0] += m.upf / 2; }],
  ["a made-up wall", (k) => k.walls.push({ ...k.walls[0], points: [[100, 100], [300, 100]] })],
];
for (const [name, spoil] of tests) {
  const k = JSON.parse(JSON.stringify(good));
  spoil(k);
  const bad = await check(m, k);
  console.log(`${name.padEnd(28)} → ${bad.length ? "CAUGHT: " + bad.join("; ") : "passes"}`);
}
