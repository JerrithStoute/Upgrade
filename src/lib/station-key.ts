// Shared by src/lib/station-auth.ts and src/proxy.ts. Like session-secret.ts, free of
// "server-only" and Node APIs so the proxy can import it too.
import { getSessionSecret } from "./session-secret";

/**
 * The Builder Station's own sign-in (its owner and employees — not builders): its own cookie, signed
 * with its own key. A builder's sign-in can never pass for a Station one, or the other way around.
 */
export const STATION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-bs_station" : "station_session";

/** The key Station cookies and links are signed with: the session secret, set apart for the Station. */
export function getStationKey(): Uint8Array {
  return new TextEncoder().encode(`${getSessionSecret()}\u0000the-builder-station`);
}
