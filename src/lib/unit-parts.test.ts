import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanParts,
  cleanValues,
  defaultParts,
  duplicatePairs,
  itemFields,
  itemValues,
  likelySame,
  lineSummary,
  ownPart,
  readParts,
  readSizeCode,
  unitName,
  withChoice,
  withAlias,
  withUsedChoices,
  writeParts,
  type UnitItem,
} from "./unit-parts";

const doors = defaultParts("door");
const windows = defaultParts("window");
const s2868 = readSizeCode("2868")!;
const s3050 = readSizeCode("3050")!;

test("names are what they were before parts could change", () => {
  assert.equal(unitName("door", doors, s2868, { ext: "Int", type: "Prehung", Core: "Hollow", Jamb: "2x4" }), "2868 Int Prehung Hollow 2x4 Jamb");
  assert.equal(unitName("door", doors, readSizeCode("3068")!, { ext: "Ext", type: "Entry", Core: "Solid", Jamb: "2x6" }), "3068 Ext Entry Solid 2x6 Jamb");
  assert.equal(unitName("window", windows, s3050, { type: "Single Hung", color: "Standard" }), "3050 Single Hung");
  assert.equal(unitName("window", windows, s3050, { type: "Single Hung", color: "White/Black" }), "3050 Single Hung White/Black");
  // A typed-in detail from before reads as it did; a yes / no shows its name when Yes.
  const old = readParts("door", JSON.stringify([{ name: "Door Swing", kind: "text" }, { name: "Full Lt", kind: "yesno" }]));
  assert.equal(old.migrated, true);
  assert.equal(
    unitName("door", old.parts, readSizeCode("3068")!, { ext: "Ext", type: "Entry", Core: "Solid", Jamb: "2x6", "Door Swing": "LH", "Full Lt": "Yes" }),
    "3068 Ext Entry Solid 2x6 Jamb Door Swing LH Full Lt",
  );
  const grids = readParts("window", JSON.stringify([{ name: "Grids", kind: "yesno" }, { name: "Glass", kind: "text" }])).parts;
  assert.equal(unitName("window", grids, readSizeCode("5040")!, { type: "Picture", color: "Black/Black", Grids: "Yes", Glass: "Low-E" }), "5040 Picture Black/Black Grids Glass Low-E");
  assert.equal(unitName("window", grids, readSizeCode("5040")!, { type: "Picture", color: "Black/Black", Grids: "No" }), "5040 Picture Black/Black", "a no isn't in the name");
});

test("less detail: a part not asked isn't in the name", () => {
  const plain = cleanParts("door", doors.map((p) => (p.key === "Core" || p.key === "Jamb" ? { ...p, ask: false } : p)));
  assert.equal(unitName("door", plain, s2868, { ext: "Int", type: "Prehung", Core: "Solid", Jamb: "2x6" }), "2868 Int Prehung");
  // Int / Ext can't be turned off.
  assert.equal(cleanParts("door", doors.map((p) => ({ ...p, ask: false }))).find((p) => p.key === "ext")!.ask, true);
  // Nothing asked past the size: still says what it is.
  const bare = cleanParts("window", windows.map((p) => ({ ...p, ask: false })));
  assert.equal(unitName("window", bare, s3050, {}), "3050 Window");
});

test("the odd door: a part in the name only when it isn't the usual", () => {
  const material = { ...ownPart("Material", "pick"), choices: ["Wood", "Metal", "Fiberglass"], usual: "Wood", inName: "unusual" as const };
  const parts = cleanParts("door", [...doors, material]);
  assert.equal(unitName("door", parts, s2868, { ext: "Int", type: "Prehung", Core: "Hollow", Jamb: "2x4", Material: "Wood" }), "2868 Int Prehung Hollow 2x4 Jamb");
  assert.equal(unitName("door", parts, readSizeCode("3068")!, { ext: "Ext", type: "Prehung", Core: "Solid", Jamb: "2x6", Material: "Metal" }), "3068 Ext Prehung Solid 2x6 Jamb Metal");
});

