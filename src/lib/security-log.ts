import "server-only";
import { headers } from "next/headers";
import { logActivity } from "./activity";
import { runAsCompany } from "./tenant";

/**
 * Sign-ins and changes to logins, for the company's admins (Settings → Team → Security log).
 * Kept out of the everyday activity feed. Never throws.
 */

export const SECURITY = "security.";

/** The address a request came from (the first one, when it passed through the host's proxy). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function logSecurity(user: { id: string; companyId: string; name: string }, event: string, what: string) {
  try {
    const ip = await clientIp();
    const where = ip === "unknown" || ip === "::1" || ip === "127.0.0.1" ? "" : ` (from ${ip})`;
    await runAsCompany(user.companyId, () => logActivity({ userId: user.id, type: SECURITY + event, description: `${user.name} ${what}${where}` }));
  } catch (err) {
    console.error("security log failed", err);
  }
}
