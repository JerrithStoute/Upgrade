import { SignJWT, jwtVerify } from "jose";
import { getSessionKey } from "./session-secret";

/**
 * Sign-up is invite-only for now: the platform owner (PLATFORM_ADMIN_EMAILS) invites a builder,
 * who gets a link that works for that one email, for 14 days. Nothing is stored — the link is
 * signed, so it can't be made up or changed, and once that email has an account it's spent
 * (one email, one login).
 */

export const INVITE_DAYS = 14;

export type BuilderInvite = { email: string; name: string | null; companyName: string | null };

/** Whoever runs The Builder Station (comma-separated emails in PLATFORM_ADMIN_EMAILS). */
export function isPlatformAdmin(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!email) return false;
  const admins = (env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export async function makeBuilderInvite(invite: BuilderInvite, key: Uint8Array = getSessionKey()) {
  return new SignJWT({ kind: "builder-invite", email: invite.email.trim().toLowerCase(), name: invite.name, company: invite.companyName })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${INVITE_DAYS}d`)
    .sign(key);
}

/** The invitation in a sign-up link, or null when it's missing, changed, or past its 14 days. */
export async function readBuilderInvite(token: string | null | undefined, key: Uint8Array = getSessionKey()): Promise<BuilderInvite | null> {
  if (!token || token.length > 4000) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.kind !== "builder-invite" || typeof payload.email !== "string") return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      companyName: typeof payload.company === "string" ? payload.company : null,
    };
  } catch {
    return null;
  }
}
