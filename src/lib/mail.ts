import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";

/**
 * Email. Where it goes depends on MAIL:
 *   outbox (default on this PC)  saved to ./.outbox — read them at /dev/outbox; nothing is sent
 *   resend (online)              sent through Resend (RESEND_API_KEY, from MAIL_FROM)
 * Links in emails point at APP_URL (e.g. https://thebuilderstation.com).
 */

import { fromLine, type Mail } from "./mail-layout";
export { fromLine, simpleEmail, type Mail, type MailSection } from "./mail-layout";

const mode = () => (process.env.MAIL || (process.env.NODE_ENV === "production" ? "resend" : "outbox")).toLowerCase();
const outboxDir = () => path.join(process.cwd(), ".outbox");

export function appUrl(pathname: string) {
  return new URL(pathname, process.env.APP_URL || "http://localhost:3000").toString();
}

export async function sendMail(mail: Mail) {
  if (mode() === "outbox") {
    await fs.mkdir(outboxDir(), { recursive: true });
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    // (Attachments kept by name and size only — the test inbox doesn't need the files.)
    const attachments = mail.attachments?.map((a) => ({ filename: a.filename, size: Math.round((a.content.length * 3) / 4) }));
    await fs.writeFile(path.join(outboxDir(), `${id}.json`), JSON.stringify({ id, at: new Date().toISOString(), ...mail, attachments }, null, 2));
    return;
  }
  if (mode() === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Email isn't set up (RESEND_API_KEY)");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromLine(mail.fromName),
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Couldn't send the email (${res.status})`);
    return;
  }
  throw new Error(`Unknown MAIL setting "${mode()}"`);
}

/** The test inbox (this PC only). */
export async function outbox(): Promise<(Mail & { id: string; at: string })[]> {
  if (mode() !== "outbox") return [];
  let names: string[] = [];
  try {
    names = (await fs.readdir(outboxDir())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(names.map(async (n) => JSON.parse(await fs.readFile(path.join(outboxDir(), n), "utf8"))));
  return all.sort((a, b) => b.at.localeCompare(a.at));
}
