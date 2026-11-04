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
 * Gmail for now (Google's "send email on your behalf" permission). If it stops working (they
 * disconnected it at Google, changed their password…), the email still goes — from the program, as
 * before — and the mailbox is marked to reconnect (Your account, and a note at the top of the page).
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Google Cloud project with the Gmail API on).
 */

const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const SCOPE = `openid email ${SEND_SCOPE}`;

export const gmailConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The address Google sends people back to — must be listed in the Google Cloud project, exactly. */
export const gmailRedirectUri = () => new URL("/api/mailbox/google/callback", process.env.APP_URL || "http://localhost:3000").toString();

export function gmailAuthUrl(state: string, hint?: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    // A key that keeps working after today, asked for every time (else a second connect gets none).
    access_type: "offline",
    prompt: "consent",
    state,
    ...(hint ? { login_hint: hint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Something went wrong talking to Google. `broken`: the connection itself is gone — reconnect. */
export class MailboxError extends Error {
  constructor(
    message: string,
    public broken: boolean,
  ) {
    super(message);
  }
}

async function tokenCall(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!res.ok || !json.access_token) {
    // invalid_grant: they took the permission back, or it ran out (7 days while the app is in Google's testing).
    throw new MailboxError(json.error === "invalid_grant" ? "Gmail needs to be connected again" : `Google said no (${json.error ?? res.status})`, json.error === "invalid_grant");
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

/** Back from Google with a code: the keys, and which address it is. */
export async function exchangeGmailCode(code: string) {
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: gmailRedirectUri() });
  // Google lets people untick a permission: without "send", there's nothing to connect.
  if (!t.scope?.split(" ").includes(SEND_SCOPE)) throw new MailboxError("no-send", false);
  if (!t.refresh_token) throw new MailboxError("Google didn't give a lasting key", false);
  const who = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
  const email = ((await who.json().catch(() => ({}))) as { email?: string }).email?.toLowerCase();
  if (!who.ok || !email) throw new MailboxError("Couldn't tell which Gmail address it is", false);
  return {
    email,
    refreshToken: seal(t.refresh_token),
    accessToken: seal(t.access_token),
    accessUntil: new Date(Date.now() + ((t.expires_in ?? 3600) - 60) * 1000),
  };
}

/** Lets go of the permission at Google too (Disconnect). Best effort. */
export async function revokeGmail(sealedRefresh: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(unseal(sealedRefresh))}`, { method: "POST" });
  } catch {}
}

type Box = { id: string; email: string; refreshToken: string; accessToken: string | null; accessUntil: Date | null };

async function accessFor(box: Box, fresh = false) {
  if (!fresh && box.accessToken && box.accessUntil && box.accessUntil.getTime() > Date.now()) return unseal(box.accessToken);
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: unseal(box.refreshToken) });
  await db.mailbox.update({
    where: { id: box.id },
    data: { accessToken: seal(t.access_token), accessUntil: new Date(Date.now() + ((t.expires_in ?? 3600) - 60) * 1000) },
  });
  return t.access_token;
}

/** Sends one email through the mailbox (Gmail puts it in their Sent folder). */
export async function sendViaGmail(box: Box, mail: Mail) {
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
  const send = async (fresh: boolean) =>
    fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media", {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessFor(box, fresh)}`, "Content-Type": "message/rfc822" },
      body: raw,
    });
  let res = await send(false);
  // The short-lived key was refused: a fresh one, once (a refusal of that means the connection is gone).
  if (res.status === 401) res = await send(true);
  if (!res.ok) {
    const why = await res.text().catch(() => "");
    throw new MailboxError(`Gmail didn't send it (${res.status}${why ? `: ${why.slice(0, 200)}` : ""})`, res.status === 401 || res.status === 403);
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
    else await sendViaGmail(box, mail);
    await db.mailbox.update({ where: { id: box.id }, data: { lastSentAt: new Date() } }).catch(() => {});
    return true;
  } catch (e) {
    const broken = e instanceof MailboxError && e.broken;
    console.error(`[mailbox] ${box.email}: "${mail.subject}" sent from the program instead —`, e instanceof Error ? e.message : e);
    if (broken) await db.mailbox.update({ where: { id: box.id }, data: { brokenAt: new Date(), problem: e instanceof Error ? e.message.slice(0, 300) : null } }).catch(() => {});
    return false;
  }
}
