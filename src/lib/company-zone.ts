import "server-only";
import { cache } from "react";
import { db } from "./db";
import { fmtDateTime } from "./utils";
import { DEFAULT_ZONE, fromWall, isZone, toWall } from "./zone";

/** The company's time zone (Settings → Company). Asked once per page. */
export const getZone = cache(async () => {
  const zone = (await db.company.findFirst({ select: { timeZone: true } }))?.timeZone;
  return isZone(zone) ? zone : DEFAULT_ZONE;
});

/**
 * The company's clock, for a page or an action:
 *   now       the company's wall date right now — pass it wherever "today" is asked
 *             (overdue, due today, this week), in place of `new Date()`
 *   wall(d)   a moment as its wall date — to show its time, or find its day / week
 *   real(w)   a wall date (a typed time, the start of a day) as the real moment — to store or query
 *   dateTime  "Oct 13, 2026 7:02 AM" on the company's clock
 */
export async function companyClock(at = new Date()) {
  const zone = await getZone();
  const wall = (d: Date) => toWall(d, zone);
  return {
    zone,
    now: wall(at),
    wall,
    real: (w: Date) => fromWall(w, zone),
    dateTime: (d: Date | string | null | undefined) => (d ? fmtDateTime(wall(new Date(d))) : fmtDateTime(d)),
  };
}
