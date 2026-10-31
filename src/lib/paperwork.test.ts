import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOpen, maskTaxId, paperLines, paperworkWarning, problems, readNeeds, readWho, setNeeds, type PaperDoc, type PaperType } from "./paperwork";

const W9: PaperType = { id: "w9", name: "W-9", kind: "W9", expires: false, usual: true, sortOrder: 0 };
const INS: PaperType = { id: "ins", name: "Insurance", kind: "INSURANCE", expires: true, usual: true, sortOrder: 1 };
const AGR: PaperType = { id: "agr", name: "Contractor agreement", kind: null, expires: false, usual: false, sortOrder: 2 };
const TYPES = [W9, INS, AGR];
const today = new Date(2026, 9, 31);
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
let n = 0;
const doc = (typeId: string, expiresAt: Date | null, more: Partial<PaperDoc> = {}): PaperDoc => ({
  id: `d${++n}`,
  typeId,
  expiresAt,
  confirmed: true,
  fileName: "f.pdf",
  storagePath: "x",
  createdAt: d(2026, 1, 1),
  ...more,
});
const fmt = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`;

test("a vendor never set up needs the usual kinds, since the day they were added", () => {
  assert.deepEqual(readNeeds(null, TYPES, d(2026, 10, 2)), { w9: "2026-10-02", ins: "2026-10-02" });
  // Saved: exactly what was ticked (nothing is fine — a one-time sub), unknown kinds dropped.
  assert.deepEqual(readNeeds("{}", TYPES, today), {});
  assert.deepEqual(readNeeds('{"agr":"2026-10-05","gone":"2026-01-01","w9":"bad"}', TYPES, today), { agr: "2026-10-05" });
  assert.deepEqual(readNeeds("not json", TYPES, today), {});
});

test("ticking keeps the date a kind was first needed", () => {
  assert.deepEqual(setNeeds({ w9: "2026-09-01" }, ["w9", "agr", "agr"], today), { w9: "2026-09-01", agr: "2026-10-31" });
});

test("missing, on file, and not needed", () => {
  const lines = paperLines(TYPES, { w9: "2026-10-19", agr: "2026-10-31" }, [doc("w9", null)], today);
  assert.deepEqual(
    lines.map((l) => [l.type.id, l.status]),
    [
      ["w9", "ok"],
      ["ins", "notNeeded"],
      ["agr", "missing"],
    ],
  );
  assert.equal(daysOpen(lines[2].since, today), 0);
  assert.equal(paperworkWarning(lines, fmt), "Contractor agreement missing");
  // A paper they uploaded doesn't count until it's looked at.
  const up = paperLines(TYPES, { w9: "2026-10-19" }, [doc("w9", null, { confirmed: false })], today);
  assert.equal(up[0].status, "missing");
  assert.equal(up[0].toConfirm, 1);
  assert.equal(daysOpen(up[0].since, today), 12);
});

test("insurance: good while one is current, counting down to the first to run out", () => {
  const needs = { ins: "2026-01-01" };
  const gl = doc("ins", d(2027, 3, 1));
  const wc = doc("ins", d(2026, 11, 18));
  let [, ins] = paperLines(TYPES, needs, [gl, wc], today);
  assert.equal(ins.status, "soon");
  assert.equal(fmt(ins.expiresAt!), "11/18");
  assert.equal(paperworkWarning([ins], fmt), "Insurance expires 11/18");
  // The old one ran out but a renewal is on file: still good, the old one greyed.
  [, ins] = paperLines(TYPES, needs, [doc("ins", d(2026, 9, 30)), gl], today);
  assert.equal(ins.status, "ok");
  assert.equal(ins.docs.filter((x) => x.expired).length, 1);
  // All run out: expired since the last one did.
  [, ins] = paperLines(TYPES, needs, [doc("ins", d(2026, 9, 30)), doc("ins", d(2026, 10, 2))], today);
  assert.equal(ins.status, "expired");
  assert.equal(daysOpen(ins.since, today), 29);
  // Dropped in without its date yet.
  [, ins] = paperLines(TYPES, needs, [doc("ins", null)], today);
  assert.equal(ins.status, "noDate");
  // Not needed: an expired one isn't flagged, a good one still shows good.
  [, ins] = paperLines(TYPES, {}, [doc("ins", d(2026, 9, 30))], today);
  assert.equal(ins.status, "notNeeded");
  assert.equal(problems([ins]).length, 0);
  [, ins] = paperLines(TYPES, {}, [gl], today);
  assert.equal(ins.status, "ok");
});

test("expiring on the day itself is still current", () => {
  const [, ins] = paperLines(TYPES, { ins: "2026-01-01" }, [doc("ins", today)], today);
  assert.equal(ins.status, "soon");
});

test("who: positions, people and worked-out roles, nothing else", () => {
  assert.deepEqual(readWho('["pos:p1","user:u1","user:u1","role:manager","x:1",3,"user:a b"]'), ["pos:p1", "user:u1", "role:manager"]);
  assert.deepEqual(readWho(null), []);
  assert.deepEqual(readWho('{"a":1}'), []);
});

test("a tax ID shows only its last 4", () => {
  assert.equal(maskTaxId("72-1904471"), "••-•••4471");
  assert.equal(maskTaxId("123456789"), "•••••6789");
  assert.equal(maskTaxId(null), "");
});
