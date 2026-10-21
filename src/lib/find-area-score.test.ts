import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreByVersion, scoresWorse, type FindLogRow, type ShapeNow } from "./find-area-score";
import { drawnDoors, looksLikeFloorPlan } from "./room-detect/sheet-kind";

const t0 = new Date("2026-10-20T10:00:00Z");
const later = new Date("2026-10-20T10:05:00Z");
const square = JSON.stringify([
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
]);
const row = (over: Partial<FindLogRow>): FindLogRow => ({
  version: "v1",
  ok: true,
  reason: null,
  outline: square,
  measurementId: null,
  sheetId: "sh",
  conditionId: "c",
  ms: 100,
  createdAt: t0,
  ...over,
});
const shape = (id: string, points: number[][], conditionId = "c"): ShapeNow => ({ id, sheetId: "sh", conditionId, points: JSON.stringify(points), createdAt: later });

test("each found area is scored by what's on the plan now", () => {
  const rows = [
    row({ measurementId: "kept" }),
    row({ measurementId: "moved" }),
    row({ measurementId: "gone" }),
    row({ ok: false, reason: "open", outline: null }),
    row({ ok: false, reason: "open", outline: null }),
  ];
  const shapes = [
    shape("kept", JSON.parse(square)),
    shape("moved", [
      [0, 0],
      [90, 0],
      [90, 100],
      [0, 100],
    ]),
  ];
  const [s] = scoreByVersion(rows, shapes);
  assert.equal(s.kept, 1);
  assert.equal(s.changed, 1);
  assert.equal(s.removed, 1);
  assert.equal(s.split, 0);
  assert.deepEqual(s.noRoom, { open: 2 });
  assert.equal(s.rightShare, 1 / 3);
  assert.equal(s.foundShare, 3 / 5);
});

test("an area split in two counts as split, not taken back — but not pieces of another takeoff", () => {
  const halves = [
    [
      [0, 0],
      [60, 0],
      [60, 100],
      [0, 100],
    ],
    [
      [60, 0],
      [100, 0],
      [100, 100],
      [60, 100],
    ],
  ];
  const [s] = scoreByVersion([row({ measurementId: "orig" })], [shape("a", halves[0]), shape("b", halves[1])]);
  assert.equal(s.split, 1);
  const [other] = scoreByVersion([row({ measurementId: "orig" })], [shape("a", halves[0], "x"), shape("b", halves[1], "x")]);
  assert.equal(other.removed, 1);
});

test("a newer version is flagged only when it's 5 points worse with enough clicks to say", () => {
  const mk = (kept: number, removed: number, version: string, at: Date) =>
    scoreByVersion(
      [...Array.from({ length: kept }, (_, i) => row({ measurementId: `k${i}`, version, createdAt: at })), ...Array.from({ length: removed }, () => row({ measurementId: "gone", version, createdAt: at }))],
      Array.from({ length: kept }, (_, i) => shape(`k${i}`, JSON.parse(square))),
    )[0];
  const old = mk(18, 2, "old", t0); // 90%
  assert.equal(scoresWorse(mk(16, 4, "new", later), old), true, "80% vs 90%");
  assert.equal(scoresWorse(mk(17, 3, "new", later), old), false, "85% vs 90%: within 5");
  assert.equal(scoresWorse(mk(5, 5, "new", later), old), false, "too few to say");
});

test("a floor plan is told by its doors: a line from the hinge out to the arc", () => {
  const upf = 18;
  // A 3' door hinged at (100, 100), drawn open to (100, 46); the swing runs from there to (154, 100).
  const swing = { x: 100, y: 100, r: 54, a: [100, 46] as [number, number], b: [154, 100] as [number, number] };
  const leaf = [100, 100, 100, 46];
  assert.equal(drawnDoors(leaf, [swing], upf), 1);
  assert.equal(drawnDoors([0, 0, 10, 10], [swing], upf), 0, "an arc alone (a letter, an arched window) isn't a door");
  assert.equal(drawnDoors(leaf, [{ ...swing, r: 4 }], upf), 0, "too small for a door at this scale");
  const three = [0, 400, 800].flatMap((dx) => [100 + dx, 100, 100 + dx, 46]);
  const swings = [0, 400, 800].map((dx) => ({ ...swing, x: 100 + dx, a: [100 + dx, 46] as [number, number], b: [154 + dx, 100] as [number, number] }));
  assert.equal(looksLikeFloorPlan(three, swings, upf), true);
  assert.equal(looksLikeFloorPlan(three.slice(0, 8), swings, upf), false, "two doors");
});
