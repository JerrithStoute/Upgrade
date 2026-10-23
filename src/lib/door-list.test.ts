import { test } from "node:test";
import assert from "node:assert/strict";
import { doorName, readCore, readJamb, readSizeCode, withDoorDetail } from "./door-list";

test("a door's name says what goes on the bid", () => {
  const size = readSizeCode("2868")!;
  assert.deepEqual(size, { widthIn: 32, heightIn: 80 });
  assert.equal(doorName({ ...size, exterior: false, type: "Prehung", jamb: "2x4", core: "Hollow" }), "2868 Int Prehung Hollow 2x4 Jamb");
  const swing = [{ name: "Door Swing", kind: "text" as const }];
  assert.equal(
    doorName({ ...readSizeCode("3068")!, exterior: true, type: "Entry", jamb: "2x6", core: "Solid", details: swing, values: { "Door Swing": "LH" } }),
    "3068 Ext Entry Solid 2x6 Jamb Door Swing LH",
  );
  assert.equal(readJamb("2x8"), "2x8");
  assert.equal(readJamb("nonsense"), "2x4");
  assert.equal(readCore("Solid"), "Solid");
});

test("details of your own: Door Swing yes, the built-in ones no", () => {
  const one = withDoorDetail([], "Door Swing", "text");
  assert.deepEqual(one, [{ name: "Door Swing", kind: "text" }]);
  assert.equal(withDoorDetail([], "Jamb", "text"), "Every door already has jamb");
  assert.equal(withDoorDetail([], "", "text"), "Name the detail, like Door Swing");
  assert.equal(withDoorDetail(one as { name: string; kind: "text" }[], "door swing", "yesno"), "There's already a door swing");
});
