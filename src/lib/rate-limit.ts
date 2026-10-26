import "server-only";
import { systemDb } from "./db";

/**
 * Fixed-window failure counter — wrong passwords, wrong codes, forms sent too often — kept in the
 * database (RateLimit), so every copy of the app counts the same tries: three copies don't give
 * three times the guesses. Through the system login (the table is no company's; tenant-rules.ts).
 */

/** Seconds until `key` may try again, or 0 if it's under `limit` failures in the current window. */
export async function retryAfter(key: string, limit: number): Promise<number> {
  const b = await systemDb.rateLimit.findUnique({ where: { key } });
  const now = Date.now();
  if (!b || b.resetAt.getTime() <= now) return 0;
  return b.count >= limit ? Math.ceil((b.resetAt.getTime() - now) / 1000) : 0;
}

/** How many failures `key` has in the current window. */
export async function failures(key: string): Promise<number> {
  const b = await systemDb.rateLimit.findUnique({ where: { key } });
  return b && b.resetAt.getTime() > Date.now() ? b.count : 0;
}

/** Record a failure for `key` in a window of `windowMs`. */
export async function recordFailure(key: string, windowMs: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  // One more, counted in the database itself (two copies at once can't lose one)…
  const b = await systemDb.rateLimit.upsert({ where: { key }, create: { key, count: 1, resetAt }, update: { count: { increment: 1 } } });
  // …unless its window had run out: a new window, starting with this one.
  if (b.resetAt.getTime() <= now.getTime()) await systemDb.rateLimit.updateMany({ where: { key, resetAt: { lte: now } }, data: { count: 1, resetAt } });
  // Now and then, old windows are cleared away.
  if (Math.random() < 0.02) await systemDb.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }).catch(() => {});
}

export async function clearFailures(key: string) {
  await systemDb.rateLimit.deleteMany({ where: { key } });
}
