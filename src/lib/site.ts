/**
 * The public website (src/app/site): Home, Features, Pricing, Request an invite, Terms, Privacy.
 * Hidden until SITE_LIVE=1 — before that only the platform owner (PLATFORM_ADMIN_EMAILS),
 * signed in, can see it; everyone else gets "page not found".
 */
export function siteIsLive(env: NodeJS.ProcessEnv = process.env) {
  return env.SITE_LIVE === "1";
}

/** How many homes a year (the request-an-invite form). */
export const HOMES_PER_YEAR = ["1–5", "6–15", "16–40", "More than 40"] as const;
