// Shared by src/lib/auth.ts and src/proxy.ts. Deliberately free of "server-only"
// and Node APIs so the proxy can import it too.

const DEV_FALLBACK = "dev-only-insecure-secret-change-me";
const MIN_LENGTH = 32;

let warned = false;

/**
 * The secret used to sign session cookies.
 *
 * In production a missing or short SESSION_SECRET is a hard error: falling back
 * to a string that is published in this repository would let anyone forge a
 * login cookie for any account. In development we fall back with a warning so
 * `npm run dev` works out of the box.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= MIN_LENGTH) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`SESSION_SECRET must be set to a random string of at least ${MIN_LENGTH} characters in production. ` + "Generate one with: openssl rand -base64 48");
  }

  if (!warned) {
    warned = true;
    console.warn(
      `[upgrade] SESSION_SECRET is ${secret ? "shorter than " + MIN_LENGTH + " characters" : "not set"}; ` +
        "using an insecure development fallback. Never run like this in production.",
    );
  }
  return secret || DEV_FALLBACK;
}

export function getSessionKey(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}
