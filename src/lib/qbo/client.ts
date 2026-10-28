import "server-only";
import { systemDb } from "@/lib/db";
import { appUrl } from "@/lib/mail";
import { seal, unseal } from "@/lib/secret-box";

/**
 * Talking to QuickBooks Online: Intuit's sign-in (OAuth 2) and its accounting API.
 *
 * The keys are The Builder Station's own app at developer.intuit.com — QBO_CLIENT_ID and
 * QBO_CLIENT_SECRET — with QBO_ENVIRONMENT "sandbox" (Intuit's test companies) or "production".
 * Each builder signs in to Intuit and allows it; what Intuit hands back (tokens) is kept sealed on
 * their QboConnection. An access token lasts an hour and is renewed with the refresh token, which
 * Intuit replaces now and then — the newest is always kept.
 */

const AUTHORIZE = "https://appcenter.intuit.com/connect/oauth2";
const TOKENS = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const SCOPE = "com.intuit.quickbooks.accounting";
/** The API version asked for on every call (Intuit's "minor version"). */
const MINOR = "75";

export const qboConfigured = () => !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
export const qboSandbox = () => (process.env.QBO_ENVIRONMENT ?? "sandbox") !== "production";
const apiBase = () => (qboSandbox() ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");
export const redirectUri = () => appUrl("/api/qbo/callback");

function keys() {
  const id = process.env.QBO_CLIENT_ID;
  const secret = process.env.QBO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("QuickBooks Online isn't set up on this server (QBO_CLIENT_ID / QBO_CLIENT_SECRET)");
  return { id, secret, basic: Buffer.from(`${id}:${secret}`).toString("base64") };
}

/** Where to send someone to sign in to Intuit and allow the connection. */
export function authorizeUrl(state: string) {
  const q = new URLSearchParams({ client_id: keys().id, response_type: "code", scope: SCOPE, redirect_uri: redirectUri(), state });
  return `${AUTHORIZE}?${q}`;
}

export type Tokens = { accessToken: string; accessExpiresAt: Date; refreshToken: string; refreshExpiresAt: Date | null };

/** Something QuickBooks said no to — `message` is fit to show. `reconnect`: the builder has to connect again. */
export class QboError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly reconnect = false,
  ) {
    super(message);
  }
}

async function tokenCall(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKENS, {
    method: "POST",
    headers: { Authorization: `Basic ${keys().basic}`, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof j.access_token !== "string") {
    // invalid_grant: the refresh token was turned down (disconnected in QuickBooks, or 100 days unused).
    const reconnect = j.error === "invalid_grant";
    throw new QboError(reconnect ? "QuickBooks needs to be connected again — click Connect QuickBooks Online." : `Intuit's sign-in said no (${String(j.error ?? res.status)})`, res.status, reconnect);
  }
  const now = Date.now();
  return {
    accessToken: j.access_token,
    accessExpiresAt: new Date(now + (Number(j.expires_in) || 3600) * 1000),
    refreshToken: String(j.refresh_token),
    refreshExpiresAt: j.x_refresh_token_expires_in ? new Date(now + Number(j.x_refresh_token_expires_in) * 1000) : null,
  };
}

/** The code Intuit sent back after someone allowed the connection → tokens. */
export const exchangeCode = (code: string) => tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });

/** Tokens, sealed for the database. */
export const sealTokens = (t: Tokens) => ({ ...t, accessToken: seal(t.accessToken), refreshToken: seal(t.refreshToken) });

/** Lets go of the connection at Intuit too (best effort — the connection here goes either way). */
export async function revoke(sealedRefreshToken: string) {
  try {
    await fetch(REVOKE, {
      method: "POST",
      headers: { Authorization: `Basic ${keys().basic}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token: unseal(sealedRefreshToken) }),
      cache: "no-store",
    });
  } catch {}
}

type Conn = { id: string; realmId: string; accessToken: string; accessExpiresAt: Date; refreshToken: string };

/**
 * A connection's API, with its access token renewed when it's about to run out. Works through the
 * system login so a renewal is saved whatever company the caller is in.
 */
export function qboApi(conn: Conn) {
  let current = conn;
  const token = async () => {
    if (current.accessExpiresAt.getTime() - Date.now() > 120_000) return unseal(current.accessToken);
    const t = await tokenCall({ grant_type: "refresh_token", refresh_token: unseal(current.refreshToken) });
    const sealed = sealTokens(t);
    current = { ...current, ...sealed };
    await systemDb.qboConnection.update({ where: { id: conn.id }, data: sealed });
    return t.accessToken;
  };

  async function call<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
    const q = new URLSearchParams({ ...init.query, minorversion: MINOR });
    const res = await fetch(`${apiBase()}/v3/company/${encodeURIComponent(conn.realmId)}/${path}?${q}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) throw new QboError("QuickBooks needs to be connected again — click Connect QuickBooks Online.", 401, true);
    const fault = (j.Fault ?? j.fault) as { Error?: { Message?: string; Detail?: string }[] } | undefined;
    if (!res.ok || fault) {
      const e = fault?.Error?.[0];
      throw new QboError(e ? [e.Message, e.Detail].filter(Boolean).join(": ") : `QuickBooks answered ${res.status}`, res.status);
    }
    return j as T;
  }

  /** Every row of a query, a page at a time. `sql` without paging ("SELECT * FROM Vendor WHERE …"). */
  async function queryAll<T = Record<string, unknown>>(entity: string, sql: string): Promise<T[]> {
    const out: T[] = [];
    for (let start = 1; ; start += 1000) {
      const j = await call<{ QueryResponse?: Record<string, unknown> }>("query", { query: { query: `${sql} STARTPOSITION ${start} MAXRESULTS 1000` } });
      const rows = (j.QueryResponse?.[entity] as T[] | undefined) ?? [];
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  /** What changed since then (up to 30 days back): entity → its changed rows (deleted ones: status "Deleted"). */
  async function changes(entities: string[], since: Date) {
    const j = await call<{ CDCResponse?: { QueryResponse?: Record<string, unknown>[] }[] }>("cdc", { query: { entities: entities.join(","), changedSince: since.toISOString() } });
    const out: Record<string, Record<string, unknown>[]> = Object.fromEntries(entities.map((e) => [e, []]));
    for (const r of j.CDCResponse ?? []) for (const q of r.QueryResponse ?? []) for (const e of entities) if (Array.isArray(q[e])) out[e].push(...(q[e] as Record<string, unknown>[]));
    return out;
  }

  return { call, queryAll, changes };
}
