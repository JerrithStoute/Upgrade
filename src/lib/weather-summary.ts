import type { WEATHER } from "./constants";
import { zoneOffset } from "./zone";

/**
 * A day's weather for a daily log, boiled down from the weather service's hourly readings
 * (and, for today, its forecast): one word from the log's own list, and the high and low.
 * No network here — see weather.ts.
 */

export type Sky = (typeof WEATHER)[number];
export type Reading = { at: Date; tempF: number | null; text: string };
export type ForecastPeriod = { start: Date; isDaytime: boolean; tempF: number | null; text: string };
export type DayWeather = { weather: Sky | null; tempHigh: number | null; tempLow: number | null };

/** The weather service's words ("Mostly Cloudy and Breezy", "Light Rain") as one of the log's. */
export function skyOf(text: string): Sky | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/thunder|tornado|hurricane|tropical storm|squall/.test(t)) return "Storm";
  if (/snow|sleet|freezing|ice|wintry|blizzard|flurr/.test(t)) return "Snow";
  if (/rain|drizzle|shower/.test(t)) return "Rain";
  if (/windy/.test(t) && !/cloud|overcast/.test(t)) return "Windy";
  if (/partly|few clouds|mostly sunny/.test(t)) return "Partly Cloudy";
  if (/cloud|overcast|fog|haze|mist|smoke/.test(t)) return "Cloudy";
  if (/clear|sunny|fair/.test(t)) return "Sunny";
  if (/wind|breez|blust/.test(t)) return "Windy";
  return null;
}

/** A calendar day ("2026-10-13") where the job is: when it starts and ends. */
export function dayBounds(ymd: string, timeZone: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const at = (hour: number) => {
    const guess = Date.UTC(y, m - 1, d, hour);
    return new Date(guess - zoneOffset(new Date(guess), timeZone));
  };
  return { start: at(0), end: at(24), workStart: at(6), workEnd: at(18) };
}

/**
 * The day in one line. Rain, snow or a storm at any point in the work day (6 to 6) is what
 * the day is called — that's what a builder logs it for; otherwise it's the sky most of the day.
 * The high also takes the forecast (a log written in the morning hasn't seen the afternoon yet).
 */
export function summarizeDay(readings: Reading[], periods: ForecastPeriod[], ymd: string, timeZone: string): DayWeather {
  const { start, end, workStart, workEnd } = dayBounds(ymd, timeZone);
  const inDay = readings.filter((r) => r.at >= start && r.at < end);
  const today = periods.filter((p) => p.start >= start && p.start < end);
  const daytime = today.find((p) => p.isDaytime);
  const night = today.find((p) => !p.isDaytime);

  const temps = inDay.map((r) => r.tempF).filter((t): t is number => t !== null && Number.isFinite(t));
  const highs = daytime?.tempF != null ? [...temps, daytime.tempF] : temps;
  // The forecast's low is tomorrow's dawn: only when there are no readings at all.
  const lows = temps.length ? temps : night?.tempF != null ? [night.tempF] : [];

  const work = inDay.filter((r) => r.at >= workStart && r.at < workEnd);
  const skies = (work.length ? work : inDay).map((r) => skyOf(r.text)).filter((s): s is Sky => s !== null);
  if (daytime && !work.length) {
    const s = skyOf(daytime.text);
    if (s) skies.push(s);
  }
  let weather: Sky | null = null;
  for (const bad of ["Storm", "Snow", "Rain"] as const) {
    if (skies.includes(bad)) {
      weather = bad;
      break;
    }
  }
  if (!weather && skies.length) {
    const count = new Map<Sky, number>();
    for (const s of skies) count.set(s, (count.get(s) ?? 0) + 1);
    weather = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return {
    weather,
    tempHigh: highs.length ? Math.round(Math.max(...highs)) : null,
    tempLow: lows.length ? Math.round(Math.min(...lows)) : null,
  };
}

const STATES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
  massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh",
  "new jersey": "nj", "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or",
  pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt",
  virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi", wyoming: "wy", "district of columbia": "dc",
};

/** "Texas" or "TX" as "tx" (null when it isn't a state). */
export function stateCode(state: string | null | undefined) {
  const s = (state ?? "").trim().toLowerCase().replace(/\./g, "");
  if (!s) return null;
  if (s.length === 2) return Object.values(STATES).includes(s) ? s : null;
  return STATES[s] ?? null;
}

/** The 5-digit ZIP in "78704" or "78704-1234" (null when there isn't one). */
export function zip5(zip: string | null | undefined) {
  return /^\s*(\d{5})(-\d{4})?\s*$/.exec(zip ?? "")?.[1] ?? null;
}
