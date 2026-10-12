import { test } from "node:test";
import assert from "node:assert/strict";
import { labelBox, placeLabels } from "./label-placement";

const overlaps = (a: number[], b: number[]) => Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);

test("a label with nothing in the way stays where it is", () => {
  assert.deepEqual(placeLabels([{ x: 50, y: 50, w: 30, h: 10, deg: 0 }], []), [[50, 50]]);
});

test("two labels on the same spot don't cover each other", () => {
  const spots = [
    { x: 50, y: 50, w: 30, h: 10, deg: 0 },
    { x: 52, y: 51, w: 30, h: 10, deg: 0 },
  ];
  const [a, b] = placeLabels(spots, []);
  assert.deepEqual(a, [50, 50]);
  assert.ok(!overlaps(labelBox(a[0], a[1], 30, 10, 0), labelBox(b[0], b[1], 30, 10, 0)), `${a} / ${b}`);
  assert.ok(Math.hypot(b[0] - 52, b[1] - 51) < 15, "the second moves only as far as it has to");
});

test("a label moves off the plan's own text, staying inside its area", () => {
  const room: [number, number][] = [
    [0, 0],
    [200, 0],
    [200, 100],
    [0, 100],
  ];
  const text: [number, number, number, number][] = [[80, 40, 120, 60]]; // "BEDROOM 2" right where the label wants to go
  const [at] = placeLabels([{ x: 100, y: 50, w: 40, h: 10, deg: 0, region: room }], text);
  assert.ok(!overlaps(labelBox(at[0], at[1], 40, 10, 0), text[0]), `still on the text at ${at}`);
  assert.ok(at[0] > 0 && at[0] < 200 && at[1] > 0 && at[1] < 100, "inside the room");
});

test("a wall's label stays near its wall; turned labels move across their own direction", () => {
  const text: [number, number, number, number][] = [[95, 0, 105, 100]];
  const [at] = placeLabels([{ x: 100, y: 50, w: 40, h: 8, deg: 90, maxShift: 30 }], text);
  assert.ok(Math.hypot(at[0] - 100, at[1] - 50) <= 30);
  assert.ok(!overlaps(labelBox(at[0], at[1], 40, 8, 90), text[0]), `still on the text at ${at}`);
});

test("when there's no clear spot, it takes the least covered one — never another label", () => {
  const text: [number, number, number, number][] = [[-1000, -1000, 1000, 1000]]; // text everywhere
  const spots = [
    { x: 0, y: 0, w: 20, h: 10, deg: 0, maxShift: 50 },
    { x: 0, y: 0, w: 20, h: 10, deg: 0, maxShift: 50 },
  ];
  const [a, b] = placeLabels(spots, text);
  assert.ok(!overlaps(labelBox(a[0], a[1], 20, 10, 0), labelBox(b[0], b[1], 20, 10, 0)));
});