test("choices: added once, never a near-copy", () => {
  const r = withChoice(doors, "type", "  metal   fire door ");
  assert.ok(typeof r !== "string");
  assert.equal(r.value, "metal fire door");
  assert.ok(r.parts.find((p) => p.key === "type")!.choices.includes("metal fire door"));
  const again = withChoice(r.parts, "type", "Metal Fire Door");
  assert.ok(typeof again !== "string");
  assert.equal(again.value, "metal fire door");
  assert.equal(again.parts, r.parts);
  assert.equal(withChoice(doors, "type", "PREHUNG").toString(), withChoice(doors, "type", "PREHUNG").toString());
  assert.equal((withChoice(doors, "type", "PREHUNG") as { value: string }).value, "Prehung");
  assert.equal(typeof withChoice(doors, "ext", "Garage"), "string");
});

test("picks are checked against the choices", () => {
  assert.deepEqual(cleanValues(doors, { ext: "ext", type: "prehung", Core: "Solid", Jamb: "2x6", extra: "x" }), { ext: "Ext", type: "Prehung", Core: "Solid", Jamb: "2x6" });
  assert.equal(typeof cleanValues(doors, { ext: "Int", type: "Garage door", Core: "Solid", Jamb: "2x6" }), "string");
  assert.equal(typeof cleanValues(doors, { ext: "Int", type: "", Core: "Solid", Jamb: "2x6" }), "string");
  // A part carried over from typed-in details may stay blank; a yes / no left out is No.
  const old = readParts("window", JSON.stringify([{ name: "Glass", kind: "text" }, { name: "Grids", kind: "yesno" }])).parts;
  assert.deepEqual(cleanValues(old, { type: "Picture", color: "Standard" }), { type: "Picture", color: "Standard", Grids: "No" });
});

test("what's saved reads back; what was used before becomes choices", () => {
  const used = withUsedChoices(readParts("window", JSON.stringify([{ name: "Glass", kind: "text" }])).parts, [
    { type: "Fixed with 2 1640 sh sidelights", Glass: "Low-E" },
    { type: "single hung" },
  ]);
  const type = used.find((p) => p.key === "type")!;
  assert.ok(type.choices.includes("Fixed with 2 1640 sh sidelights"));
  assert.equal(type.choices.filter((c) => c.toLowerCase() === "single hung").length, 1);
  assert.deepEqual(used.find((p) => p.key === "Glass")!.choices, ["Low-E"]);
  const back = readParts("window", writeParts({ parts: used, notSame: ["a|b"], aliases: { "3050 single hung white": "w1" } }));
  assert.equal(back.migrated, false);
  assert.deepEqual(back.parts, used);
  assert.deepEqual(back.notSame, ["a|b"]);
  assert.deepEqual(back.aliases, { "3050 single hung white": "w1" });
  // Merged again later: what led to the dropped one leads to the one kept.
  const twice = withAlias(withAlias(back, "3050 single hung standard", "w2", "w1"), "3050 single hung", "w1", "w9");
  assert.deepEqual(twice.aliases, { "3050 single hung white": "w9", "3050 single hung standard": "w9", "3050 single hung": "w9" });
  // Nothing saved yet: the parts every company starts with.
  assert.deepEqual(readParts("door", null).parts, doors);
});

test("own parts: no clash with a built-in one, no more than 8", () => {
  const many = Array.from({ length: 12 }, (_, i) => ownPart(`Part ${i}`, "yesno"));
  assert.equal(cleanParts("door", [...doors, ownPart("Type", "pick"), ownPart("size", "yesno"), ...many]).length, doors.length + 8);
});

