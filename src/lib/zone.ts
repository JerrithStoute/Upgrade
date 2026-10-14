/**
 * Time zones. Each company has one (Settings → Company); the server has its own (Central).
 *
 * How the program copes with the two, in one idea — the "wall" date:
 *
 *   toWall(instant, zone)  → a Date whose ordinary fields (getHours, getDate, toLocaleTimeString…)
 *                            read what the clock on the company's wall says at that moment.
 *   fromWall(wall, zone)   → the real moment for a wall-clock reading (a typed time, the start of
 *                            a day or week).
 *
 * So code that shows a time, or asks "which day / week is this in", runs on the wall date with
 * the ordinary date functions; code that stores, compares or subtracts moments uses the real
 * ones. For a company in the server's own zone both are the same Date, untouched.
 *
 * Plain dates (a due date, a schedule day) aren't moments and never go through here: they're
 * stored as noon on their day and read the same in every U.S. zone.
 *
 * (One known wrinkle: an hour that doesn't exist on the server's clock — 2 to 3 am on the
 * spring-forward Sunday — reads an hour late for a company whose own zone doesn't skip it.)
 */

export const DEFAULT_ZONE = "America/Chicago";

/** The zones a company picks from (U.S.). */
export const ZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona (no daylight time)" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
] as const;

export const isZone = (z: string | null | undefined): z is string => ZONES.some((x) => x.value === z);
export const zoneLabel = (z: string) => ZONES.find((x) => x.value === z)?.label ?? z;

const SERVER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const formats = new Map<string, Intl.DateTimeFormat>();
function parts(at: Date, timeZone: string) {
  let f = formats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formats.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second };
}

/** How far a zone's clock is ahead of UTC at that moment (ms; negative in the U.S.). */
export function zoneOffset(at: Date, timeZone: string) {
  const p = parts(at, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The real moment for a clock reading in a zone. */
export function zonedTime(timeZone: string, y: number, month: number, d: number, hh = 0, mm = 0) {
  const guess = Date.UTC(y, month - 1, d, hh, mm);
  // Twice: the offset at the guess can be the other side of a daylight-time change.
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/** A real moment as the company's wall date (see the top of this file). */
export function toWall(at: Date, timeZone: string, serverZone = SERVER_ZONE) {
  if (timeZone === serverZone) return at;
  const p = parts(at, timeZone);
  return new Date(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss, at.getMilliseconds());
}

/** A wall date (a typed time, the start of a day or week) as the real moment. */
export function fromWall(wall: Date, timeZone: string, serverZone = SERVER_ZONE) {
  if (timeZone === serverZone) return wall;
  const at = zonedTime(timeZone, wall.getFullYear(), wall.getMonth() + 1, wall.getDate(), wall.getHours(), wall.getMinutes());
  return new Date(at.getTime() + wall.getSeconds() * 1000 + wall.getMilliseconds());
}
