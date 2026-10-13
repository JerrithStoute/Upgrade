import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dayBounds, skyOf, stateCode, summarizeDay, zip5 } from "./weather-summary";

const TZ = "America/Chicago";
const at = (iso: string) => new Date(iso);
const r = (iso: string, tempF: number | null, text: string) => ({ at: at(iso), tempF, text });

describe("daily log weather", () => {
  it("turns the weather service's words into the log's", () => {
    assert.equal(skyOf("Mostly Cloudy and Breezy"), "Cloudy");
    assert.equal(skyOf("Partly Cloudy"), "Partly Cloudy");
    assert.equal(skyOf("A Few Clouds"), "Partly Cloudy");
    assert.equal(skyOf("Clear"), "Sunny");
    assert.equal(skyOf("Light Rain and Fog/Mist"), "Rain");
    assert.equal(skyOf("Thunderstorm Light Rain"), "Storm");
    assert.equal(skyOf("Light Snow"), "Snow");
    assert.equal(skyOf("Clear and Windy"), "Windy");
    assert.equal(skyOf(""), null);
  });

  it("knows when the day starts where the job is (daylight time and standard)", () => {
    assert.equal(dayBounds("2026-10-13", TZ).start.toISOString(), "2026-10-13T05:00:00.000Z");
    assert.equal(dayBounds("2026-12-01", TZ).start.toISOString(), "2026-12-01T06:00:00.000Z");
    assert.equal(dayBounds("2026-10-13", TZ).end.toISOString(), "2026-10-14T05:00:00.000Z");
  });

  it("takes the high and low from that day's readings only", () => {
    const w = summarizeDay(
      [r("2026-10-13T04:00:00Z", 40, "Clear"), r("2026-10-13T11:00:00Z", 61, "Clear"), r("2026-10-13T17:00:00Z", 80, "Partly Cloudy"), r("2026-10-13T20:00:00Z", 84.4, "Partly Cloudy"), r("2026-10-14T06:00:00Z", 30, "Clear")],
      [],
      "2026-10-13",
      TZ,
    );
    assert.deepEqual(w, { weather: "Partly Cloudy", tempHigh: 84, tempLow: 61 });
  });

  it("calls the day Rain when it rained during work hours, even briefly", () => {
    const w = summarizeDay(
      [r("2026-10-13T13:00:00Z", 70, "Clear"), r("2026-10-13T15:00:00Z", 68, "Light Rain"), r("2026-10-13T18:00:00Z", 75, "Clear"), r("2026-10-13T21:00:00Z", 78, "Clear")],
      [],
      "2026-10-13",
      TZ,
    );
    assert.equal(w.weather, "Rain");
  });

  it("doesn't call it Rain for rain in the middle of the night", () => {
    const w = summarizeDay([r("2026-10-13T07:00:00Z", 60, "Rain"), r("2026-10-13T15:00:00Z", 70, "Clear"), r("2026-10-13T18:00:00Z", 75, "Clear")], [], "2026-10-13", TZ);
    assert.equal(w.weather, "Sunny");
  });

  it("uses today's forecast for the afternoon a morning log hasn't seen yet", () => {
    const w = summarizeDay(
      [r("2026-10-13T12:00:00Z", 58, "Clear")],
      [
        { start: at("2026-10-13T11:00:00Z"), isDaytime: true, tempF: 86, text: "Sunny" },
        { start: at("2026-10-13T23:00:00Z"), isDaytime: false, tempF: 50, text: "Clear" },
      ],
      "2026-10-13",
      TZ,
    );
    assert.deepEqual(w, { weather: "Sunny", tempHigh: 86, tempLow: 58 });
  });

  it("gives blanks when there's nothing to go on", () => {
    assert.deepEqual(summarizeDay([], [], "2026-10-13", TZ), { weather: null, tempHigh: null, tempLow: null });
  });

  it("reads the job's ZIP and state however they were typed", () => {
    assert.equal(zip5("78704-1234"), "78704");
    assert.equal(zip5("7870"), null);
    assert.equal(stateCode("Texas"), "tx");
    assert.equal(stateCode("LA"), "la");
    assert.equal(stateCode("Zed"), null);
  });
});
