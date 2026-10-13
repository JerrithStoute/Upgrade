import "server-only";
import { db } from "./db";
import { dayBounds, stateCode, summarizeDay, zip5, type DayWeather, type ForecastPeriod, type Reading } from "./weather-summary";

/**
 * Daily log weather, filled in for the job's area.
 *
 *  - Where: the job's ZIP code (else its city and state) — never the street address.
 *  - What: the U.S. National Weather Service (api.weather.gov; free, no account): the nearest
 *    station's readings for that day, plus today's forecast for the afternoon still to come.
 *  - It only has the last week, and only the U.S. Older days, other countries, or a service
 *    that's slow or down: the boxes stay blank and you type them, as before.
 */

const AGENT = "TheBuilderStation/1.0 (thebuilderstation.com)";
const TIMEOUT_MS = 4000;
const KEEP_DAYS = 6; // how far back the stations' readings reliably go

type Place = { lat: number; lon: number };
type Grid = { forecast: string; station: string | null; timeZone: string };

const places = new Map<string, Place | null>();
const grids = new Map<string, Grid>();
const days = new Map<string, { at: number; value: DayWeather }>();

async function getJson(url: string, accept = "application/json"): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": AGENT, Accept: accept }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The middle of the job's ZIP code (or its city). */
async function findPlace(job: { city: string | null; state: string | null; zip: string | null }): Promise<Place | null> {
  const zip = zip5(job.zip);
  const st = stateCode(job.state);
  const city = (job.city ?? "").trim();
  const key = zip ?? (st && city ? `${st}/${city.toLowerCase()}` : null);
  if (!key) return null;
  if (places.has(key)) return places.get(key) ?? null;
  const url = zip ? `https://api.zippopotam.us/us/${zip}` : `https://api.zippopotam.us/us/${st}/${encodeURIComponent(city)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (res.status === 404) {
    places.set(key, null); // no such ZIP / town: don't ask again
    return null;
  }
  if (!res.ok) throw new Error(`${res.status} from the ZIP lookup`);
  const first = obj(list(obj(await res.json()).places)[0]);
  const lat = num(first.latitude);
  const lon = num(first.longitude);
  const place = lat !== null && lon !== null ? { lat, lon } : null;
  places.set(key, place);
  return place;
}

async function findGrid(p: Place): Promise<Grid> {
  const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  const had = grids.get(key);
  if (had) return had;
  const props = obj(obj(await getJson(`https://api.weather.gov/points/${key}`, "application/geo+json")).properties);
  if (typeof props.forecast !== "string" || typeof props.timeZone !== "string") throw new Error("The weather service doesn't cover that spot");
  let station: string | null = null;
  if (typeof props.observationStations === "string") {
    const stations = obj(await getJson(props.observationStations, "application/geo+json"));
    const id = obj(obj(list(stations.features)[0]).properties).stationIdentifier;
    station = typeof id === "string" ? id : null;
  }
  const grid = { forecast: props.forecast, station, timeZone: props.timeZone };
  grids.set(key, grid);
  return grid;
}

const cToF = (c: number | null) => (c === null ? null : (c * 9) / 5 + 32);

async function lookUp(place: Place, ymd: string, isToday: boolean): Promise<DayWeather> {
  const grid = await findGrid(place);
  const { start, end } = dayBounds(ymd, grid.timeZone);
  const [obs, fc] = await Promise.all([
    grid.station
      ? getJson(`https://api.weather.gov/stations/${grid.station}/observations?start=${start.toISOString()}&end=${end.toISOString()}`, "application/geo+json").catch(() => null)
      : null,
    isToday ? getJson(grid.forecast, "application/geo+json").catch(() => null) : null,
  ]);
  const readings: Reading[] = list(obj(obs).features).flatMap((f) => {
    const p = obj(obj(f).properties);
    const at = typeof p.timestamp === "string" ? new Date(p.timestamp) : null;
    if (!at || Number.isNaN(at.getTime())) return [];
    return [{ at, tempF: cToF(num(obj(p.temperature).value)), text: typeof p.textDescription === "string" ? p.textDescription : "" }];
  });
  const periods: ForecastPeriod[] = list(obj(obj(fc).properties).periods).flatMap((x) => {
    const p = obj(x);
    const at = typeof p.startTime === "string" ? new Date(p.startTime) : null;
    if (!at || Number.isNaN(at.getTime())) return [];
    return [{ start: at, isDaytime: p.isDaytime === true, tempF: num(p.temperature), text: typeof p.shortForecast === "string" ? p.shortForecast : "" }];
  });
  return summarizeDay(readings, periods, ymd, grid.timeZone);
}

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The weather at the job on that day, or null when it can't be had (no ZIP or city on the job,
 * a day too long ago or still to come, outside the U.S., or the service isn't answering).
 * Never throws, and never holds a save up for long.
 */
export async function weatherFor(job: { city: string | null; state: string | null; zip: string | null }, date: Date): Promise<DayWeather | null> {
  const now = new Date();
  const ymd = ymdOf(date);
  const daysAgo = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  if (daysAgo < 0 || daysAgo > KEEP_DAYS) return null;
  try {
    const place = await findPlace(job);
    if (!place) return null;
    const key = `${place.lat},${place.lon},${ymd}`;
    const had = days.get(key);
    // Today keeps changing; a day that's over doesn't.
    if (had && Date.now() - had.at < (daysAgo === 0 ? 20 : 12 * 60) * 60000) return had.value;
    const value = await lookUp(place, ymd, daysAgo === 0);
    if (value.weather || value.tempHigh !== null || value.tempLow !== null) days.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.warn("[weather]", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Fills in a daily log's weather, high and low where they're blank (what you typed is never
 * changed). Called whenever something goes into a log — by hand or by the schedule.
 */
export async function fillLogWeather(logId: string) {
  const log = await db.dailyLog.findUnique({
    where: { id: logId },
    select: { id: true, date: true, weather: true, tempHigh: true, tempLow: true, project: { select: { city: true, state: true, zip: true } } },
  });
  if (!log || (log.weather && log.tempHigh !== null && log.tempLow !== null)) return;
  const w = await weatherFor(log.project, log.date);
  if (!w) return;
  const data = {
    ...(log.weather || !w.weather ? {} : { weather: w.weather }),
    ...(log.tempHigh !== null || w.tempHigh === null ? {} : { tempHigh: w.tempHigh }),
    ...(log.tempLow !== null || w.tempLow === null ? {} : { tempLow: w.tempLow }),
  };
  if (Object.keys(data).length) await db.dailyLog.update({ where: { id: log.id }, data });
}
