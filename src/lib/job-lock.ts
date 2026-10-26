import os from "os";
import { randomUUID } from "crypto";
import { systemDb } from "./db";

/**
 * Claims on background work, so only one copy of the app does it at a time — the nightly backup, a
 * company's morning emails, the long-shift check, reworking a job's lumber lines. Online there can be
 * several copies of the app (Render → Scaling); each would otherwise run its own.
 *
 * A claim is a row in JobLock: whoever writes it first has it until `until`. A copy that stops halfway
 * (a deploy, a crash) doesn't hold it forever — once `until` passes, the next one to ask gets it. Each
 * claim has its own holder, so two pieces of work in the same copy wait for each other too. Kept in the
 * database through the system login (the table is no company's; tenant-rules.ts).
 */

/** This copy of the app, at the front of each claim's holder (for the log). */
const COPY = `${process.env.RENDER_INSTANCE_ID || os.hostname()}:${process.pid}`;

/** Claims `name` for `ms` milliseconds: the claim's holder when it's this one's, else null (someone has it). */
export async function claim(name: string, ms: number): Promise<string | null> {
  const holder = `${COPY}:${randomUUID().slice(0, 8)}`;
  const now = new Date();
  const until = new Date(now.getTime() + ms);
  try {
    // Nobody's had it yet: the row is ours (two at once — only one insert can win).
    await systemDb.jobLock.create({ data: { name, holder, until, at: now } });
    return holder;
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
  // Someone had it: ours only if their claim has run out (one update; only one can match).
  const taken = await systemDb.jobLock.updateMany({ where: { name, until: { lt: now } }, data: { holder, until, at: now } });
  return taken.count ? holder : null;
}

/** Lets a claim go (only while it's still that holder's). */
export async function release(name: string, holder: string) {
  await systemDb.jobLock.deleteMany({ where: { name, holder } });
}

/**
 * Runs `fn` if this one gets `name` — someone already on it means this one skips (undefined).
 * `ms`: the longest the work could take; the claim runs out after that.
 */
export async function ifFirst<T>(name: string, ms: number, fn: () => Promise<T>): Promise<T | undefined> {
  const holder = await claim(name, ms);
  if (!holder) return undefined;
  try {
    return await fn();
  } finally {
    await release(name, holder).catch(() => {});
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` once this one gets `name` — waiting while someone else is on it (up to `waitMs`; then it
 * goes ahead anyway, rather than leave the work undone). For work that mustn't run twice at once but
 * must run: a job's lines reworked after a change.
 */
export async function oneAtATime<T>(name: string, ms: number, fn: () => Promise<T>, waitMs = ms): Promise<T> {
  const giveUp = Date.now() + waitMs;
  let holder = await claim(name, ms);
  while (!holder && Date.now() < giveUp) {
    await sleep(200);
    holder = await claim(name, ms);
  }
  try {
    return await fn();
  } finally {
    if (holder) await release(name, holder).catch(() => {});
  }
}
