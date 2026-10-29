import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { pushOffList, sitePath, type PushKind } from "./push-kinds";

export { PUSH_KINDS, kindsFor, pushOffList, type PushKind } from "./push-kinds";

/**
 * Phone notifications (web push): the app on someone's home screen — or a browser they allowed —
 * buzzes when something's waiting for them. Sent alongside the emails (notify.ts, notify-client.ts):
 * the email is the record, the buzz is the nudge.
 *
 * The keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) identify The Builder Station to Apple's, Google's and
 * Mozilla's push services; without them nothing is sent and the "Turn on notifications" button hides.
 * Like an email, a notification that can't be sent never stops the work.
 */

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;
export const pushReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return true;
  if (!pushReady()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@thebuilderstation.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
  return true;
}

export type PushNote = { title: string; body: string; url: string };

/**
 * Sends a notification to the people with these sign-in emails (the current company's) — each of their
 * devices, unless they've turned this kind off. Devices the push service says are gone are removed.
 */
export async function pushToEmails(emails: string[], kind: PushKind, note: PushNote) {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!list.length || !configure()) return 0;
  try {
    const people = await db.user.findMany({ where: { email: { in: list }, active: true }, select: { id: true, pushOff: true, pushDevices: true } });
    let sent = 0;
    const payload = JSON.stringify({ title: note.title.slice(0, 120), body: note.body.slice(0, 300), url: sitePath(note.url), tag: kind });
    for (const p of people) {
      if (pushOffList(p.pushOff).includes(kind)) continue;
      for (const d of p.pushDevices) {
        try {
          await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 24 * 3600, urgency: "normal" });
          await db.pushDevice.update({ where: { id: d.id }, data: { lastSentAt: new Date() } });
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410: the phone dropped it (app removed, notifications turned off there).
          if (status === 404 || status === 410) await db.pushDevice.delete({ where: { id: d.id } }).catch(() => {});
          else console.error(`[push] "${note.title}" failed:`, status ?? (e instanceof Error ? e.message : e));
        }
      }
    }
    return sent;
  } catch (e) {
    console.error("[push] failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}
