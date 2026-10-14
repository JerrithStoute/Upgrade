import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fromWall, isZone, toWall, zonedTime, zoneOffset } from "./zone";
import { parseWeek, weekKey, nextWeek } from "./time-math";

// The server's zone is passed in, so these read the same wherever they run.
const SERVER = "America/Chicago";
const iso = (d: Date) => d.toISOString();
/** A wall date's own reading, whatever zone the test machine is in. */
const reading = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("company time zones", () => {
  it("knows each zone's offset, summer and winter", () => {
    assert.equal(zoneOffset(new Date("2026-07-01T12:00:00Z"), "America/Denver") / 3_600_000, -6);
    assert.equal(zoneOffset(new Date("2026-01-01T12:00:00Z"), "America/Denver") / 3_600_000, -7);
    assert.equal(zoneOffset(new Date("2026-07-01T12:00:00Z"), "America/Phoenix") / 3_600_000, -7);
    assert.equal(zoneOffset(new Date("2026-07-01T12:00:00Z"), "Pacific/Honolulu") / 3_600_000, -10);
  });

  it("turns a clock reading in a zone into the real moment", () => {
    assert.equal(iso(zonedTime("America/Denver", 2026, 10, 13, 7, 30)), "2026-10-13T13:30:00.000Z");
    assert.equal(iso(zonedTime("America/New_York", 2026, 1, 5, 0, 0)), "2026-01-05T05:00:00.000Z");
    // The morning after clocks go back (Nov 1, 2026) and forward (Mar 8, 2026).
    assert.equal(iso(zonedTime("America/Denver", 2026, 11, 1, 8, 0)), "2026-11-01T15:00:00.000Z");
    assert.equal(iso(zonedTime("America/Denver", 2026, 3, 8, 8, 0)), "2026-03-08T14:00:00.000Z");
  });

  it("shows a punch at the time on the company's wall", () => {
    const punch = new Date("2026-10-13T13:02:00Z"); // 7:02 am in Denver, 9:02 am in New York
    assert.equal(reading(toWall(punch, "America/Denver", SERVER)), "2026-10-13 07:02");
    assert.equal(reading(toWall(punch, "America/New_York", SERVER)), "2026-10-13 09:02");
  });

  it("a typed time means that time on the company's clock", () => {
    const typed = new Date(2026, 9, 13, 15, 30); // "Oct 13, 3:30 pm"
    assert.equal(iso(fromWall(typed, "America/Los_Angeles", "Etc/UTC")), "2026-10-13T22:30:00.000Z");
  });

  it("leaves a company in the server's own zone exactly as it was", () => {
    const d = new Date("2026-10-13T13:02:00Z");
    assert.equal(toWall(d, SERVER, SERVER), d);
    assert.equal(fromWall(d, SERVER, SERVER), d);
  });

  it("puts a late Sunday-night punch in the company's week, not the server's", () => {
    // Sunday Oct 11, 11:30 pm in Los Angeles is already Monday 1:30 am in Chicago.
    const punch = new Date("2026-10-12T06:30:00Z");
    assert.equal(weekKey(toWall(punch, "America/Los_Angeles", SERVER)), "2026-10-05");
    // …and that week runs from Monday midnight to Monday midnight, Pacific time.
    const monday = parseWeek("2026-10-05")!;
    const zone = "America/Los_Angeles";
    const utc = "Etc/UTC";
    assert.equal(iso(fromWall(monday, zone, utc)).slice(0, 16), "2026-10-05T07:00");
    assert.equal(iso(fromWall(nextWeek(monday), zone, utc)).slice(0, 16), "2026-10-12T07:00");
  });

  it("only takes zones from its own list", () => {
    assert.equal(isZone("America/Denver"), true);
    assert.equal(isZone("Mars/Olympus"), false);
    assert.equal(isZone(null), false);
  });
});
