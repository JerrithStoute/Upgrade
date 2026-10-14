import { z } from "zod";

/**
 * The company's time clock rules (Settings → Time clock). Every starting value is what the time
 * clock did before these could be changed: weeks Monday–Sunday, overtime past 40 hours a week at
 * 1.5×, no rounding, no automatic lunch. Pure — the clock, Timesheets and the Budget postings all
 * read them the same way.
 */

export const ROUNDINGS = [0, 5, 6, 15] as const;
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const hours = z.number().finite().min(1).max(168);
export const timeRulesSchema = z.object({
  /** The day a work week starts, 0 Sunday … 6 Saturday. */
  weekStart: z.number().int().min(0).max(6).catch(1),
  /** Hours shown as 7.5 (DECIMAL) or 7:30 (CLOCK). */
  hoursFormat: z.enum(["DECIMAL", "CLOCK"]).catch("DECIMAL"),
  /** Overtime past this many hours in a week (null: none by the week). */
  weeklyAfter: hours.nullable().catch(40),
  /** Overtime past this many hours in a day (null: none by the day). */
  dailyAfter: hours.nullable().catch(null),
  /** Double time past this many hours in a day (null: none). */
  doubleAfter: hours.nullable().catch(null),
  overtimeTimes: z.number().finite().min(1).max(5).catch(1.5),
  doubleTimes: z.number().finite().min(1).max(5).catch(2),
  /** Punches counted to the nearest N minutes (0: as punched). The real times are always kept. */
  rounding: z.union([z.literal(0), z.literal(5), z.literal(6), z.literal(15)]).catch(0),
  /** A lunch taken out of shifts longer than `lunchAfter` hours that have no break typed in (0: off). */
  lunchMinutes: z.number().int().min(0).max(120).catch(0),
  lunchAfter: z.number().finite().min(1).max(24).catch(6),
  /** Email the person (and whoever manages time) after this many hours on the clock (null: off). */
  longShiftHours: z.number().finite().min(4).max(24).nullable().catch(12),
  /** A punch farther than this from the job site (feet) is flagged "off site" on Timesheets. */
  siteFeet: z.number().int().min(100).max(5280).catch(500),
});
export type TimeRules = z.infer<typeof timeRulesSchema>;

export const DEFAULT_TIME_RULES: TimeRules = timeRulesSchema.parse({});

export function parseTimeRules(json: string | null | undefined): TimeRules {
  if (!json) return DEFAULT_TIME_RULES;
  try {
    const v = JSON.parse(json);
    return timeRulesSchema.parse(typeof v === "object" && v ? v : {});
  } catch {
    return DEFAULT_TIME_RULES;
  }
}

/** A punch counted to the nearest `minutes` (0: as is). Halfway rounds up — over time it evens out. */
export function roundPunch(at: Date, minutes: number): Date {
  if (!minutes) return at;
  const step = minutes * 60_000;
  return new Date(Math.round(at.getTime() / step) * step);
}

/** Feet between two spots on the map. */
export function feetBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 20_902_231; // the earth's radius in feet
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A punch's distance from the job site, and whether it's off site — only when it's surely outside:
 * farther than the allowed distance even if the phone's reading was off by its whole accuracy.
 */
export function siteCheck(punch: { lat: number | null; lng: number | null; accuracy: number | null }, site: { lat: number | null; lng: number | null }, siteFeet: number) {
  if (punch.lat == null || punch.lng == null || site.lat == null || site.lng == null) return null;
  const feet = feetBetween({ lat: punch.lat, lng: punch.lng }, { lat: site.lat, lng: site.lng });
  const slack = (punch.accuracy ?? 0) * 3.281; // meters → feet
  return { feet: Math.round(feet), offSite: feet - slack > siteFeet };
}

/** The overtime rules in a sentence: "Overtime past 40 hours a week (1.5×)." */
export function overtimeSentence(r: TimeRules) {
  const parts = [r.dailyAfter != null ? `${r.dailyAfter} hours a day` : "", r.weeklyAfter != null ? `${r.weeklyAfter} hours a week` : ""].filter(Boolean);
  const ot = parts.length ? `Overtime past ${parts.join(" or ")} (${r.overtimeTimes}×)` : "No overtime";
  return `${ot}${r.doubleAfter != null ? `, double time past ${r.doubleAfter} hours a day (${r.doubleTimes}×)` : ""}.`;
}
