import "server-only";
import { db } from "./db";
import { seal, unseal } from "./secret-box";
import { buildMime } from "./mime";
import type { Mail } from "./mail-layout";

/**
 * A person's own mailbox (Your account → My email): emails they send with a button — a bid, a PO, a
 * change order to a client — go out from their own address, land in their own Sent folder, and replies
 * come straight back to them. Send-only: the program can never read their mail.
 *
 * Gmail (Google's "send email on your behalf") and Outlook (Microsoft's Mail.Send — Outlook.com,
 * Hotmail, Microsoft 365, GoDaddy's Microsoft mail). If one stops working (disconnected, password
 * changed…), the email still goes — from the program, as before — and the mailbox is marked to
 * reconnect (Your account, and a note at the top of the page).
 *
 * Gmail needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (a Google Cloud project with the Gmail API on);
 * Outlook needs MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (an app registered in Microsoft Entra).
 */

/** Something went wrong talking to Google or Microsoft. `broken`: the connection itself is gone — reconnect. */
export class MailboxError extends Error {
  constructor(
    message: string,
    public broken: boolean,
  ) {
    super(message);
  }
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

type Provider = {
  /** Kept on the mailbox ("gmail" | "outlook"). */
  key: string;
  /** In the connect address: /api/mailbox/<route>/connect. */
  route: string;
  label: string;
  env: [string, string];
  authorize: string;
  token: string;
  scope: string;
  /** The send permission, as it comes back in the granted scopes. */
  sends: (granted: string) => boolean;
  authExtra: Record<string, string>;
  /** Microsoft wants the scopes named again when trading a code or refreshing; Google doesn't. */
  tokenScope: boolean;
  whoAmI: (token: string) => Promise<string | undefined>;
  send: (token: string, raw: string) => Promise<Response>;
  revoke?: (refresh: string) => Promise<unknown>;
};

const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

export const PROVIDERS: Record<string, Provider> = {
  gmail: {
    key: "gmail",
    route: "google",
    label: "Gmail",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: `openid email ${GMAIL_SEND}`,
    sends: (granted) => granted.split(" ").includes(GMAIL_SEND),
    // A key that keeps working after today, asked for every time (else a second connect gets none).
    authExtra: { access_type: "offline", prompt: "consent" },
    tokenScope: false,
    whoAmI: async (token) => {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? ((await r.json().catch(() => ({}))) as { email?: string }).email : undefined;
    },
    send: (token, raw) =>
      fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "message/rfc822" },
        body: raw,
      }),
    revoke: (refresh) => fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }),
  },
  outlook: {
    key: "outlook",
    route: "microsoft",
    label: "Outlook",
    env: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    // "common": work and school accounts (Microsoft 365, GoDaddy) and personal ones (Outlook.com, Hotmail).
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send",
    sends: (granted) => /(^|\s|\/)Mail\.Send(\s|$)/i.test(granted),
    authExtra: { response_mode: "query", prompt: "select_account" },
    tokenScope: true,
    whoAmI: async (token) => {
      const r = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${token}` } });
      const me = r.ok ? ((await r.json().catch(() => ({}))) as { mail?: string | null; userPrincipalName?: string }) : {};
      return me.mail || (me.userPrincipalName?.includes("@") ? me.userPrincipalName : undefined);
    },
    // The whole message, as Outlook takes it: MIME in base64. Outlook keeps a copy in Sent Items.
    send: (token, raw) =>
      fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
        body: Buffer.from(raw, "utf8").toString("base64"),
      }),
    // (Microsoft has no one-call "take back"; Disconnect forgets the key here.)
  },
};

/** By its place in the connect address ("google" | "microsoft"). */
export const providerByRoute = (route: string) => Object.values(PROVIDERS).find((p) => p.route === route);
export const providerOf = (key: string) => PROVIDERS[key] ?? PROVIDERS.gmail;

export const providerConfigured = (p: Provider) => !!(process.env[p.env[0]] && process.env[p.env[1]]);

/** The address they're sent back to — must be listed with Google / Microsoft, exactly. */
const redirectUri = (p: Provider) => new URL(`/api/mailbox/${p.route}/callback`, process.env.APP_URL || "http://localhost:3000").toString();

export function authUrl(p: Provider, state: string, hint?: string) {
  const q = new URLSearchParams({
    client_id: process.env[p.env[0]] ?? "",
    redirect_uri: redirectUri(p),
    response_type: "code",
    scope: p.scope,
    state,
    ...p.authExtra,
    ...(hint ? { login_hint: hint } : {}),
  });
  return `${p.authorize}?${q}`;
}

async function tokenCall(p: Provider, body: Record<string, string>) {
  if (p.tokenScope) body = { ...body, scope: p.scope };
  const res = await fetch(p.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env[p.env[0]] ?? "", client_secret: process.env[p.env[1]] ?? "", ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<Tokens> & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    // invalid_grant: they took the permission back, changed their password, or it ran out
    // (Google: 7 days while the app is in testing).
    const gone = json.error === "invalid_grant" || json.error === "interaction_required";
    throw new MailboxError(gone ? `${p.label} needs to be connected again` : `${p.label} said no (${json.error ?? res.status}${json.error_description ? `: ${json.error_description.slice(0, 160)}` : ""})`, gone);
  }
  return json as Tokens;
}

const until = (t: Tokens) => new Date(Date.now() + ((t.expires_in ?? 3600) - 60) * 1000);

/** Back from Google or Microsoft with a code: the keys, and which address it is. */
export async function exchangeCode(p: Provider, code: string) {
  const t = await tokenCall(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p) });
  // They can untick a permission: without "send", there's nothing to connect.
  if (!p.sends(t.scope ?? "")) throw new MailboxError("no-send", false);
  if (!t.refresh_token) throw new MailboxError(`${p.label} didn't give a lasting key`, false);
  const email = (await p.whoAmI(t.access_token))?.toLowerCase();
  if (!email) throw new MailboxError(`Couldn't tell which ${p.label} address it is`, false);
  return { provider: p.key, email, refreshToken: seal(t.refresh_token), accessToken: seal(t.access_token), accessUntil: until(t) };
}

/** Lets go of the permission there too (Disconnect), where the service allows it. Best effort. */
export async function revokeMailbox(box: { provider: string; refreshToken: string }) {
  try {
    await providerOf(box.provider).revoke?.(unseal(box.refreshToken));
  } catch {}
}

type Box = { id: string; provider: string; email: string; refreshToken: string; accessToken: string | null; accessUntil: Date | null };

async function accessFor(p: Provider, box: Box, fresh = false) {
  if (!fresh && box.accessToken && box.accessUntil && box.accessUntil.getTime() > Date.now()) return unseal(box.accessToken);
  const t = await tokenCall(p, { grant_type: "refresh_token", refresh_token: unseal(box.refreshToken) });
  // Microsoft hands a new lasting key with each refresh: keep the newest.
  await db.mailbox.update({
    where: { id: box.id },
    data: { accessToken: seal(t.access_token), accessUntil: until(t), ...(t.refresh_token ? { refreshToken: seal(t.refresh_token) } : {}) },
  });
  return t.access_token;
}

/** Sends one email through the mailbox (it lands in their Sent folder there). */
export async function sendViaMailbox(box: Box, mail: Mail) {
  const p = providerOf(box.provider);
  // Their own copy is in Sent already; a reply comes to them anyway.
  const bcc = mail.bcc?.filter((b) => b.toLowerCase() !== box.email);
  const raw = buildMime({
    from: { name: mail.fromName, email: box.email },
    to: mail.to,
    bcc,
    replyTo: mail.replyTo && mail.replyTo.toLowerCase() !== box.email ? mail.replyTo : undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments,
  });
  let res = await p.send(await accessFor(p, box), raw);
  // The short-lived key was refused: a fresh one, once (a refusal of that means the connection is gone).
  if (res.status === 401) res = await p.send(await accessFor(p, box, true), raw);
  if (!res.ok) {
    const why = await res.text().catch(() => "");
    throw new MailboxError(`${p.label} didn't send it (${res.status}${why ? `: ${why.slice(0, 200)}` : ""})`, res.status === 401 || res.status === 403);
  }
}

/**
 * Sends `mail` from this person's own mailbox, if they've connected one that works. False: it wasn't
 * (none, or it just broke — then it's marked to reconnect) and the caller sends it the usual way.
 * `trial`: on this PC, the email is only written to the test inbox, as from their address.
 */
export async function sendFromMailbox(userId: string, mail: Mail, trial?: (from: string) => Promise<void>) {
  let box;
  try {
    box = await db.mailbox.findUnique({ where: { userId } });
  } catch {
    return false;
  }
  if (!box || box.brokenAt) return false;
  try {
    if (trial) await trial(box.email);
    else await sendViaMailbox(box, mail);
    await db.mailbox.update({ where: { id: box.id }, data: { lastSentAt: new Date() } }).catch(() => {});
    return true;
  } catch (e) {
    const broken = e instanceof MailboxError && e.broken;
    console.error(`[mailbox] ${box.email}: "${mail.subject}" sent from the program instead —`, e instanceof Error ? e.message : e);
    if (broken) await db.mailbox.update({ where: { id: box.id }, data: { brokenAt: new Date(), problem: e instanceof Error ? e.message.slice(0, 300) : null } }).catch(() => {});
    return false;
  }
}
