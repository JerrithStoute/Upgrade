import "server-only";

/**
 * Minimal fixed-window failure counter, kept in memory.
 *
 * Upgrade runs as a single Node process on SQLite, so an in-process map is
 * enough. If you ever run several instances behind a load balancer, move this
 * to a shared store (e.g. a table in the database or Redis).
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

/** Seconds until `key` may try again, or 0 if it's under `limit` failures in the current window. */
export function retryAfter(key: string, limit: number): number {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) return 0;
  return b.count >= limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

/** Record a failure for `key` in a window of `windowMs`. */
export function recordFailure(key: string, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count += 1;
}

export function clearFailures(key: string) {
  buckets.delete(key);
}
