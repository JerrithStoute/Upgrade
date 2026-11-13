import { test } from "node:test";
import assert from "node:assert/strict";
import { addPoint, breakAt, breakOff, deletePiece, nearestEdge, pieceAt, removePoint, type Line } from "./line-pieces";
import type { Pt } from "./takeoff";

// A wall run: 4 corners, 3 pieces.
const run: Line = {
  points: [
    [0, 0],
    [100, 0],
    [100, 50],
    [200, 50],
  ],
  arcs: [],
};

test("the edge nearest a click, open or closed", () => {
  assert.equal(nearestEdge(run.points, [50, 3], false, 10)?.edge, 0);
  assert.equal(nearestEdge(run.points, [103, 25], false, 10)?.edge, 1);
  assert.equal(nearestEdge(run.points, [50, 40], false, 10), null);
  // Closed: the edge back from the last point to the first.
  const sq: Pt[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(nearestEdge(sq, [0.5, 5], true, 2)?.edge, 3);
  assert.equal(nearestEdge(sq, [0.5, 5], false, 2), null);
});

test("a piece broken off a run: before, the piece, after", () => {
  const r = breakOff(run, 1)!;
  assert.deepEqual(r.before?.points, [
    [0, 0],
    [100, 0],
  ]);
  assert.deepEqual(r.piece.points, [
    [100, 0],
    [100, 50],
  ]);
  assert.deepEqual(r.after?.points, [
    [100, 50],
    [200, 50],
  ]);
  // An end piece has nothing on one side.
  assert.equal(breakOff(run, 0)!.before, null);
  assert.equal(breakOff(run, 2)!.after, null);
  // A line that's one piece already: nothing to break off.
  assert.equal(breakOff({ points: run.points.slice(0, 2), arcs: [] }, 0), null);
});

test("a curve is one piece", () => {
  // Point 2 is an arc point: the curve runs 1 → 2 → 3.
  const curved: Line = { points: [[0, 0], [100, 0], [150, 25], [100, 50], [0, 50]], arcs: [2] };
  assert.deepEqual(pieceAt(curved, 1), [1, 3]);
  assert.deepEqual(pieceAt(curved, 2), [1, 3]);
  const r = breakOff(curved, 2)!;
  assert.deepEqual(r.piece, { points: [[100, 0], [150, 25], [100, 50]], arcs: [1] });
  assert.deepEqual(r.before?.arcs, []);
  assert.deepEqual(r.after?.points, [
    [100, 50],
    [0, 50],
  ]);
});

test("deleting a piece leaves what's on each side", () => {
  assert.equal(deletePiece(run, 1).length, 2);
  assert.deepEqual(
    deletePiece(run, 0).map((l) => l.points),
    [run.points.slice(1)],
  );
  assert.deepEqual(deletePiece({ points: run.points.slice(0, 2), arcs: [] }, 0), []);
});

test("broken at a corner: two lines sharing it", () => {
  const [a, b] = breakAt(run, 2)!;
  assert.deepEqual(a.points, run.points.slice(0, 3));
  assert.deepEqual(b.points, run.points.slice(2));
  assert.equal(breakAt(run, 0), null);
  assert.equal(breakAt(run, 3), null);
  assert.equal(breakAt({ ...run, arcs: [2] }, 2), null);
});

test("adding and removing points moves arc points along", () => {
  const curved: Line = { points: [[0, 0], [10, 0], [15, 5], [10, 10]], arcs: [2] };
  const more = addPoint(curved, 0, [5, 0]);
  assert.deepEqual(more.points[1], [5, 0]);
  assert.deepEqual(more.arcs, [3]);
  assert.deepEqual(removePoint(more, 1), curved);
  assert.deepEqual(removePoint(curved, 2).arcs, []);
});
