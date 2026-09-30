import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Runs once when the server starts. Checking the session secret here makes a
 * misconfigured production server fail at startup instead of on the first login.
 */
export async function register() {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return; // `next build` doesn't need the secret
  const { getSessionSecret } = await import("./lib/session-secret");
  getSessionSecret();
}
