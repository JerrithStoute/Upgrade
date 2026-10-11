import "server-only";
import { clientIp } from "./security-log";

/** The robot check's public key for forms, or null when it isn't set up (this PC). */
export const robotCheckKey = () => process.env.TURNSTILE_SITE_KEY || null;

export const ROBOT_CHECK_FAILED = "Please finish the “I'm not a robot” check, then try again.";

/**
 * Did this form pass the Cloudflare Turnstile check (see components/robot-check.tsx)?
 * Always yes when it isn't set up. If Cloudflare can't be reached, people aren't locked
 * out — sign-in and sign-up still have their own limits.
 */
export async function passedRobotCheck(fd: FormData): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  const token = String(fd.get("cf-turnstile-response") ?? "");
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: await clientIp() }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return true;
    return (await res.json())?.success === true;
  } catch {
    return true;
  }
}
