import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret } from "./session-secret";

/**
 * The link in a bid's email for the vendor to type their prices online (/prices/<link>) — no sign-in.
 * It opens that one bid and nothing else, for 30 days (and it closes once a bid is taken for it). Signed,
 * so it can't be made up or pointed at another bid; its own key, so it can't pass for a sign-in.
 */

export const BID_LINK_DAYS = 30;

const key = () => new TextEncoder().encode(`${getSessionSecret()}\u0000bid-prices`);

export async function makeBidLink(bidId: string, companyId: string) {
  return new SignJWT({ kind: "bid-prices", c: companyId }).setProtectedHeader({ alg: "HS256" }).setSubject(bidId).setIssuedAt().setExpirationTime(`${BID_LINK_DAYS}d`).sign(key());
}

/** The bid (and its company) a link is for, or null when it's changed, made up or too old. */
export async function readBidLink(token: string | null | undefined): Promise<{ bidId: string; companyId: string } | null> {
  if (!token || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.kind === "bid-prices" && typeof payload.sub === "string" && typeof payload.c === "string" ? { bidId: payload.sub, companyId: payload.c } : null;
  } catch {
    return null;
  }
}
