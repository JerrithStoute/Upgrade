import "server-only";
import { decryptSecret, encryptSecret } from "./totp";
import { getSessionSecret } from "./session-secret";

/**
 * Secrets kept in the database (the authenticator app's secret) are encrypted with their
 * own key, ENCRYPTION_KEY — not the key that signs sign-ins — so a leak of one doesn't
 * open the other. Required online; this PC uses a fixed development key.
 */

const DEV_KEY = "dev-only-encryption-key-change-me-in-production";

export function encryptionKey() {
  const k = process.env.ENCRYPTION_KEY;
  if (k && k.length >= 32) return k;
  if (process.env.NODE_ENV === "production") throw new Error("ENCRYPTION_KEY must be set to a random string of at least 32 characters");
  return DEV_KEY;
}

export const seal = (plain: string) => encryptSecret(plain, encryptionKey());

/** Opens a sealed secret. Ones sealed before ENCRYPTION_KEY existed (with the sign-in key) still open. */
export function unseal(sealed: string): string {
  try {
    return decryptSecret(sealed, encryptionKey());
  } catch {
    return decryptSecret(sealed, getSessionSecret());
  }
}
