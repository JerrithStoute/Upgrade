import { AsyncLocalStorage } from "async_hooks";

/**
 * Which company the program is working for right now. Every database read and write
 * goes through the gatekeeper in db.ts, which limits it to this company and tags
 * anything new with it.
 *
 * - In a request (a page, a form, a download), it's the signed-in person's company.
 * - Anywhere else (the nightly backup, scripts), the code says which company with
 *   runAsCompany(id, …). With neither, database work refuses to run rather than guess.
 */

const store = new AsyncLocalStorage<{ companyId: string }>();

/** Do `fn` as `companyId` (background jobs, scripts, tests). */
export function runAsCompany<T>(companyId: string, fn: () => PromiseLike<T> | T): Promise<T> {
  // Awaited inside, so database requests (which start when awaited) run as this company.
  return store.run({ companyId }, async () => await fn());
}

// Session token → company, for a minute: a person's company never changes, and this
// saves a lookup on every query of the request.
const bySession = new Map<string, { companyId: string; at: number }>();

async function fromSession(): Promise<string | null> {
  let token: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    const { SESSION_COOKIE } = await import("./auth");
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    return null; // not in a request
  }
  if (!token) return null;
  const hit = bySession.get(token);
  if (hit && Date.now() - hit.at < 60_000) return hit.companyId;
  const { getCurrentUser } = await import("./auth");
  const user = await getCurrentUser();
  if (!user) return null;
  if (bySession.size > 5000) bySession.clear();
  bySession.set(token, { companyId: user.companyId, at: Date.now() });
  return user.companyId;
}

/** The company being worked for, or null (not signed in, no runAsCompany). */
export async function tryCompanyId(): Promise<string | null> {
  return store.getStore()?.companyId ?? (await fromSession());
}

/** The company being worked for — or an error, never a guess. */
export async function currentCompanyId(): Promise<string> {
  const id = await tryCompanyId();
  if (!id) throw new NoCompanyError();
  return id;
}

export class NoCompanyError extends Error {
  constructor() {
    super("Not signed in to a company");
    this.name = "NoCompanyError";
  }
}