test("picks are kept on the item where they always were", () => {
  const values = { ext: "Ext", type: "Entry", Core: "Solid", Jamb: "2x6", "Full Lt": "No" };
  const f = itemFields("door", values);
  assert.deepEqual(f, { exterior: true, style: "Entry", color: null, details: JSON.stringify({ Core: "Solid", Jamb: "2x6" }) });
  assert.deepEqual(itemValues(f), { Core: "Solid", Jamb: "2x6", ext: "Ext", type: "Entry" });
  assert.equal(lineSummary(doors, itemValues(f)), "Entry · Solid · 2x6");
  assert.deepEqual(itemFields("window", { type: "Picture", color: "Black/Black" }), { exterior: null, style: "Picture", color: "Black/Black", details: null });
});

test("likely duplicates: what isn't known isn't a difference; a different pick is", () => {
  const full = cleanParts("door", [...doors, { ...ownPart("Full Lt", "text"), choices: ["Full LT"] }]);
  const forKind = (k: string) => (k === "door" ? full : windows);
  const item = (id: string, name: string, o: Partial<UnitItem> = {}): UnitItem => ({ id, name, kind: "doors", widthIn: 32, heightIn: 80, exterior: false, ...o });
  const parts = (name: string, style: string, core = "Hollow") => ({ style, details: JSON.stringify({ Core: core, Jamb: "2x4" }) });
  // Typed in before the door list: says nothing about its type, so it may be the prehung one.
  const old = item("a", "2868 Hollow Core");
  const prehung = item("b", "2868 Int Prehung Hollow 2x4 Jamb", parts("x", "Prehung"));
  const slab = item("c", "2868 Int Slab Hollow 2x4 Jamb", parts("x", "Slab"));
  const ext = item("d", "2868 Ext Prehung Hollow 2x4 Jamb", { ...parts("x", "Prehung"), exterior: true });
  const pocket = item("e", "2868 Pocket Door");
  assert.equal(likelySame(old, prehung, full), true);
  assert.equal(likelySame(prehung, slab, full), false);
  assert.equal(likelySame(prehung, ext, full), false);
  assert.equal(likelySame(old, item("f", "3068 Hollow Core", { widthIn: 36 }), full), false);
  assert.equal(likelySame(old, { ...prehung, kind: "windows" }, full), false);
  // Its name says what it is: "2868 Pocket Door" is a pocket door, not the prehung one.
  assert.equal(likelySame(pocket, prehung, full), false);
  // Full lite or not: one made from parts without it isn't one.
  const ext2880 = item("g", "2880 Ext Prehung Solid 2x4 Jamb", { ...parts("x", "Prehung", "Solid"), exterior: true });
  const lite = item("h", "2880 Ext Prehung Solid 2x4 Jamb Full Lt Full LT", { exterior: true, style: "Prehung", details: JSON.stringify({ Core: "Solid", Jamb: "2x4", "Full Lt": "Full LT" }) });
  assert.equal(likelySame(ext2880, lite, full), false);
  // Windows: no color saved, but the name says Standard.
  const w = (id: string, name: string, color: string | null, style = "Single Hung"): UnitItem => ({ id, name, kind: "windows", widthIn: 36, heightIn: 60, style, color });
  assert.equal(likelySame(w("1", "3050 Single Hung Black/Black", "Black/Black"), w("2", "3050 Single Hung White/Black", "White/Black"), windows), false);
  assert.equal(likelySame(w("1", "3050 Single hung", null, "Single hung"), w("2", "3050 Single Hung", "Standard"), windows), true);
  assert.equal(likelySame(w("1", "3050 Single Hung", null), w("2", "3050 Single Hung Bronze", "Bronze"), windows), false);
  assert.deepEqual(
    duplicatePairs([old, prehung, slab, ext], forKind).map((p) => p.key),
    ["a|b", "a|c"],
  );
  assert.deepEqual(
    duplicatePairs([old, prehung, slab], forKind, ["a|b"]).map((p) => p.key),
    ["a|c"],
  );
});
