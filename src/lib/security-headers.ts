/**
 * Browser security rules sent with every page (see next.config.ts):
 * - everything (scripts, styles, pictures, plan files) comes from this site only (and the
 *   robot check from Cloudflare, the map pictures, and — files direct — the file storage);
 * - the program can't be shown inside another site's frame (no click-jacking);
 * - online, browsers only ever talk to it over HTTPS;
 * - no camera / microphone / payment access for pages (photo uploads use the file picker).
 */
/** Cloudflare's "I'm not a robot" check (sign-up, forgot-password) runs its own script and frame. */
const TURNSTILE = "https://challenges.cloudflare.com";

/**
 * The file storage (Cloudflare R2), for files direct (uploads.ts filesDirect): the browser opens and uploads
 * files on private links straight to it. Its address from S3_ENDPOINT; online without one, any R2 address.
 * (These rules are fixed when the program is built, so they allow it whether files direct is on or off.)
 */
export function fileStorageOrigin(env: NodeJS.ProcessEnv = process.env, production = env.NODE_ENV === "production") {
  try {
    if (env.S3_ENDPOINT) return new URL(env.S3_ENDPOINT).origin;
  } catch {
    /* not an address: fall through */
  }
  return production ? "https://*.r2.cloudflarestorage.com" : "";
}

export function securityHeaders(production: boolean, storage = fileStorageOrigin(process.env, production)) {
  const files = storage ? ` ${storage}` : "";
  const csp = [
    "default-src 'self'",
    // Next.js puts small inline scripts in each page; pdf.js decodes plans with WebAssembly. Dev reload needs eval.
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${TURNSTILE}${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    // Street and satellite map tiles for job maps (src/components/maps/jobs-map.tsx).
    `img-src 'self' data: blob: https://tile.openstreetmap.org https://server.arcgisonline.com${files}`,
    `media-src 'self' blob:${files}`,
    "font-src 'self' data:",
    // Plans (pdf.js) and uploads, straight to and from file storage.
    `connect-src 'self'${files}`,
    "worker-src 'self' blob:",
    `frame-src 'self' blob: ${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}
