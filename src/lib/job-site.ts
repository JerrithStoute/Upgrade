import "server-only";
import { db } from "./db";

/**
 * Where a job is on the map — so the time clock can tell an on-site punch from one that isn't.
 * Found from the job's address with the U.S. Census Bureau's free address lookup (no account), or
 * set from a phone standing at the site (for an address it can't find: a new subdivision, a rural
 * route). A changed address is looked up again; a spot set at the site stays until it's changed.
 */

const LOOKUP = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

/** The job's full address as one line ("" when there's no street address). */
export function siteAddressOf(p: { address: string | null; city: string | null; state: string | null; zip: string | null }) {
  if (!p.address?.trim()) return "";
  return [p.address, p.city, [p.state, p.zip].filter(Boolean).join(" ")]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(", ");
}

/** The address's spot on the map, or null (not found, or the lookup didn't answer in time). */
export async function lookUpAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  try {
    const url = `${LOOKUP}?${new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] } };
    const c = data.result?.addressMatches?.[0]?.coordinates;
    return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? { lat: c.y, lng: c.x } : null;
  } catch {
    return null;
  }
}

/**
 * After a job is saved: look its address up again if it changed (a spot set at the site is kept
 * unless the address changed). Never holds up the save — a lookup that fails just leaves no spot.
 */
export async function refreshJobSite(projectId: string, again = false) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { address: true, city: true, state: true, zip: true, siteAddress: true, siteFrom: true } });
  if (!p) return;
  const address = siteAddressOf(p);
  if (!again && address === (p.siteAddress ?? "")) return;
  const spot = await lookUpAddress(address);
  await db.project.update({
    where: { id: projectId },
    data: spot ? { siteLat: spot.lat, siteLng: spot.lng, siteFrom: "ADDRESS", siteAddress: address } : { siteLat: null, siteLng: null, siteFrom: null, siteAddress: address },
  });
}

/**
 * Jobs with an address that was never looked up (from before the time clock checked sites): a few
 * at a time, in the background, whenever Timesheets or Settings → Time clock is opened.
 */
export async function findMissingSites(limit = 10) {
  const jobs = await db.project.findMany({
    where: { siteAddress: null, address: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED"] }, isTemplate: false },
    select: { id: true },
    take: limit,
  });
  for (const j of jobs) await refreshJobSite(j.id);
}
