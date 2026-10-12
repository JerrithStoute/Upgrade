import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_MEMBER_SIZES, starterItems } from "./starter-lumber-data";
import { DEFAULT_WALL_OPTIONS, itemNameKey, parseStockLengths, wallTakeoff } from "./takeoff";

const names = new Set(starterItems().map((i) => itemNameKey(i.name)));

test("a first wall takeoff finds every material it orders already in the starter Item List", () => {
  for (const studSize of ["2x4", "2x6"])
    for (const [heightFt, studLengthIn] of [
      [8, 92.625],
      [9, 104.625],
      [10, 116.625],
    ])
      for (const treatedBottom of [false, true]) {
        const o = { ...DEFAULT_WALL_OPTIONS, studLengthIn, treatedBottom, sheathingSides: 1 };
        const { lines } = wallTakeoff({ studSize, spacing: 16, heightFt }, o, [{ lengthFt: 40, closed: false, corners: 1 }]);
        const missing = lines.map((l) => l.name).filter((n) => !names.has(itemNameKey(n)));
        assert.deepEqual(missing, [], `${studSize} ${heightFt}' wall${treatedBottom ? ", treated" : ""}`);
      }
});

test("the starter Item List is small: only what a first wall takeoff uses", () => {
  assert.equal(starterItems().length, 12);
  assert.ok(starterItems().every((i) => !/ FJ\b/.test(i.name)), "no finger-jointed labels");
});

test("starter lumber: sawn to 24', 2x6 on to 32'", () => {
  const len = (n: string) => parseStockLengths(STARTER_MEMBER_SIZES.find((s) => s.name === n)!.stockLengths);
  assert.deepEqual(len("2x4"), [8, 10, 12, 14, 16, 18, 20, 22, 24]);
  assert.equal(Math.max(...len("2x6")!), 32);
  assert.equal(Math.max(...len("2x8")!), 24);
  assert.equal(Math.max(...len("2x10")!), 24);
  assert.equal(new Set(STARTER_MEMBER_SIZES.map((s) => itemNameKey(s.name))).size, STARTER_MEMBER_SIZES.length, "no duplicate names");
});
